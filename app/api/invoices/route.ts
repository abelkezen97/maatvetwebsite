import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapInvoiceFromDb, mapInvoiceToDb } from "@/lib/db/mappers";
import { recalculateCustomerBalance } from "@/lib/db/balances";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import { QuoteItem, UserCountry } from "@/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { validateAndProcessInvoiceInventory, reconcileInvoiceInventoryOnEdit } from "@/lib/db/inventory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { profile, supabase: userClient } = await requireAuth();

    if (!Permissions.canViewInvoices(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view invoices" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const isNextNumberReq = searchParams.get("nextNumber") === "true" || searchParams.get("nextNumber") === "1";
    const targetSalesmanId = searchParams.get("salesmanId") || profile.id;
    const customerId = searchParams.get("customerId");
    const limit = searchParams.get("limit");

    const queryClient = createAdminClient() || userClient;

    if (isNextNumberReq) {
      const KALEEM_PROFILE_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";
      let isKaleem = targetSalesmanId === KALEEM_PROFILE_ID || profile.id === KALEEM_PROFILE_ID;
      if (!isKaleem && (profile.full_name?.toLowerCase().includes("kaleem") || profile.email?.toLowerCase().includes("kaleem"))) {
        isKaleem = true;
      }
      if (!isKaleem && targetSalesmanId) {
        const { data: salesmanProf } = await queryClient
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", targetSalesmanId)
          .maybeSingle();

        if (salesmanProf && (
          salesmanProf.id === KALEEM_PROFILE_ID ||
          salesmanProf.full_name?.toLowerCase().includes("kaleem") ||
          salesmanProf.email?.toLowerCase().includes("kaleem")
        )) {
          isKaleem = true;
        }
      }

      const invPrefix = isKaleem ? "D" : "INV";
      const invPad = isKaleem ? 4 : 6;
      const nextInvoiceNumber = await generateNextDocumentNumber(queryClient, "invoices", "invoice_number", invPrefix, invPad);
      return NextResponse.json({ nextInvoiceNumber });
    }

    let query = queryClient
      .from("invoices")
      .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
      .order("created_at", { ascending: false });

    // Salesperson filters by assigned country and own salesman_id
    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country).eq("salesman_id", profile.id);
    } else if (profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (limit && !isNaN(Number(limit))) {
      query = query.limit(Number(limit));
    }

    let { data, error } = await query.eq("is_deleted", false);

    // Resilient fallback if is_deleted or country column does not exist yet in live DB
    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      let fallbackQuery = queryClient
        .from("invoices")
        .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
        .order("created_at", { ascending: false });

      if (profile.role === "salesperson") {
        fallbackQuery = fallbackQuery.eq("country", profile.country).eq("salesman_id", profile.id);
      } else if (profile.role === "accountant") {
        fallbackQuery = fallbackQuery.eq("country", profile.country);
      }
      if (customerId) fallbackQuery = fallbackQuery.eq("customer_id", customerId);
      if (limit && !isNaN(Number(limit))) fallbackQuery = fallbackQuery.limit(Number(limit));

      const res = await fallbackQuery;
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error("Failed to load Supabase invoices:", error);
      return NextResponse.json([]);
    }

    const { data: profileRows } = await queryClient.from("profiles").select("id, full_name");
    const salesmanMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) salesmanMap.set(p.id, p.full_name);
    });

    const invoices = (data || []).map((row: any) => mapInvoiceFromDb(row, salesmanMap));
    return NextResponse.json(invoices);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch invoices from Supabase:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canCreateInvoice(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot create invoice" }, { status: 403 });
    }

    const payload = await request.json();

    let invoiceData: any = payload;
    if (payload.invoiceJson) {
      try {
        invoiceData = typeof payload.invoiceJson === "string" ? JSON.parse(payload.invoiceJson) : payload.invoiceJson;
      } catch (e) {
        invoiceData = payload;
      }
    }

    const targetInvoiceId = payload.id || invoiceData.id || null;
    let invoiceNumber = invoiceData.invoiceNumber || payload.invoiceNumber;
    let isEditMode = false;
    let invoiceId: string | null = null;

    if (targetInvoiceId) {
      const { data: existingById } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("id", targetInvoiceId)
        .maybeSingle();

      if (existingById?.id) {
        invoiceId = existingById.id;
        invoiceNumber = existingById.invoice_number;
        isEditMode = true;
      }
    }



    const quoteNumber = invoiceData.quoteNumber || payload.quoteNumber || null;
    const customerId = invoiceData.customerId || payload.customerId || null;
    let custRow: any = null;

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

      custRow = fetchedCust;

      if (custErr || !custRow) {
        return NextResponse.json({ error: "Selected customer not found" }, { status: 400 });
      }

      if (profile.role === "salesperson") {
        if (custRow.country !== profile.country || custRow.assigned_salesman_id !== profile.id) {
          return NextResponse.json(
            { error: "Forbidden: Cannot create invoice for another salesperson's customer" },
            { status: 403 }
          );
        }
      } else if (profile.role === "accountant" && custRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot create invoice for customer in another country" },
          { status: 403 }
        );
      }
    }

    let quoteRow: any = null;
    if (quoteNumber) {
      const { data: qRow } = await supabase
        .from("quotations")
        .select("id, country, salesman_id")
        .eq("quotation_number", quoteNumber)
        .maybeSingle();

      quoteRow = qRow;

      if (quoteRow && profile.role === "salesperson") {
        if (quoteRow.country !== profile.country || quoteRow.salesman_id !== profile.id) {
          return NextResponse.json(
            { error: "Forbidden: Cannot convert another salesperson's quotation" },
            { status: 403 }
          );
        }
      }
    }

    const customerName = invoiceData.customerName || payload.customerName || "";
    const companyName = invoiceData.companyName || payload.companyName || "";
    const salesmanName = invoiceData.salesmanName || payload.salesmanName || profile.full_name;
    const issueDate = invoiceData.date || payload.date || new Date().toISOString().split("T")[0];

    const items: QuoteItem[] = invoiceData.items || payload.items || [];

    // Server-side recalculation and validation of line items & totals
    let computedSubtotal = 0;
    let computedDiscountTotal = 0;
    const validatedItemsPayload: any[] = [];

    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity) || 0);
      const unitPrice = Math.max(0, Number(item.unitPrice ?? item.price) || 0);

      let effectiveUnitPrice = unitPrice;
      const rawDiscPrice = item.discountPrice ?? item.manualDiscount;
      if (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "") {
        effectiveUnitPrice = Math.min(unitPrice, Math.max(0, Number(rawDiscPrice)));
      } else if (item.discount !== undefined && item.discount !== null && Number(item.discount) > 0) {
        const discVal = Number(item.discount);
        if (discVal < unitPrice) {
          effectiveUnitPrice = Math.max(0, unitPrice - discVal);
        } else {
          effectiveUnitPrice = Math.min(unitPrice, Math.max(0, discVal));
        }
      }

      const discountPerUnit = Math.max(0, unitPrice - effectiveUnitPrice);
      const lineTotal = Math.max(0, qty * effectiveUnitPrice);

      computedSubtotal += qty * unitPrice;
      computedDiscountTotal += qty * discountPerUnit;

      validatedItemsPayload.push({
        product_id: item.productId || null,
        quantity: qty,
        unit_price: unitPrice,
        discount: discountPerUnit,
        line_total: lineTotal,
      });
    }

    const rawSubtotal = Number(invoiceData.subtotal ?? payload.subtotal ?? 0);
    const rawDiscountTotal = Number(invoiceData.discountTotal ?? payload.discountTotal ?? 0);
    const rawGrandTotal = Number(invoiceData.grandTotal ?? payload.grandTotal ?? 0);

    const targetCountry: UserCountry = (custRow?.country || invoiceData.country || payload.country || profile.country) === "Oman" ? "Oman" : "UAE";
    // UAE VAT Rule: VAT is NOT applicable to UAE invoices (vat_total = 0)
    const vatTotal = targetCountry === "UAE" ? 0 : Number(invoiceData.taxTotal ?? payload.taxTotal ?? 0);

    const subtotal = items.length > 0 ? computedSubtotal : rawSubtotal;
    const discountTotal = items.length > 0 ? computedDiscountTotal : rawDiscountTotal;
    const grandTotal = items.length > 0
      ? Math.max(0, computedSubtotal - computedDiscountTotal + vatTotal)
      : (rawGrandTotal || Math.max(0, rawSubtotal - rawDiscountTotal + vatTotal));

    const status = invoiceData.status || payload.status || "Paid";
    const creditDays = invoiceData.creditDays !== undefined ? Number(invoiceData.creditDays) : payload.creditDays !== undefined ? Number(payload.creditDays) : undefined;
    const notes = invoiceData.notes || payload.notes || "";

    const headerPayload = mapInvoiceToDb({
      invoiceNumber,
      quoteNumber: quoteNumber || undefined,
      customerId: customerId || undefined,
      customerName,
      companyName,
      salesmanName,
      date: issueDate,
      subtotal,
      discountTotal,
      taxTotal: vatTotal,
      grandTotal,
      status,
      creditDays,
      notes,
    });

    let finalSalesmanId = profile.id;
    if (profile.role !== "salesperson") {
      finalSalesmanId = invoiceData.salesmanId || payload.salesmanId || quoteRow?.salesman_id || custRow?.assigned_salesman_id || profile.id;
    }

    // Determine if Dr. Kaleemullah is the salesperson for this invoice
    const KALEEM_PROFILE_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";
    let isKaleemullah = false;

    if (finalSalesmanId === KALEEM_PROFILE_ID || profile.id === KALEEM_PROFILE_ID) {
      isKaleemullah = true;
    } else if (profile.full_name?.toLowerCase().includes("kaleem") || profile.email?.toLowerCase().includes("kaleem")) {
      isKaleemullah = true;
    } else if (finalSalesmanId) {
      const queryClient = createAdminClient() || supabase;
      const { data: salesmanProf } = await queryClient
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", finalSalesmanId)
        .maybeSingle();

      if (salesmanProf && (
        salesmanProf.id === KALEEM_PROFILE_ID ||
        salesmanProf.full_name?.toLowerCase().includes("kaleem") ||
        salesmanProf.email?.toLowerCase().includes("kaleem")
      )) {
        isKaleemullah = true;
      }
    }

    const invPrefix = isKaleemullah ? "D" : "INV";
    const invPad = isKaleemullah ? 4 : 6;

    if (!isEditMode) {
      // Server-side reference generation: Dr. Kaleemullah or Salesperson ALWAYS gets server-generated reference
      if (isKaleemullah || profile.role === "salesperson" || !invoiceNumber) {
        invoiceNumber = await generateNextDocumentNumber(supabase, "invoices", "invoice_number", invPrefix, invPad);
      } else {
        const { data: existingByNum } = await supabase
          .from("invoices")
          .select("id")
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();

        if (existingByNum?.id) {
          invoiceNumber = await generateNextDocumentNumber(supabase, "invoices", "invoice_number", invPrefix, invPad);
        }
      }
      headerPayload.invoice_number = invoiceNumber;
    }

    // SERVER IS SOURCE OF TRUTH (Client payload enforced for salesman_id, country, created_by, updated_by)
    headerPayload.salesman_id = finalSalesmanId;
    headerPayload.updated_by = profile.id;
    headerPayload.country = profile.country;
    headerPayload.created_by = profile.id;

    if (isEditMode && invoiceId) {
      // ON UPDATE: STRIP IMMUTABLE FIELDS
      delete headerPayload.id;
      delete headerPayload.invoice_number;
      delete headerPayload.created_by;
      delete headerPayload.created_at;
      delete headerPayload.country;
      delete headerPayload.is_deleted;
      delete headerPayload.deleted_at;
      delete headerPayload.deleted_by;

      headerPayload.updated_at = new Date().toISOString();

      let { error: updateErr } = await supabase
        .from("invoices")
        .update(headerPayload)
        .eq("id", invoiceId);

      if (updateErr && (updateErr.message.includes("updated_by") || updateErr.message.includes("country") || updateErr.message.includes("status"))) {
        delete headerPayload.updated_by;
        delete headerPayload.status;
        const retryUpdate = await supabase
          .from("invoices")
          .update(headerPayload)
          .eq("id", invoiceId);
        updateErr = retryUpdate.error;
      }

      if (updateErr) {
        console.error("Supabase update invoice error:", updateErr);
      }

      await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
    } else {
      // ON INSERT: STAMP COUNTRY AND CREATED_BY WITH CONCURRENCY RETRY LOOP
      let inserted: any = null;
      let insertAttempts = 0;
      const maxAttempts = 5;

      while (!inserted && insertAttempts < maxAttempts) {
        insertAttempts++;
        if (insertAttempts > 1) {
          headerPayload.invoice_number = await generateNextDocumentNumber(supabase, "invoices", "invoice_number", invPrefix, invPad);
          invoiceNumber = headerPayload.invoice_number;
        }

        let { data: createdData, error: insertErr } = await supabase
          .from("invoices")
          .insert([headerPayload])
          .select("id")
          .single();

        if (insertErr && (insertErr.message.includes("country") || insertErr.message.includes("created_by") || insertErr.message.includes("updated_by") || insertErr.message.includes("status"))) {
          delete headerPayload.country;
          delete headerPayload.created_by;
          delete headerPayload.updated_by;
          delete headerPayload.status;

          const retryInsert = await supabase
            .from("invoices")
            .insert([headerPayload])
            .select("id")
            .single();
          createdData = retryInsert.data;
          insertErr = retryInsert.error;
        }

        if (insertErr) {
          if (insertErr.code === "23505" || insertErr.message.includes("unique constraint") || insertErr.message.includes("already exists")) {
            console.warn(`Invoice number concurrency collision on ${headerPayload.invoice_number}, retrying...`);
            continue;
          }
          console.error("Supabase insert invoice error:", insertErr);
          throw insertErr;
        }

        inserted = createdData;
      }

      if (!inserted) {
        throw new Error("Failed to insert invoice after multiple concurrency retries.");
      }

      invoiceId = inserted.id;
    }

    if (validatedItemsPayload.length > 0 && invoiceId) {
      const lineItemsPayload = validatedItemsPayload.map((item) => ({
        ...item,
        invoice_id: invoiceId,
      }));

      const { error: itemsErr } = await supabase
        .from("invoice_items")
        .insert(lineItemsPayload);

      if (itemsErr) {
        console.error("Supabase invoice items insert error:", itemsErr);
      }
    }

    // INVENTORY DEDUCTION & RECONCILIATION FOR CONFIRMED INVOICES
    if (status !== "Draft" && invoiceId) {
      const inventoryItems = items.map((it) => ({
        productId: it.productId || "",
        quantity: Number(it.quantity) || 0,
        productName: it.productName || "Product",
      }));

      try {
        if (isEditMode) {
          await reconcileInvoiceInventoryOnEdit(
            supabase,
            invoiceId,
            invoiceNumber,
            inventoryItems,
            targetCountry,
            profile.id
          );
        } else {
          await validateAndProcessInvoiceInventory(
            supabase,
            inventoryItems,
            targetCountry,
            invoiceId,
            invoiceNumber,
            profile.id
          );
        }
      } catch (invErr: any) {
        // Rollback created invoice if stock validation fails on new creation
        if (!isEditMode && invoiceId) {
          await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
          await supabase.from("invoices").delete().eq("id", invoiceId);
        }
        return NextResponse.json({ error: invErr.message || "Insufficient stock" }, { status: 400 });
      }
    }

    // AUTOMATIC RECEIPT FOR IMMEDIATE-PAYMENT (Paid) INVOICES
    const paymentMethod = invoiceData.paymentMethod || payload.paymentMethod || "Cash";
    const actualPaymentAmount = Number(invoiceData.amountPaid ?? payload.amountPaid ?? (status === "Paid" ? grandTotal : 0));

    // CRITICAL FINANCIAL RULE: Create receipt ONLY IF actual payment amount > 0
    if (status === "Paid" && actualPaymentAmount > 0 && invoiceId) {
      // Check if an active receipt already exists for this invoice to prevent duplicates
      const { data: existingRec } = await supabase
        .from("receipts")
        .select("id")
        .eq("invoice_id", invoiceId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!existingRec?.id) {
        const autoReceiptNumber = await generateNextDocumentNumber(supabase, "receipts", "receipt_number", "REC", 6);
        const receiptPayload = {
          receipt_number: autoReceiptNumber,
          customer_id: customerId || null,
          invoice_id: invoiceId,
          amount_paid: actualPaymentAmount,
          payment_date: issueDate,
          payment_method: paymentMethod,
          reference_number: `Auto-generated for Invoice ${invoiceNumber}`,
          notes: notes || `Automatic payment receipt for Invoice ${invoiceNumber}`,
          country: profile.country,
          created_by: profile.id,
          updated_by: profile.id,
        };

        const { error: recErr } = await supabase.from("receipts").insert([receiptPayload]);
        if (recErr) {
          console.error("Failed to create automatic receipt for immediate-payment invoice:", recErr);
        }
      }
    }

    // Recalculate customer outstanding balance from single source of truth
    let targetCustId = customerId;
    if (!targetCustId && (companyName || customerName)) {
      const { data: custRows } = await supabase
        .from("customers")
        .select("id")
        .or(`company_name.eq.${companyName},doctor_name.eq.${customerName}`)
        .limit(1);
      if (custRows && custRows.length > 0) {
        targetCustId = custRows[0].id;
      }
    }

    if (targetCustId) {
      try {
        await recalculateCustomerBalance(supabase, targetCustId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate balance on invoice creation:", e);
        return NextResponse.json({ error: `Invoice created, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, invoiceNumber });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error saving invoice to Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to save invoice" }, { status: 500 });
  }
}
