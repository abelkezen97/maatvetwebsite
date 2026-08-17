import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import {
  mapCustomerFromDb,
  mapInvoiceFromDb,
  mapReceiptFromDb,
  mapQuoteFromDb,
} from "@/lib/db/mappers";
import { Invoice, Receipt, Quote } from "@/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewCustomers(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view customer" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    let { data: customerRow, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !customerRow) {
      const adminClient = createAdminClient();
      if (adminClient) {
        const res = await adminClient
          .from("customers")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        customerRow = res.data;
        error = res.error;
      }
    }

    if (error || !customerRow) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // SERVER-SIDE ROLE AUTHORIZATION & OWNERSHIP ENFORCEMENT
    if (profile.role === "salesperson") {
      if (
        customerRow.country !== profile.country ||
        customerRow.assigned_salesman_id !== profile.id
      ) {
        return NextResponse.json(
          { error: "Forbidden: Cannot access another salesperson's customer" },
          { status: 403 }
        );
      }
    } else if (profile.role === "accountant") {
      if (customerRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot access customer in another country" },
          { status: 403 }
        );
      }
    }

    // Parallel fetch for workspace records
    const [profilesRes, invoicesRes, receiptsRes, quotationsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, country"),
      supabase
        .from("invoices")
        .select("*, invoice_items(*, products(name, unit, sku))")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("receipts")
        .select("*")
        .eq("customer_id", id)
        .order("payment_date", { ascending: false }),
      supabase
        .from("quotations")
        .select("*")
        .eq("customer_id", id)
        .order("quotation_date", { ascending: false }),
    ]);

    const profileRows = profilesRes.data || [];
    const salesmanMap = new Map<string, string>();
    const roleMap = new Map<string, string>();
    profileRows.forEach((p: any) => {
      if (p.id) {
        if (p.full_name) salesmanMap.set(p.id, p.full_name);
        if (p.role) roleMap.set(p.id, p.role);
      }
    });

    const customer = mapCustomerFromDb(customerRow, salesmanMap);
    if (customerRow.assigned_salesman_id) {
      const assignedRole = roleMap.get(customerRow.assigned_salesman_id);
      customer.assignedSalesmanRole = assignedRole;
      if (assignedRole !== "salesperson") {
        customer.assignedSalesmanName = undefined;
      }
    } else {
      customer.assignedSalesmanName = undefined;
      customer.assignedSalesmanRole = undefined;
    }
    const createdByName = customerRow.created_by ? salesmanMap.get(customerRow.created_by) || null : null;
    const updatedByName = customerRow.updated_by ? salesmanMap.get(customerRow.updated_by) || null : null;

    let invoicesRows = invoicesRes.data || [];
    if (invoicesRes.error) {
      const fallbackInv = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });
      invoicesRows = fallbackInv.data || [];
    }
    const receiptsRows = receiptsRes.data || [];
    const quotationsRows = quotationsRes.data || [];

    const mappedInvoices: Invoice[] = invoicesRows
      .filter((inv: any) => !inv.is_deleted)
      .map((row: any) => mapInvoiceFromDb(row, salesmanMap));

    const mappedReceipts: Receipt[] = receiptsRows
      .filter((rec: any) => !rec.is_deleted)
      .map((row: any) => mapReceiptFromDb(row, salesmanMap));

    const mappedQuotations: Quote[] = quotationsRows
      .filter((q: any) => !q.is_deleted)
      .map((row: any) => mapQuoteFromDb(row, salesmanMap));

    // Calculate Authoritative Financial Metrics
    const paidInvoiceIds = new Set<string>();
    mappedInvoices.forEach((inv) => {
      if (inv.status === "Paid") {
        paidInvoiceIds.add(inv.id);
      }
    });

    const activeCreditInvoices = mappedInvoices.filter(
      (inv) =>
        (inv.status as string) !== "Cancelled" &&
        inv.status !== "Paid" &&
        (inv.status === "Credit" || (inv.creditDays && Number(inv.creditDays) > 0))
    );

    const activeReceiptsForBalance = mappedReceipts.filter(
      (rec) => !rec.invoiceId || !paidInvoiceIds.has(rec.invoiceId)
    );

    const creditInvoicesSum = activeCreditInvoices.reduce(
      (sum, inv) => sum + (Number(inv.grandTotal) || 0),
      0
    );
    const totalReceiptsSum = mappedReceipts.reduce(
      (sum, rec) => sum + (Number(rec.amountPaid) || 0),
      0
    );

    const openingBalance =
      customer.openingBalance !== undefined && customer.openingBalance !== null
        ? customer.openingBalance
        : customer.pendingBillwiseAmount || 0;

    const collectionsSum = activeReceiptsForBalance.reduce(
      (sum, rec) => sum + (Number(rec.amountPaid) || 0),
      0
    );

    const calculatedPendingBalance = Math.max(
      0,
      openingBalance + creditInvoicesSum - collectionsSum
    );

    const pendingBalance =
      customer.pendingBillwiseAmount !== undefined && customer.pendingBillwiseAmount !== null
        ? customer.pendingBillwiseAmount
        : calculatedPendingBalance;

    const totalInvoiced = mappedInvoices
      .filter((inv) => (inv.status as string) !== "Cancelled")
      .reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);

    const lastPayment =
      mappedReceipts.length > 0
        ? {
            amountPaid: mappedReceipts[0].amountPaid,
            paymentDate: mappedReceipts[0].paymentDate,
            paymentMethod: mappedReceipts[0].paymentMethod,
            referenceNo: mappedReceipts[0].referenceNo,
            receiptNumber: mappedReceipts[0].receiptNumber,
          }
        : null;

    const lastInvoice =
      mappedInvoices.length > 0
        ? {
            invoiceNumber: mappedInvoices[0].invoiceNumber,
            grandTotal: mappedInvoices[0].grandTotal,
            date: mappedInvoices[0].date,
            status: mappedInvoices[0].status,
          }
        : null;

    // Outstanding Invoices & Payment Track
    const receiptsByInvoiceId = new Map<string, number>();
    mappedReceipts.forEach((rec) => {
      if (rec.invoiceId && !rec.isDeleted) {
        const current = receiptsByInvoiceId.get(rec.invoiceId) || 0;
        receiptsByInvoiceId.set(rec.invoiceId, current + rec.amountPaid);
      }
    });

    mappedInvoices.forEach((inv) => {
      const paidAmount = Math.min(inv.grandTotal, receiptsByInvoiceId.get(inv.id) || 0);
      const outstandingAmount = Math.max(0, inv.grandTotal - paidAmount);
      inv.paidAmount = paidAmount;
      inv.outstandingAmount = outstandingAmount;
      if (outstandingAmount <= 0.009 || paidAmount >= inv.grandTotal) {
        if ((inv.status as string) !== "Cancelled") {
          inv.status = "Paid";
        }
      }
    });

    const outstandingInvoices = mappedInvoices
      .filter((inv) => inv.status !== "Paid" && (inv.status as string) !== "Cancelled" && (inv.outstandingAmount ?? 0) > 0.009)
      .map((inv) => {
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          date: inv.date,
          grandTotal: inv.grandTotal,
          paidAmount: inv.paidAmount ?? 0,
          outstandingAmount: inv.outstandingAmount ?? 0,
          status: inv.status,
          creditDays: inv.creditDays,
        };
      });

    // Top 10 Products Purchased (Historical Pricing, Rank by SUM(quantity))
    const validInvoices = mappedInvoices.filter((inv) => (inv.status as string) !== "Cancelled");

    interface ProductAgg {
      productId: string;
      productName: string;
      totalQuantity: number;
      totalSpend: number;
      lastPrice: number;
      lastDate: string;
    }

    const productMap = new Map<string, ProductAgg>();

    validInvoices.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        if (!item.productId && !item.productName) return;
        const key = item.productId || item.productName;
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.price ?? item.discountPrice) || 0;
        const lineTotal = item.total !== undefined ? item.total : qty * unitPrice;

        const existing = productMap.get(key);
        if (!existing) {
          productMap.set(key, {
            productId: item.productId || "",
            productName: item.productName || "Product",
            totalQuantity: qty,
            totalSpend: lineTotal,
            lastPrice: unitPrice,
            lastDate: inv.date || "",
          });
        } else {
          existing.totalQuantity += qty;
          existing.totalSpend += lineTotal;
          if (!existing.lastDate || (inv.date && inv.date >= existing.lastDate)) {
            existing.lastPrice = unitPrice;
            existing.lastDate = inv.date || existing.lastDate;
          }
        }
      });
    });

    const topProducts = Array.from(productMap.values())
      .map((p) => ({
        productId: p.productId,
        productName: p.productName,
        totalQuantity: p.totalQuantity,
        averagePrice: p.totalQuantity > 0 ? p.totalSpend / p.totalQuantity : 0,
        lastPrice: p.lastPrice,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);

    // Last Purchase Detail
    let lastPurchase: {
      productName: string;
      quantity: number;
      invoiceNumber: string;
      date: string;
      unitPrice: number;
    } | null = null;

    if (validInvoices.length > 0) {
      const sortedInvoices = [...validInvoices].sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });

      for (const inv of sortedInvoices) {
        if (inv.items && inv.items.length > 0) {
          const firstItem = inv.items[0];
          lastPurchase = {
            productName: firstItem.productName || "Product",
            quantity: firstItem.quantity,
            invoiceNumber: inv.invoiceNumber,
            date: inv.date,
            unitPrice: firstItem.price,
          };
          break;
        }
      }
    }

    // Unified Recent Activity timeline
    interface ActivityItem {
      id: string;
      type: "quotation" | "invoice" | "receipt";
      refNumber: string;
      date: string;
      amount: number;
      status: string;
      details?: string;
    }

    const activityItems: ActivityItem[] = [];

    mappedInvoices.forEach((inv) => {
      activityItems.push({
        id: inv.id,
        type: "invoice",
        refNumber: inv.invoiceNumber,
        date: inv.date,
        amount: inv.grandTotal,
        status: inv.status,
      });
    });

    mappedReceipts.forEach((rec) => {
      activityItems.push({
        id: rec.id,
        type: "receipt",
        refNumber: rec.receiptNumber,
        date: rec.paymentDate,
        amount: rec.amountPaid,
        status: rec.paymentMethod,
        details: rec.referenceNo ? `Ref: ${rec.referenceNo}` : undefined,
      });
    });

    mappedQuotations.forEach((q) => {
      activityItems.push({
        id: q.id,
        type: "quotation",
        refNumber: q.quoteNumber,
        date: q.date,
        amount: q.grandTotal,
        status: q.status,
      });
    });

    const recentActivity = activityItems
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 10);

    return NextResponse.json({
      customer,
      financialSummary: {
        pendingBalance,
        totalInvoiced,
        totalPaid: totalReceiptsSum,
        creditInvoicesSum,
        outstandingInvoicesCount: outstandingInvoices.length,
        receiptCount: mappedReceipts.length,
        lastPayment,
        lastInvoice,
      },
      outstandingInvoices,
      topProducts,
      lastPurchase,
      recentActivity,
      allInvoices: mappedInvoices,
      allReceipts: mappedReceipts,
      allQuotations: mappedQuotations,
      auditContext: {
        createdByName,
        updatedByName,
        createdAt: customerRow.created_at || "",
        updatedAt: customerRow.updated_at || undefined,
      },
      userRole: profile.role,
      currentUserId: profile.id,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error loading customer detail workspace:", error);
    return NextResponse.json({ error: "Failed to load customer workspace" }, { status: 500 });
  }
}

