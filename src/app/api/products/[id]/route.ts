import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapProductFromDb, mapProductToDb } from "@/lib/db/mappers";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase: userClient } = await requireAuth();

    if (!Permissions.canViewProducts(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view products" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const queryClient = createAdminClient() || userClient;

    // 1. Fetch Product Master Data
    const { data: productRow, error: prodErr } = await queryClient
      .from("products")
      .select("*, product_categories!left(id, name)")
      .eq("id", id)
      .maybeSingle();

    if (prodErr || !productRow) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const product = mapProductFromDb(productRow);

    // 2. Fetch Inventory Transactions for this Product
    let movementsQuery = queryClient
      .from("inventory_transactions")
      .select("*, profiles!created_by(full_name)")
      .eq("product_id", id)
      .order("created_at", { ascending: false });

    if (profile.role === "salesperson") {
      movementsQuery = movementsQuery.eq("country", profile.country);
    }

    let { data: movementsData, error: movErr } = await movementsQuery;
    if (movErr) {
      movementsData = [];
    }

    // Load creator profiles lookup map
    const { data: profileRows } = await queryClient.from("profiles").select("id, full_name");
    const profileMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) profileMap.set(p.id, p.full_name);
    });

    // 3. Aggregate Inventory Summary & Stock Balances
    let openingStock = 0;
    let stockReceived = 0;
    let unitsSoldMovement = 0;
    let salesReturns = 0;
    let adjustmentsIn = 0;
    let adjustmentsOut = 0;
    let uaeStock = 0;
    let omanStock = 0;

    const formattedMovements = (movementsData || []).map((m: any) => {
      const qty = Number(m.quantity) || 0;
      const rawType = String(m.transaction_type || m.movement_type || "Adjustment");
      const typeUpper = rawType.toUpperCase().trim();
      const ctry = String(m.country);

      if (ctry === "Oman") {
        omanStock += qty;
      } else {
        uaeStock += qty;
      }

      if (typeUpper === "OPENING STOCK" || typeUpper === "OPENING_STOCK") openingStock += qty;
      else if (typeUpper === "PURCHASE" || typeUpper === "STOCK_RECEIVED") stockReceived += qty;
      else if (typeUpper === "SALE") unitsSoldMovement += Math.abs(qty);
      else if (typeUpper === "RETURN" || typeUpper === "SALE_RETURN") salesReturns += qty;
      else if (typeUpper === "ADJUSTMENT" || typeUpper === "ADJUSTMENT_IN") adjustmentsIn += qty;
      else if (typeUpper === "DAMAGE" || typeUpper === "EXPIRY" || typeUpper === "ADJUSTMENT_OUT" || typeUpper === "TRANSFER" || typeUpper === "TRANSFER_OUT") {
        adjustmentsOut += Math.abs(qty);
      }

      return {
        id: String(m.id),
        date: m.created_at ? String(m.created_at).split("T")[0] : "",
        createdAt: m.created_at,
        movementType: rawType,
        quantity: qty,
        location: ctry,
        referenceType: m.reference_type || "",
        referenceId: m.reference_id || "",
        reason: m.remarks || "",
        notes: m.remarks || "",
        createdByName: (m.created_by && profileMap.get(m.created_by)) || m.profiles?.full_name || "System",
      };
    });

    // Authoritative stock is calculated strictly from transaction ledger
    const totalStock = profile.role === "salesperson"
      ? (profile.country === "Oman" ? omanStock : uaeStock)
      : (uaeStock + omanStock);

    // 4. Fetch Confirmed Sales (Invoices + Invoice Items) for this Product
    let invItemsQuery = queryClient
      .from("invoice_items")
      .select("*, invoices!inner(id, invoice_number, created_at, country, status, is_deleted, customer_id, salesman_id, customers!left(id, doctor_name, company_name))")
      .eq("product_id", id);

    if (profile.role === "salesperson") {
      invItemsQuery = invItemsQuery.eq("invoices.country", profile.country).eq("invoices.salesman_id", profile.id);
    }

    const { data: rawInvItems } = await invItemsQuery;

    // Filter confirmed sales only (excluding is_deleted=true or status='Cancelled' or 'Draft')
    const confirmedItems = (rawInvItems || []).filter((ii: any) => {
      const inv = ii.invoices;
      if (!inv) return false;
      if (inv.is_deleted === true) return false;
      if (inv.status === "Cancelled" || inv.status === "DRAFT" || inv.status === "Draft") return false;
      return true;
    });

    // Compute Date Boundaries
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let unitsSold7d = 0;
    let unitsSold30d = 0;
    let unitsSold90d = 0;
    let totalUnitsSold = 0;
    let uaeUnitsSold30d = 0;
    let omanUnitsSold30d = 0;
    let uaeLastSale: string | null = null;
    let omanLastSale: string | null = null;

    // Sort items newest date first
    confirmedItems.sort((a: any, b: any) => {
      const dateA = new Date(a.invoices?.created_at || 0).getTime();
      const dateB = new Date(b.invoices?.created_at || 0).getTime();
      return dateB - dateA;
    });

    const uniqueCustomerIds = new Set<string>();
    const recentCustomersMap = new Map<string, any>();
    const salesHistory: any[] = [];

    confirmedItems.forEach((item: any) => {
      const inv = item.invoices;
      const itemQty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const discount = Number(item.discount) || 0;
      const lineTotal = item.line_total !== undefined && item.line_total !== null
        ? Number(item.line_total)
        : itemQty * Math.max(0, unitPrice - discount);

      const invDateStr = inv.created_at ? String(inv.created_at).split("T")[0] : "";
      const invDate = new Date(inv.created_at || 0);

      totalUnitsSold += itemQty;

      if (invDate >= d7) unitsSold7d += itemQty;
      if (invDate >= d30) {
        unitsSold30d += itemQty;
        if (inv.country === "Oman") omanUnitsSold30d += itemQty;
        else uaeUnitsSold30d += itemQty;
      }
      if (invDate >= d90) unitsSold90d += itemQty;

      if (inv.country === "Oman") {
        if (!omanLastSale) omanLastSale = invDateStr;
      } else {
        if (!uaeLastSale) uaeLastSale = invDateStr;
      }

      if (inv.customer_id) {
        uniqueCustomerIds.add(inv.customer_id);
        const custDocName = inv.customers?.doctor_name || "Customer";
        const custCompName = inv.customers?.company_name || "";

        if (!recentCustomersMap.has(inv.customer_id)) {
          recentCustomersMap.set(inv.customer_id, {
            customerId: inv.customer_id,
            doctorName: custDocName,
            companyName: custCompName,
            customerName: custDocName,
            lastPurchaseDate: invDateStr,
            quantity: itemQty,
            lastPurchaseNet: lineTotal,
            invoiceNumber: inv.invoice_number,
          });
        }
      }

      salesHistory.push({
        id: item.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        date: invDateStr,
        customerId: inv.customer_id || "",
        doctorName: inv.customers?.doctor_name || "Customer",
        companyName: inv.customers?.company_name || "",
        customerName: inv.customers?.doctor_name || "Customer",
        country: inv.country || "UAE",
        quantity: itemQty,
        unitPrice: unitPrice, // Stored historical invoice item price
        discount: discount,
        lineTotal: lineTotal,
      });
    });

    const lastSaleItem = confirmedItems[0];
    const lastCustomer = lastSaleItem && lastSaleItem.invoices?.customers ? {
      id: lastSaleItem.invoices.customer_id,
      doctorName: lastSaleItem.invoices.customers.doctor_name || "",
      companyName: lastSaleItem.invoices.customers.company_name || "",
      customerName: lastSaleItem.invoices.customers.doctor_name || lastSaleItem.invoices.customers.company_name || "Customer",
      date: lastSaleItem.invoices.created_at ? String(lastSaleItem.invoices.created_at).split("T")[0] : "",
      quantity: Number(lastSaleItem.quantity) || 0,
      invoiceNumber: lastSaleItem.invoices.invoice_number,
    } : null;

    // 5. Calculate Relative / Fallback Movement Velocity Status
    const { data: allActive30dSales } = await queryClient
      .from("invoice_items")
      .select("product_id, quantity, invoices!inner(created_at, is_deleted, status)")
      .gte("invoices.created_at", d30.toISOString());

    const product30dMap = new Map<string, number>();
    (allActive30dSales || []).forEach((ii: any) => {
      const inv = ii.invoices;
      if (!inv || inv.is_deleted === true || inv.status === "Cancelled" || inv.status === "Draft") return;
      const pid = String(ii.product_id);
      const q = Number(ii.quantity) || 0;
      product30dMap.set(pid, (product30dMap.get(pid) || 0) + q);
    });

    const salesCounts = Array.from(product30dMap.values()).filter((c) => c > 0).sort((a, b) => b - a);

    let movementStatus: "HIGH MOVING" | "FAST MOVING" | "NORMAL MOVING" | "SLOW MOVING" | "NO RECENT SALES" = "NO RECENT SALES";
    let statusReason = "";

    if (unitsSold30d === 0) {
      movementStatus = "NO RECENT SALES";
      statusReason = "No confirmed sales in the last 30 days";
    } else if (salesCounts.length >= 5) {
      const rankIndex = salesCounts.indexOf(unitsSold30d);
      const percentile = rankIndex >= 0 ? rankIndex / salesCounts.length : 1;

      if (percentile <= 0.20) {
        movementStatus = "HIGH MOVING";
      } else if (percentile <= 0.40) {
        movementStatus = "FAST MOVING";
      } else if (percentile <= 0.80) {
        movementStatus = "NORMAL MOVING";
      } else {
        movementStatus = "SLOW MOVING";
      }
      statusReason = `${unitsSold30d} units sold in the last 30 days`;
    } else {
      if (unitsSold30d >= 30) {
        movementStatus = "HIGH MOVING";
      } else if (unitsSold30d >= 15) {
        movementStatus = "FAST MOVING";
      } else if (unitsSold30d >= 5) {
        movementStatus = "NORMAL MOVING";
      } else {
        movementStatus = "SLOW MOVING";
      }
      statusReason = `${unitsSold30d} units sold in the last 30 days`;
    }

    // 6. Stock Status & Risk Warning
    let stockStatus: "IN STOCK" | "LOW STOCK" | "OUT OF STOCK" = "IN STOCK";
    if (totalStock <= 0) {
      stockStatus = "OUT OF STOCK";
    } else if (totalStock <= 10) {
      stockStatus = "LOW STOCK";
    }

    let stockRisk: string | null = null;
    if ((movementStatus === "HIGH MOVING" || movementStatus === "FAST MOVING") && totalStock <= 10) {
      stockRisk = "⚠️ LOW STOCK — REPLENISHMENT MAY BE REQUIRED";
    }

    // 7. Location Scoped Stock
    const canViewGlobal = profile.role === "super_admin" || profile.role === "accountant";
    const userCountry = profile.country;

    const locationStock = {
      uae: (canViewGlobal || userCountry === "UAE") ? {
        currentStock: uaeStock,
        unitsSold30d: uaeUnitsSold30d,
        lastSale: uaeLastSale,
      } : null,
      oman: (canViewGlobal || userCountry === "Oman") ? {
        currentStock: omanStock,
        unitsSold30d: omanUnitsSold30d,
        lastSale: omanLastSale,
      } : null,
    };

    return NextResponse.json({
      product,
      stockSummary: {
        uaeStock: (canViewGlobal || userCountry === "UAE") ? uaeStock : 0,
        omanStock: (canViewGlobal || userCountry === "Oman") ? omanStock : 0,
        totalStock: canViewGlobal ? (uaeStock + omanStock) : (userCountry === "Oman" ? omanStock : uaeStock),
      },
      movementStatus,
      statusReason,
      stockStatus,
      stockRisk,
      salesVelocity: {
        unitsSold7d,
        unitsSold30d,
        unitsSold90d,
        totalUnitsSold,
        lastSaleDate: lastSaleItem?.invoices?.created_at ? String(lastSaleItem.invoices.created_at).split("T")[0] : null,
        lastCustomer,
        uniqueCustomersCount: uniqueCustomerIds.size,
      },
      inventorySummary: {
        openingStock,
        stockReceived,
        unitsSold: unitsSoldMovement,
        salesReturns,
        adjustmentsIn,
        adjustmentsOut,
        currentStock: totalStock,
      },
      locationStock,
      lastCustomer,
      recentCustomers: Array.from(recentCustomersMap.values()),
      recentMovements: formattedMovements,
      salesHistory,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error fetching product analytics:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch product details" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    if (profile.role === "salesperson") {
      return NextResponse.json({ error: "Forbidden: Salesperson cannot edit products" }, { status: 403 });
    }

    const body = await request.json();

    const nonPriceFields = [
      "name",
      "productCode",
      "product_code",
      "sku",
      "barcode",
      "categoryId",
      "category_id",
      "category",
      "unit",
      "brand",
      "manufacturer",
      "description",
      "isAvailable",
      "isActive",
      "is_active",
      "costPrice",
      "cost_price",
    ];

    if (profile.role === "accountant") {
      const hasNonPriceEdits = nonPriceFields.some((field) => body[field] !== undefined);
      if (hasNonPriceEdits) {
        return NextResponse.json(
          { error: "Forbidden: Accountant is allowed to edit product prices only" },
          { status: 403 }
        );
      }
    }

    if (profile.role !== "super_admin" && profile.role !== "accountant") {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    let updatePayload: Record<string, any> = {};

    if (profile.role === "accountant") {
      if (body.price !== undefined || body.sellingPrice !== undefined || body.selling_price !== undefined) {
        updatePayload.selling_price = Number(body.price ?? body.sellingPrice ?? body.selling_price) || 0;
      }
      if (body.price10 !== undefined || body.price_10 !== undefined) {
        updatePayload.price_10 = body.price10 ?? body.price_10;
      }
      if (body.price50 !== undefined || body.price_50 !== undefined) {
        updatePayload.price_50 = body.price50 ?? body.price_50;
      }
      if (body.price100 !== undefined || body.price_100 !== undefined) {
        updatePayload.price_100 = body.price100 ?? body.price_100;
      }
    } else {
      updatePayload = mapProductToDb(body);
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", id)
      .select("*, product_categories!left(id, name)")
      .single();

    if (error) {
      console.error("Supabase product update error:", error);
      return NextResponse.json({ error: error.message || "Failed to update product" }, { status: 500 });
    }

    const updatedProduct = mapProductFromDb(data);
    return NextResponse.json({ success: true, product: updatedProduct });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating product:", error);
    return NextResponse.json({ error: error.message || "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only super_admin can deactivate products" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("products")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Supabase product delete error:", error);
      return NextResponse.json({ error: error.message || "Failed to deactivate product" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Product deactivated successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting product:", error);
    return NextResponse.json({ error: error.message || "Failed to deactivate product" }, { status: 500 });
  }
}
