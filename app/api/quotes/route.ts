import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapQuoteFromDb, mapQuoteToDb } from "@/lib/db/mappers";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import { QuoteItem, QuoteStatus } from "@/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile, supabase: userClient } = await requireAuth();

    if (!Permissions.canViewQuotations(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view quotations" }, { status: 403 });
    }

    const queryClient = createAdminClient() || userClient;

    let query = queryClient
      .from("quotations")
      .select("*, quotation_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
      .order("created_at", { ascending: false });

    // Salesperson filters by assigned country and own salesman_id
    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country).eq("salesman_id", profile.id);
    } else if (profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    let { data, error } = await query.eq("is_deleted", false);

    // Resilient fallback if is_deleted or country column does not exist yet in live DB
    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      let fallbackQuery = queryClient
        .from("quotations")
        .select("*, quotation_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
        .order("created_at", { ascending: false });

      if (profile.role === "salesperson") {
        fallbackQuery = fallbackQuery.eq("country", profile.country).eq("salesman_id", profile.id);
      } else if (profile.role === "accountant") {
        fallbackQuery = fallbackQuery.eq("country", profile.country);
      }
      const res = await fallbackQuery;
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error("Failed to load Supabase quotations:", error);
      return NextResponse.json([]);
    }

    const { data: profileRows } = await queryClient.from("profiles").select("id, full_name");
    const salesmanMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) salesmanMap.set(p.id, p.full_name);
    });

    const quotes = (data || []).map((row: any) => mapQuoteFromDb(row, salesmanMap));
    return NextResponse.json(quotes);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch quotes from Supabase:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canCreateQuotation(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot create quotation" }, { status: 403 });
    }

    const payload = await request.json();

    let quoteData: any = payload;
    if (payload.quoteJson) {
      try {
        quoteData = typeof payload.quoteJson === "string" ? JSON.parse(payload.quoteJson) : payload.quoteJson;
      } catch (e) {
        quoteData = payload;
      }
    }

    const targetQuoteId = payload.id || quoteData.id || null;
    let quotationNumber = quoteData.quoteNumber || payload.quoteNumber;
    let isEditMode = false;
    let quotationId: string | null = null;

    if (targetQuoteId) {
      const { data: existingById } = await supabase
        .from("quotations")
        .select("id, quotation_number")
        .eq("id", targetQuoteId)
        .maybeSingle();

      if (existingById?.id) {
        quotationId = existingById.id;
        quotationNumber = existingById.quotation_number;
        isEditMode = true;
      }
    }

    if (!isEditMode) {
      let isClientNumTaken = false;
      if (quotationNumber) {
        const { data: existingByNum } = await supabase
          .from("quotations")
          .select("id")
          .eq("quotation_number", quotationNumber)
          .maybeSingle();
        if (existingByNum?.id) {
          isClientNumTaken = true;
        }
      }

      if (!quotationNumber || isClientNumTaken) {
        quotationNumber = await generateNextDocumentNumber(supabase, "quotations", "quotation_number", "QT", 6);
      }
    }

    const customerId = quoteData.customerId || null;
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
            { error: "Forbidden: Cannot create quotation for another salesperson's customer" },
            { status: 403 }
          );
        }
      } else if (profile.role === "accountant" && custRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot create quotation for customer in another country" },
          { status: 403 }
        );
      }
    }

    const issueDate = quoteData.date || payload.date || new Date().toISOString().split("T")[0];
    const items: QuoteItem[] = quoteData.items || payload.items || [];

    // Server-side calculation and validation of quotation items & totals
    let computedSubtotal = 0;
    let computedDiscountTotal = 0;

    const validatedItemsPayload: any[] = [];

    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity) || 0);
      const unitPrice = Math.max(0, Number(item.price) || 0);

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

    const targetCountry = profile.country === "Oman" ? "Oman" : "UAE";
    // UAE VAT Rule: VAT is NOT applicable to UAE quotations (vat_total = 0)
    const vatTotal = targetCountry === "UAE" ? 0 : Number(quoteData.taxTotal ?? payload.taxTotal ?? 0);
    const grandTotal = Math.max(0, computedSubtotal - computedDiscountTotal + vatTotal);

    let status: QuoteStatus = quoteData.status || payload.status || "Draft";
    if (!["Draft", "Sent", "Approved", "Rejected"].includes(status)) {
      status = "Draft";
    }

    const notes = quoteData.notes || payload.notes || "";

    const headerPayload = mapQuoteToDb({
      quoteNumber: quotationNumber,
      customerId: customerId || undefined,
      date: issueDate,
      subtotal: computedSubtotal,
      discountTotal: computedDiscountTotal,
      taxTotal: vatTotal,
      grandTotal: grandTotal,
      status: status,
      notes: notes,
    });

    let finalSalesmanId = profile.id;
    if (profile.role !== "salesperson") {
      finalSalesmanId = quoteData.salesmanId || payload.salesmanId || custRow?.assigned_salesman_id || profile.id;
    }

    // SERVER IS SOURCE OF TRUTH (Client payload enforced for salesman_id, country, created_by, updated_by)
    headerPayload.salesman_id = finalSalesmanId;
    headerPayload.updated_by = profile.id;
    headerPayload.country = profile.country;
    headerPayload.created_by = profile.id;

    if (isEditMode && quotationId) {
      delete headerPayload.id;
      delete headerPayload.quotation_number;
      delete headerPayload.created_by;
      delete headerPayload.created_at;
      delete headerPayload.country;
      delete headerPayload.is_deleted;
      delete headerPayload.deleted_at;
      delete headerPayload.deleted_by;

      headerPayload.updated_at = new Date().toISOString();

      let { error: updateErr } = await supabase
        .from("quotations")
        .update(headerPayload)
        .eq("id", quotationId);

      if (updateErr && (updateErr.message.includes("updated_by") || updateErr.message.includes("country"))) {
        delete headerPayload.updated_by;
        const retryUpdate = await supabase
          .from("quotations")
          .update(headerPayload)
          .eq("id", quotationId);
        updateErr = retryUpdate.error;
      }

      if (updateErr) {
        console.error("Supabase update quotation error:", updateErr);
        throw updateErr;
      }

      await supabase
        .from("quotation_items")
        .delete()
        .eq("quotation_id", quotationId);
    } else {
      let inserted: any = null;
      let insertAttempts = 0;
      const maxAttempts = 5;

      while (!inserted && insertAttempts < maxAttempts) {
        insertAttempts++;
        if (insertAttempts > 1) {
          headerPayload.quotation_number = await generateNextDocumentNumber(supabase, "quotations", "quotation_number", "QT", 6);
          quotationNumber = headerPayload.quotation_number;
        }

        let { data: createdData, error: insertErr } = await supabase
          .from("quotations")
          .insert([headerPayload])
          .select("id")
          .single();

        if (insertErr && (insertErr.message.includes("country") || insertErr.message.includes("created_by") || insertErr.message.includes("updated_by"))) {
          delete headerPayload.country;
          delete headerPayload.created_by;
          delete headerPayload.updated_by;

          const retryInsert = await supabase
            .from("quotations")
            .insert([headerPayload])
            .select("id")
            .single();
          createdData = retryInsert.data;
          insertErr = retryInsert.error;
        }

        if (insertErr) {
          if (insertErr.code === "23505" || insertErr.message.includes("unique constraint") || insertErr.message.includes("already exists")) {
            console.warn(`Quotation number concurrency collision on ${headerPayload.quotation_number}, retrying...`);
            continue;
          }
          console.error("Supabase insert quotation error:", insertErr);
          throw insertErr;
        }

        inserted = createdData;
      }

      if (!inserted) {
        throw new Error("Failed to insert quotation after multiple concurrency retries.");
      }

      quotationId = inserted.id;
    }

    if (validatedItemsPayload.length > 0 && quotationId) {
      const lineItemsPayload = validatedItemsPayload.map((item) => ({
        ...item,
        quotation_id: quotationId,
      }));

      const { error: itemsErr } = await supabase
        .from("quotation_items")
        .insert(lineItemsPayload);

      if (itemsErr) {
        console.error("Supabase quotation items insert error:", itemsErr);
      }
    }

    return NextResponse.json({ success: true, quotationNumber, quotationId });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error saving quotation to Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to save quotation" }, { status: 500 });
  }
}

