import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions, isCountryStaff } from "@/lib/auth/permissions";
import { mapReceiptFromDb, mapReceiptToDb } from "@/lib/db/mappers";
import { recalculateCustomerBalance } from "@/lib/db/balances";
import { nextReceiptNumber, nextSeriesNumber } from "@/lib/db/documentSeries";
import { BillingSeries } from "@/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { profile, supabase: userClient } = await requireAuth();
    const { searchParams } = new URL(request.url);
    // ?cheques=pending  -> cheques not yet cleared or bounced
    // ?cheques=in-hand  -> pending cheques still with the salesperson (not received by the office)
    const chequeFilter = searchParams.get("cheques");

    if (!Permissions.canViewReceipts(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view receipts" }, { status: 403 });
    }

    const queryClient = createAdminClient() || userClient;

    let query = queryClient
      .from("receipts")
      .select("*, customers!left(company_name, doctor_name, pending_balance, assigned_salesman_id), invoices!fk_receipts_invoice(invoice_number, salesman_id), receipt_allocations(invoice_id, amount, invoices(invoice_number))")
      .order("created_at", { ascending: false });

    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country);
    } else if (isCountryStaff(profile)) {
      query = query.eq("country", profile.country);
    }

    if (chequeFilter === "pending" || chequeFilter === "in-hand") {
      query = query.eq("cheque_status", "Pending");
    }
    if (chequeFilter === "in-hand") {
      query = query.is("cheque_received_at", null);
      if (profile.role === "salesperson") query = query.eq("created_by", profile.id);
    }

    let { data, error } = await query.eq("is_deleted", false);

    // Resilient fallback if is_deleted or country column does not exist yet in live DB
    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      let fallbackQuery = queryClient
        .from("receipts")
        .select("*, customers!left(company_name, doctor_name, pending_balance, assigned_salesman_id), invoices!fk_receipts_invoice(invoice_number, salesman_id), receipt_allocations(invoice_id, amount, invoices(invoice_number))")
        .order("created_at", { ascending: false });

      if (profile.role === "salesperson" || isCountryStaff(profile)) {
        fallbackQuery = fallbackQuery.eq("country", profile.country);
      }
      const res = await fallbackQuery;
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error("Failed to load Supabase receipts:", error);
      return NextResponse.json([]);
    }

    let rawReceipts = data || [];

    // Server-side salesperson ownership post-filtering
    if (profile.role === "salesperson") {
      rawReceipts = rawReceipts.filter((row: any) => {
        const isCreatedBy = row.created_by === profile.id;
        const isInvoiceOwner = row.invoices?.salesman_id === profile.id;
        const isCustomerOwner = row.customers?.assigned_salesman_id === profile.id;
        return isCreatedBy || isInvoiceOwner || isCustomerOwner;
      });
    }

    const { data: profileRows } = await queryClient.from("profiles").select("id, full_name");
    const salesmanMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) salesmanMap.set(p.id, p.full_name);
    });

    const receipts = rawReceipts.map((row: any) => mapReceiptFromDb(row, salesmanMap));
    return NextResponse.json(receipts);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch receipts from Supabase:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canCreateReceipt(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot create receipt" }, { status: 403 });
    }

    const payload = await request.json();

    let receiptNumber = payload.receiptNumber;
    
    // Check if candidate client receipt number already exists in DB
    let isClientNumTaken = false;
    if (receiptNumber) {
      const { data: existingByNum } = await supabase
        .from("receipts")
        .select("id")
        .eq("receipt_number", receiptNumber)
        .maybeSingle();
      if (existingByNum?.id) {
        isClientNumTaken = true;
      }
    }

    const clientNumberUsable = Boolean(receiptNumber) && !isClientNumTaken;

    const customerId = payload.customerId || null;
    const invoiceId = payload.invoiceId || null;
    const amountPaid = Number(payload.amountPaid || 0);
    if (amountPaid <= 0) {
      return NextResponse.json(
        { error: "Receipt payment amount must be greater than 0" },
        { status: 400 }
      );
    }

    const paymentDate = payload.paymentDate || new Date().toISOString().split("T")[0];
    const paymentMethod = payload.paymentMethod || "Cash";
    const referenceNo = payload.referenceNo || payload.reference_number || "";
    const notes = payload.notes || "";

    // Cheques: number and date are required; the cheque counts as paid only once cleared.
    const isCheque = paymentMethod === "Cheque";
    const chequeNumber = String(payload.chequeNumber || "").trim();
    const chequeDate = String(payload.chequeDate || "").trim();
    const bankName = String(payload.bankName || "").trim();
    if (isCheque && (!chequeNumber || !chequeDate)) {
      return NextResponse.json({ error: "Cheque number and cheque date are required for cheque payments." }, { status: 400 });
    }

    // Allocations: which invoices this payment settles. Older clients send a single invoiceId.
    type RequestedAllocation = { invoiceId: string; amount?: number };
    const requestedAllocations: RequestedAllocation[] = Array.isArray(payload.allocations)
      ? payload.allocations
          .filter((a: any) => a && a.invoiceId)
          .map((a: any) => ({ invoiceId: String(a.invoiceId), amount: a.amount === undefined || a.amount === null || a.amount === "" ? undefined : Number(a.amount) }))
      : invoiceId
        ? [{ invoiceId: String(invoiceId) }]
        : [];

    // 1. Invoice & Customer Integrity & Ownership Verification
    if (invoiceId) {
      const { data: invRow, error: invErr } = await supabase
        .from("invoices")
        .select("id, customer_id, country, salesman_id")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invErr || !invRow) {
        return NextResponse.json({ error: "Linked invoice not found" }, { status: 400 });
      }

      if (profile.role === "salesperson") {
        if (invRow.country !== profile.country || invRow.salesman_id !== profile.id) {
          return NextResponse.json(
            { error: "Forbidden: Cannot create receipt for another salesperson's invoice" },
            { status: 403 }
          );
        }
      } else if (isCountryStaff(profile) && invRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot create receipt for invoice in another country" },
          { status: 403 }
        );
      }

      if (customerId && invRow.customer_id && invRow.customer_id !== customerId) {
        return NextResponse.json(
          { error: "Invoice/Customer Integrity Violation: Selected invoice belongs to another customer." },
          { status: 400 }
        );
      }
    }

    let assignedSalesmanId: string | null = null;
    if (customerId) {
      let { data: fetchedCust, error: custErr } = await supabase
        .from("customers")
        .select("id, country, assigned_salesman_id, cash_only")
        .eq("id", customerId)
        .maybeSingle();

      if ((custErr || !fetchedCust) && createAdminClient()) {
        const adminClient = createAdminClient();
        if (adminClient) {
          const { data: adminCust } = await adminClient
            .from("customers")
            .select("id, country, assigned_salesman_id, cash_only")
            .eq("id", customerId)
            .maybeSingle();
          fetchedCust = adminCust;
          custErr = null;
        }
      }

      const custRow = fetchedCust;
      assignedSalesmanId = custRow?.assigned_salesman_id || null;

      if (custErr || !custRow) {
        return NextResponse.json({ error: "Linked customer not found" }, { status: 400 });
      }

      if (profile.role === "salesperson") {
        if (custRow.country !== profile.country || custRow.assigned_salesman_id !== profile.id) {
          return NextResponse.json(
            { error: "Forbidden: Cannot create receipt for another salesperson's customer" },
            { status: 403 }
          );
        }
      } else if (isCountryStaff(profile) && custRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot create receipt for customer in another country" },
          { status: 403 }
        );
      }

      if (isCheque && custRow.cash_only) {
        return NextResponse.json(
          { error: "This customer is cash only after a bounced cheque. Cheque payments are not accepted until an admin removes the flag." },
          { status: 400 }
        );
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "A customer is required for a receipt." }, { status: 400 });
    }

    // Validate allocations against what is still open on each invoice.
    const allocationRows: Array<{ invoice_id: string; amount: number }> = [];
    const allocationSeries = new Set<BillingSeries>();
    if (requestedAllocations.length > 0) {
      const balClient = createAdminClient() || supabase;
      const { data: balRows, error: balErr } = await balClient
        .from("invoice_balances")
        .select("invoice_id, invoice_number, customer_id, country, available_to_allocate, billing_series")
        .in("invoice_id", requestedAllocations.map((a) => a.invoiceId));

      if (balErr) {
        return NextResponse.json({ error: `Could not check invoices: ${balErr.message}` }, { status: 500 });
      }

      let remaining = amountPaid;
      for (const req of requestedAllocations) {
        const bal = (balRows || []).find((b: any) => b.invoice_id === req.invoiceId);
        if (!bal) {
          return NextResponse.json({ error: "One of the selected invoices is not open (paid, cancelled or deleted)." }, { status: 400 });
        }
        if (bal.customer_id !== customerId || bal.country !== profile.country) {
          return NextResponse.json({ error: `Invoice ${bal.invoice_number} belongs to another customer.` }, { status: 400 });
        }
        const available = Number(bal.available_to_allocate) || 0;
        const amount = req.amount === undefined ? Math.min(available, remaining) : req.amount;
        if (!(amount > 0)) continue;
        if (amount > available + 0.0005) {
          return NextResponse.json(
            { error: `Invoice ${bal.invoice_number} has only ${available} open; cannot apply ${amount}.` },
            { status: 400 }
          );
        }
        remaining -= amount;
        if (remaining < -0.0005) {
          return NextResponse.json({ error: "Allocated amounts are more than the payment amount." }, { status: 400 });
        }
        allocationRows.push({ invoice_id: req.invoiceId, amount: Math.round(amount * 1000) / 1000 });
        allocationSeries.add(bal.billing_series === "oman_reg" ? "oman_reg" : "standard");
      }
    }

    // Billing series (UAE): a receipt settles invoices of one kind only.
    if (allocationSeries.size > 1) {
      return NextResponse.json(
        { error: "A receipt can't settle UAE-registered and Oman-registered invoices together. Record a separate receipt for each kind." },
        { status: 400 }
      );
    }
    const requestedSeries: BillingSeries | null =
      payload.billingSeries === "oman_reg" ? "oman_reg" : payload.billingSeries === "standard" ? "standard" : null;
    const allocatedSeries = allocationSeries.size === 1 ? Array.from(allocationSeries)[0] : null;
    if (requestedSeries && allocatedSeries && requestedSeries !== allocatedSeries) {
      return NextResponse.json(
        { error: "The selected invoices don't match the receipt type (UAE-registered / Oman-registered)." },
        { status: 400 }
      );
    }
    const billingSeries: BillingSeries =
      profile.country === "UAE" ? allocatedSeries || requestedSeries || "standard" : "standard";

    // Number: the salesman's receipt series for this kind when set up; otherwise
    // the number typed on the form (if free) or the shared REC / RCM sequence.
    const numberSalesmanId = profile.role === "salesperson" ? profile.id : assignedSalesmanId;
    const admin = createAdminClient() || supabase;
    const fromSeries = numberSalesmanId
      ? await nextSeriesNumber(admin, numberSalesmanId, "receipt", billingSeries)
      : null;
    if (fromSeries) {
      receiptNumber = fromSeries;
    } else if (!clientNumberUsable || billingSeries === "oman_reg") {
      receiptNumber = await nextReceiptNumber(admin, null, billingSeries);
    }

    const insertPayload = mapReceiptToDb({
      receiptNumber,
      customerId,
      // Informational link to the first invoice; the allocations below are authoritative.
      invoiceId: allocationRows[0]?.invoice_id || undefined,
      amountPaid,
      paymentDate,
      paymentMethod,
      referenceNo: referenceNo || (isCheque ? chequeNumber : ""),
      notes,
      chequeNumber: isCheque ? chequeNumber : undefined,
      chequeDate: isCheque ? chequeDate : undefined,
      bankName: isCheque ? bankName : undefined,
      chequeStatus: isCheque ? "Pending" : undefined,
    });

    // SERVER IS SOURCE OF TRUTH (Client payload ignored for country, created_by, updated_by)
    insertPayload.country = profile.country;
    insertPayload.created_by = profile.id;
    insertPayload.updated_by = profile.id;
    insertPayload.billing_series = billingSeries;

    let inserted: any = null;
    let insertAttempts = 0;
    const maxAttempts = 5;

    while (!inserted && insertAttempts < maxAttempts) {
      insertAttempts++;
      if (insertAttempts > 1) {
        insertPayload.receipt_number = await nextReceiptNumber(admin, numberSalesmanId, billingSeries);
        receiptNumber = insertPayload.receipt_number;
      }

      let { data: createdData, error: insertErr } = await supabase
        .from("receipts")
        .insert([insertPayload])
        .select("*, customers!left(company_name, doctor_name, pending_balance)")
        .single();

      if (insertErr && (insertErr.message.includes("country") || insertErr.message.includes("updated_by"))) {
        delete insertPayload.country;
        delete insertPayload.updated_by;

        const retryRes = await supabase
          .from("receipts")
          .insert([insertPayload])
          .select("*, customers!left(company_name, doctor_name, pending_balance)")
          .single();
        createdData = retryRes.data;
        insertErr = retryRes.error;
      }

      if (insertErr) {
        if (insertErr.code === "23505" || insertErr.message.includes("unique constraint") || insertErr.message.includes("already exists")) {
          console.warn(`Receipt number concurrency collision on ${insertPayload.receipt_number}, retrying...`);
          continue;
        }
        console.error("Supabase insert receipt error:", insertErr);
        throw insertErr;
      }

      inserted = createdData;
    }

    if (!inserted) {
      throw new Error("Failed to insert receipt after multiple concurrency retries.");
    }

    // Save allocations. If that fails, remove the receipt so a half-saved payment
    // never counts against the wrong invoice.
    if (allocationRows.length > 0) {
      const allocClient = createAdminClient() || supabase;
      const { error: allocErr } = await allocClient.from("receipt_allocations").insert(
        allocationRows.map((a) => ({ ...a, receipt_id: inserted.id, created_by: profile.id }))
      );
      if (allocErr) {
        await allocClient.from("receipts").delete().eq("id", inserted.id);
        return NextResponse.json({ error: `Receipt not saved: could not apply it to invoices (${allocErr.message}).` }, { status: 500 });
      }
    }

    // Recalculate customer balance from single source of truth
    if (customerId) {
      try {
        await recalculateCustomerBalance(supabase, customerId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate customer balance on receipt creation:", e);
        return NextResponse.json({ error: `Receipt created, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    const newReceipt = mapReceiptFromDb(inserted);
    return NextResponse.json({ success: true, receipt: newReceipt });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error saving receipt to Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to save receipt" }, { status: 500 });
  }
}
