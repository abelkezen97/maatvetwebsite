import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapReceiptFromDb, mapReceiptToDb } from "@/lib/db/mappers";
import { recalculateCustomerBalance } from "@/lib/db/balances";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile, supabase: userClient } = await requireAuth();

    if (!Permissions.canViewReceipts(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view receipts" }, { status: 403 });
    }

    const queryClient = createAdminClient() || userClient;

    let query = queryClient
      .from("receipts")
      .select("*, customers!left(company_name, doctor_name, pending_balance, assigned_salesman_id), invoices!left(invoice_number, salesman_id)")
      .order("created_at", { ascending: false });

    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country);
    } else if (profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    let { data, error } = await query.eq("is_deleted", false);

    // Resilient fallback if is_deleted or country column does not exist yet in live DB
    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      let fallbackQuery = queryClient
        .from("receipts")
        .select("*, customers!left(company_name, doctor_name, pending_balance, assigned_salesman_id), invoices!left(invoice_number, salesman_id)")
        .order("created_at", { ascending: false });

      if (profile.role === "salesperson" || profile.role === "accountant") {
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

    if (!receiptNumber || isClientNumTaken) {
      receiptNumber = await generateNextDocumentNumber(supabase, "receipts", "receipt_number", "REC", 6);
    }

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
      } else if (profile.role === "accountant" && invRow.country !== profile.country) {
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

    if (customerId) {
      let { data: fetchedCust, error: custErr } = await supabase
        .from("customers")
        .select("id, country, assigned_salesman_id")
        .eq("id", customerId)
        .maybeSingle();

      if ((custErr || !fetchedCust) && createAdminClient()) {
        const adminClient = createAdminClient();
        if (adminClient) {
          const { data: adminCust } = await adminClient
            .from("customers")
            .select("id, country, assigned_salesman_id")
            .eq("id", customerId)
            .maybeSingle();
          fetchedCust = adminCust;
          custErr = null;
        }
      }

      const custRow = fetchedCust;

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
      } else if (profile.role === "accountant" && custRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot create receipt for customer in another country" },
          { status: 403 }
        );
      }
    }

    const insertPayload = mapReceiptToDb({
      receiptNumber,
      customerId,
      invoiceId,
      amountPaid,
      paymentDate,
      paymentMethod,
      referenceNo,
      notes,
    });

    // SERVER IS SOURCE OF TRUTH (Client payload ignored for country, created_by, updated_by)
    insertPayload.country = profile.country;
    insertPayload.created_by = profile.id;
    insertPayload.updated_by = profile.id;

    let inserted: any = null;
    let insertAttempts = 0;
    const maxAttempts = 5;

    while (!inserted && insertAttempts < maxAttempts) {
      insertAttempts++;
      if (insertAttempts > 1) {
        insertPayload.receipt_number = await generateNextDocumentNumber(supabase, "receipts", "receipt_number", "REC", 6);
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
