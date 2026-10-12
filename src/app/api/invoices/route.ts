import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions, isCountryStaff } from "@/lib/auth/permissions";
import { mapInvoiceFromDb, mapInvoiceToDb } from "@/lib/db/mappers";
import { recalculateCustomerBalance } from "@/lib/db/balances";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import { billingSeriesForProducts, mixedSeriesError, nextSeriesNumber, peekSeriesNumber } from "@/lib/db/documentSeries";
import { BillingSeries, QuoteItem, UserCountry } from "@/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { getProductStock, validateAndProcessInvoiceInventory, reconcileInvoiceInventoryOnEdit } from "@/lib/db/inventory";

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
      // The salesman's own series when the admin has set one up.
      const fromSeries = await peekSeriesNumber(queryClient, targetSalesmanId, "invoice", "standard");
      if (fromSeries) return NextResponse.json({ nextInvoiceNumber: fromSeries });

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
      .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name, assigned_salesman_id)")
      .order("created_at", { ascending: false });

    if (isCountryStaff(profile)) {
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
        .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name, assigned_salesman_id)")
        .order("created_at", { ascending: false });

      if (isCountryStaff(profile)) {
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

    // Apply salesperson country & ownership/creator filter inclusively
    if (profile.role === "salesperson" && data && Array.isArray(data)) {
      data = data.filter((row: any) => {
        const matchesCountry = (row.country || profile.country) === profile.country;
        const matchesSalesman =
          row.salesman_id === profile.id ||
          row.created_by === profile.id ||
          row.customers?.assigned_salesman_id === profile.id;
        return matchesCountry && matchesSalesman;
      });
    }

    const { data: profileRows } = await queryClient.from("profiles").select("id, full_name");
    const salesmanMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) salesmanMap.set(p.id, p.full_name);
    });

    const invoices = (data || []).map((row: any) => mapInvoiceFromDb(row, salesmanMap));

    // Payment position of each invoice (paid, open amount, overdue) from invoice_balances.
    const ids = invoices.map((inv: any) => inv.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 150) {
      const { data: balRows } = await queryClient
        .from("invoice_balances")
        .select("invoice_id, paid_amount, pending_cheques, outstanding, payment_state, is_overdue, days_overdue, due_date")
        .in("invoice_id", ids.slice(i, i + 150));
      (balRows || []).forEach((b: any) => {
        const inv: any = invoices.find((x: any) => x.id === b.invoice_id);
        if (!inv) return;
        inv.paidAmount = Number(b.paid_amount) || 0;
        inv.pendingCheques = Number(b.pending_cheques) || 0;
        inv.outstandingAmount = Number(b.outstanding) || 0;
        inv.paymentStatus = b.payment_state;
        inv.isOverdue = Boolean(b.is_overdue);
        inv.daysOverdue = Number(b.days_overdue) || 0;
        inv.dueDate = b.due_date || undefined;
      });
    }

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
    let invoiceId: string | null = null;
    let isEditMode = false;
    let oldCustomerId: string | null = null;
    let oldStatus: string | null = null;
    let existingSeries: BillingSeries = "standard";

    if (targetInvoiceId) {
      const { data: existingById } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_id, status, billing_series")
        .eq("id", targetInvoiceId)
        .maybeSingle();

      if (existingById?.id) {
        invoiceId = existingById.id;
        existingSeries = existingById.billing_series === "oman_reg" ? "oman_reg" : "standard";
        invoiceNumber = existingById.invoice_number;
        oldCustomerId = existingById.customer_id || null;
        oldStatus = existingById.status || null;
        isEditMode = true;
      }
    }



    const quoteNumber = invoiceData.quoteNumber || payload.quoteNumber || null;
    const customerId = invoiceData.customerId || payload.customerId || null;
    let custRow: any = null;

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
      } else if (isCountryStaff(profile) && custRow.country !== profile.country) {
        return NextResponse.json(
          { error: "Forbidden: Cannot create invoice for customer in another country" },
          { status: 403 }
        );
      }

      // A customer flagged cash only (after a bounced cheque) gets no credit and no cheque payments.
      if (custRow.cash_only) {
        const requestedStatus = invoiceData.status || payload.status || "Paid";
        const requestedMethod = invoiceData.paymentMethod || payload.paymentMethod || "Cash";
        if (requestedStatus === "Credit" || requestedMethod === "Cheque") {
          return NextResponse.json(
            { error: "This customer is cash only after a bounced cheque: credit invoices and cheque payments are blocked until an admin removes the flag." },
            { status: 400 }
          );
        }
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

    let finalSalesmanId = profile.id;
    if (profile.role !== "salesperson") {
      finalSalesmanId = invoiceData.salesmanId || payload.salesmanId || quoteRow?.salesman_id || custRow?.assigned_salesman_id || profile.id;
    }

    const admin = createAdminClient() || supabase;
    const status = invoiceData.status || payload.status || "Paid";
    const creditDays = invoiceData.creditDays !== undefined ? Number(invoiceData.creditDays) : payload.creditDays !== undefined ? Number(payload.creditDays) : undefined;
    const notes = invoiceData.notes || payload.notes || "";
    const paymentMethod = invoiceData.paymentMethod || payload.paymentMethod || "Cash";

    // ------------------------------------------------------------------
    // Billing series: in the UAE, Oman-registered products are billed on
    // their own invoice (own number series, printed without the header).
    // A mixed sale becomes two invoices linked by invoice_group_id.
    // ------------------------------------------------------------------
    const seriesByProduct = await billingSeriesForProducts(
      admin,
      targetCountry,
      items.map((it) => it.productId || "").filter(Boolean)
    );
    const seriesOf = (it: QuoteItem): BillingSeries =>
      (it.productId && seriesByProduct.get(String(it.productId))) || "standard";

    interface InvoicePart {
      series: BillingSeries;
      items: QuoteItem[];
      rows: any[];
      subtotal: number;
      discountTotal: number;
      grandTotal: number;
    }
    let parts: InvoicePart[] = [];
    if (items.length === 0) {
      parts = [{ series: isEditMode ? existingSeries : "standard", items: [], rows: [], subtotal, discountTotal, grandTotal }];
    } else {
      (["standard", "oman_reg"] as BillingSeries[]).forEach((series) => {
        const idxs = items.map((it, i) => (seriesOf(it) === series ? i : -1)).filter((i) => i >= 0);
        if (idxs.length === 0) return;
        const rows = idxs.map((i) => validatedItemsPayload[i]);
        const partSubtotal = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
        const partDiscount = rows.reduce((s, r) => s + r.quantity * r.discount, 0);
        parts.push({
          series,
          items: idxs.map((i) => items[i]),
          rows,
          subtotal: partSubtotal,
          discountTotal: partDiscount,
          // Splitting only happens in the UAE, where there is no VAT.
          grandTotal: Math.max(0, partSubtotal - partDiscount + (idxs.length === items.length ? vatTotal : 0)),
        });
      });
    }

    if (isEditMode) {
      // An existing invoice keeps its series; the other kind needs its own invoice.
      if (parts.length > 1 || parts[0].series !== existingSeries) {
        return NextResponse.json({ error: mixedSeriesError(existingSeries) }, { status: 400 });
      }
    } else if (parts.some((p) => p.series === "oman_reg")) {
      const hasSeries = await peekSeriesNumber(admin, finalSalesmanId, "invoice", "oman_reg");
      if (!hasSeries) {
        return NextResponse.json(
          {
            error:
              "This sale has Oman-registered products, but this salesman has no Oman-registered invoice series yet. " +
              "An admin can set it in Settings → Users → Number series.",
          },
          { status: 400 }
        );
      }
    }

    // All stock is checked before anything is saved, so a split sale never
    // ends up half saved for lack of stock.
    if (!isEditMode && status !== "Draft") {
      const needed = new Map<string, { qty: number; name: string }>();
      items.forEach((it) => {
        if (!it.productId || !(Number(it.quantity) > 0)) return;
        const cur = needed.get(it.productId) || { qty: 0, name: it.productName || "Selected product" };
        cur.qty += Number(it.quantity);
        needed.set(it.productId, cur);
      });
      for (const [pid, need] of needed) {
        const available = await getProductStock(admin, pid, targetCountry);
        if (available < need.qty) {
          return NextResponse.json({ error: `Insufficient stock for ${need.name}. Available quantity: ${available}.` }, { status: 400 });
        }
      }
    }

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

    const groupId = parts.length > 1 ? crypto.randomUUID() : null;
    // Money taken at invoice time goes to the UAE-registered invoice first.
    let paymentLeft = Number(invoiceData.amountPaid ?? payload.amountPaid ?? (status === "Paid" ? grandTotal : 0));

    const created: Array<{ id: string; invoiceNumber: string; billingSeries: BillingSeries; grandTotal: number }> = [];

    // Removes invoices this request created (used when a later part fails).
    const rollbackCreated = async () => {
      for (const c of created) {
        await admin.from("inventory_transactions").delete().eq("reference_id", c.id);
        await admin.from("invoice_items").delete().eq("invoice_id", c.id);
        await admin.from("invoices").delete().eq("id", c.id);
      }
    };

    for (const part of parts) {
      let partInvoiceId: string | null = isEditMode ? invoiceId : null;
      let partNumber: string = isEditMode ? invoiceNumber : "";

      const headerPayload = mapInvoiceToDb({
        invoiceNumber: partNumber || undefined,
        quoteNumber: quoteNumber || undefined,
        customerId: customerId || undefined,
        customerName,
        companyName,
        salesmanName,
        date: issueDate,
        subtotal: part.subtotal,
        discountTotal: part.discountTotal,
        taxTotal: parts.length === 1 ? vatTotal : 0,
        grandTotal: part.grandTotal,
        status,
        creditDays,
        notes,
      });

      // SERVER IS SOURCE OF TRUTH (Client payload enforced for salesman_id, country, created_by, updated_by)
      headerPayload.salesman_id = finalSalesmanId;
      headerPayload.updated_by = profile.id;
      headerPayload.country = profile.country;
      headerPayload.created_by = profile.id;

      if (isEditMode && partInvoiceId) {
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
          .eq("id", partInvoiceId);

        if (updateErr && (updateErr.message.includes("updated_by") || updateErr.message.includes("country") || updateErr.message.includes("status"))) {
          delete headerPayload.updated_by;
          delete headerPayload.status;
          const retryUpdate = await supabase
            .from("invoices")
            .update(headerPayload)
            .eq("id", partInvoiceId);
          updateErr = retryUpdate.error;
        }

        if (updateErr) {
          console.error("Supabase update invoice error:", updateErr);
        }

        await supabase
          .from("invoice_items")
          .delete()
          .eq("invoice_id", partInvoiceId);
      } else {
        headerPayload.billing_series = part.series;
        headerPayload.invoice_group_id = groupId;

        // ON INSERT: number from the salesman's series (standard falls back to
        // the shared D-series), with a retry loop for concurrent saves.
        let inserted: any = null;
        let insertAttempts = 0;
        const maxAttempts = 10;

        while (!inserted && insertAttempts < maxAttempts) {
          insertAttempts++;

          const candidateNum =
            (await nextSeriesNumber(admin, finalSalesmanId, "invoice", part.series)) ||
            (part.series === "standard"
              ? await generateNextDocumentNumber(supabase, "invoices", "invoice_number", "D", 4)
              : null);
          if (!candidateNum) {
            await rollbackCreated();
            return NextResponse.json({ error: "No Oman-registered invoice series for this salesman." }, { status: 400 });
          }

          const { data: createdData, error: insertErr } = await supabase
            .from("invoices")
            .insert([{ ...headerPayload, invoice_number: candidateNum }])
            .select("id, invoice_number")
            .single();

          if (!insertErr && createdData) {
            inserted = createdData;
            break;
          }

          console.error("INVOICE INSERT FAILED:", {
            attempt: insertAttempts,
            invoice_number: candidateNum,
            code: insertErr?.code,
            message: insertErr?.message,
            details: insertErr?.details,
            hint: insertErr?.hint,
            salesperson_id: finalSalesmanId,
            user_id: profile.id,
            user_role: profile.role,
            country: headerPayload.country,
            billing_series: part.series,
            operation: "INSERT_INVOICE_HEADER",
          });

          const isCollision =
            insertErr?.code === "23505" ||
            insertErr?.message?.toLowerCase().includes("unique constraint") ||
            insertErr?.message?.toLowerCase().includes("already exists") ||
            insertErr?.message?.toLowerCase().includes("duplicate key");

          if (isCollision) {
            console.warn(`[Invoice Concurrency Collision] Candidate ${candidateNum} already exists, retrying attempt ${insertAttempts + 1}...`);
            continue;
          }

          await rollbackCreated();
          return NextResponse.json(
            {
              error: `Invoice Insert Failed: ${insertErr?.message || "Database insert error"}`,
              code: insertErr?.code,
              details: insertErr?.details,
              hint: insertErr?.hint,
              attempted_number: candidateNum,
            },
            { status: 400 }
          );
        }

        if (!inserted) {
          await rollbackCreated();
          throw new Error("Failed to insert invoice after multiple concurrency retries.");
        }

        partInvoiceId = inserted.id;
        partNumber = inserted.invoice_number;
      }

      if (!partInvoiceId) continue;

      if (part.rows.length > 0) {
        const { error: itemsErr } = await supabase
          .from("invoice_items")
          .insert(part.rows.map((row) => ({ ...row, invoice_id: partInvoiceId })));

        if (itemsErr) {
          console.error("Supabase invoice items insert error:", itemsErr);
        }
      }

      // INVENTORY DEDUCTION & RECONCILIATION FOR CONFIRMED INVOICES
      if (status !== "Draft") {
        const inventoryItems = part.items.map((it) => ({
          productId: it.productId || "",
          quantity: Number(it.quantity) || 0,
          productName: it.productName || "Product",
        }));

        try {
          if (isEditMode) {
            await reconcileInvoiceInventoryOnEdit(
              supabase,
              partInvoiceId,
              partNumber,
              inventoryItems,
              targetCountry,
              profile.id
            );
          } else {
            await validateAndProcessInvoiceInventory(
              supabase,
              inventoryItems,
              targetCountry,
              partInvoiceId,
              partNumber,
              profile.id
            );
          }
        } catch (invErr: any) {
          if (!isEditMode) {
            created.push({ id: partInvoiceId, invoiceNumber: partNumber, billingSeries: part.series, grandTotal: part.grandTotal });
            await rollbackCreated();
          }
          return NextResponse.json({ error: invErr.message || "Insufficient stock" }, { status: 400 });
        }
      }

      created.push({ id: partInvoiceId, invoiceNumber: partNumber, billingSeries: part.series, grandTotal: part.grandTotal });
    }

    // RECEIPT & FINANCIAL RECONCILIATION FOR CONFIRMED INVOICES
    // One automatic receipt per invoice; it takes its invoice's billing series.
    for (const inv of created) {
      const partPayment = status === "Paid" ? Math.min(Math.max(paymentLeft, 0), inv.grandTotal) : 0;
      paymentLeft -= partPayment;

      if (status === "Paid" && partPayment > 0) {
        const { data: existingRec } = await supabase
          .from("receipts")
          .select("id")
          .eq("invoice_id", inv.id)
          .eq("is_deleted", false)
          .maybeSingle();

        if (existingRec?.id) {
          await supabase
            .from("receipts")
            .update({
              customer_id: targetCustId || null,
              amount_paid: partPayment,
              payment_date: issueDate,
              payment_method: paymentMethod,
              country: profile.country,
              updated_by: profile.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingRec.id);
        } else {
          const autoReceiptNumber =
            (await nextSeriesNumber(admin, finalSalesmanId, "receipt", inv.billingSeries)) ||
            (await generateNextDocumentNumber(supabase, "receipts", "receipt_number", "REC", 6));
          await supabase.from("receipts").insert([{
            receipt_number: autoReceiptNumber,
            customer_id: targetCustId || null,
            invoice_id: inv.id,
            amount_paid: partPayment,
            payment_date: issueDate,
            payment_method: paymentMethod,
            // A cheque taken at invoice time counts as paid only once it clears.
            cheque_status: paymentMethod === "Cheque" ? "Pending" : null,
            reference_number: `Auto-generated for Invoice ${inv.invoiceNumber}`,
            notes: notes || `Automatic payment receipt for Invoice ${inv.invoiceNumber}`,
            country: profile.country,
            created_by: profile.id,
            updated_by: profile.id,
          }]);
        }
      } else {
        // Credit, Cancelled or nothing collected: no active receipt for this invoice.
        await supabase
          .from("receipts")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: profile.id,
          })
          .eq("invoice_id", inv.id)
          .eq("is_deleted", false);
      }
    }
    invoiceNumber = created[0]?.invoiceNumber || invoiceNumber;

    // Recalculate customer outstanding balances (both former and current customer if changed)
    if (oldCustomerId && oldCustomerId !== targetCustId) {
      try {
        await recalculateCustomerBalance(supabase, oldCustomerId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate old customer balance on invoice edit:", e);
      }
    }

    if (targetCustId) {
      try {
        await recalculateCustomerBalance(supabase, targetCustId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate balance on invoice creation/edit:", e);
        return NextResponse.json({ error: `Invoice saved, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      invoiceNumber,
      invoices: created.map((c) => ({ id: c.id, invoiceNumber: c.invoiceNumber, billingSeries: c.billingSeries, grandTotal: c.grandTotal })),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error saving invoice to Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to save invoice" }, { status: 500 });
  }
}
