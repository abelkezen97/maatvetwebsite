import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapInvoiceFromDb, mapInvoiceToDb } from "@/lib/db/mappers";
import { recalculateCustomerBalance } from "@/lib/db/balances";
import { QuoteItem } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewInvoices(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view invoice" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 });
    }

    let query = supabase
      .from("invoices")
      .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
      .eq("id", id);

    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country).eq("salesman_id", profile.id);
    } else if (profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    let { data, error } = await query.eq("is_deleted", false).maybeSingle();

    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      const res = await supabase
        .from("invoices")
        .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
        .eq("id", id)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (error || !data) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Additional server-side ownership check for salesperson
    if (profile.role === "salesperson") {
      if (data.country !== profile.country || data.salesman_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden: Cannot view another salesperson's invoice" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && data.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot view invoice in another country" }, { status: 403 });
    }

    const { data: profileRows } = await supabase.from("profiles").select("id, full_name");
    const salesmanMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) salesmanMap.set(p.id, p.full_name);
    });

    const invoice = mapInvoiceFromDb(data, salesmanMap);
    return NextResponse.json(invoice);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error getting invoice from Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canEditInvoice(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot edit invoice" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 });
    }

    let { data: existing, error: fetchErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing || existing.is_deleted) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (profile.role === "salesperson") {
      if (existing.country !== profile.country || existing.salesman_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden: Cannot edit another salesperson's invoice" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && existing.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot edit invoice in another country" }, { status: 403 });
    }

    const oldCustomerId = existing.customer_id;

    const payload = await request.json();
    const headerPayload = mapInvoiceToDb(payload);

    // IMMUTABLE / READ-ONLY FIELDS MUST NEVER BE SENT IN UPDATE/PATCH PAYLOAD
    delete headerPayload.id;
    delete headerPayload.invoice_number;
    delete headerPayload.created_by;
    delete headerPayload.created_at;
    delete headerPayload.country;
    delete headerPayload.is_deleted;
    delete headerPayload.deleted_at;
    delete headerPayload.deleted_by;

    headerPayload.updated_at = new Date().toISOString();

    let { data: updatedHeader, error: headerErr } = await supabase
      .from("invoices")
      .update(headerPayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (headerErr && (headerErr.message.includes("updated_by") || headerErr.message.includes("status"))) {
      delete headerPayload.updated_by;
      delete headerPayload.status;
      const retryRes = await supabase
        .from("invoices")
        .update(headerPayload)
        .eq("id", id)
        .select()
        .maybeSingle();
      updatedHeader = retryRes.data;
      headerErr = retryRes.error;
    }

    if (headerErr) {
      console.error("Supabase update invoice error:", headerErr);
      return NextResponse.json({ error: headerErr.message }, { status: 500 });
    }

    if (payload.items && Array.isArray(payload.items)) {
      await supabase.from("invoice_items").delete().eq("invoice_id", id);

      const items: QuoteItem[] = payload.items;
      if (items.length > 0) {
        const lineItemsPayload = items.map((item) => {
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

          return {
            invoice_id: id,
            product_id: item.productId || null,
            quantity: qty,
            unit_price: unitPrice,
            discount: discountPerUnit,
            line_total: lineTotal,
          };
        });

        await supabase.from("invoice_items").insert(lineItemsPayload);
      }
    }

    // AUTOMATIC RECEIPT RECONCILIATION ON INVOICE EDIT
    const newStatus = updatedHeader?.status || payload.status || existing.status;
    const newGrandTotal = updatedHeader?.grand_total !== undefined ? Number(updatedHeader.grand_total) : Number(existing.grand_total || 0);
    const newCustId = updatedHeader?.customer_id || payload.customerId || existing.customer_id;
    const paymentMethod = payload.paymentMethod || "Cash";
    const actualPaymentAmount = Number(payload.amountPaid ?? payload.amountCollected ?? (newStatus === "Paid" ? newGrandTotal : 0));

    const { data: existingReceipt } = await supabase
      .from("receipts")
      .select("id, is_deleted, reference_number")
      .eq("invoice_id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (newStatus === "Paid" && actualPaymentAmount > 0) {
      if (existingReceipt?.id) {
        // Update existing receipt with new total
        await supabase
          .from("receipts")
          .update({
            amount_paid: actualPaymentAmount,
            customer_id: newCustId,
            payment_method: paymentMethod,
            updated_by: profile.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingReceipt.id);
      } else {
        // Create automatic receipt for newly Paid invoice
        const generateNextDocumentNumber = (await import("@/lib/db/sequence")).generateNextDocumentNumber;
        const autoReceiptNumber = await generateNextDocumentNumber(supabase, "receipts", "receipt_number", "REC", 6);
        await supabase.from("receipts").insert([{
          receipt_number: autoReceiptNumber,
          customer_id: newCustId,
          invoice_id: id,
          amount_paid: actualPaymentAmount,
          payment_date: updatedHeader?.issue_date || existing.issue_date || new Date().toISOString().split("T")[0],
          payment_method: paymentMethod,
          reference_number: `Auto-generated for Invoice ${existing.invoice_number}`,
          notes: `Automatic payment receipt for Invoice ${existing.invoice_number}`,
          country: existing.country || profile.country,
          created_by: profile.id,
          updated_by: profile.id,
        }]);
      }
    } else if ((newStatus === "Credit" || actualPaymentAmount <= 0) && existingReceipt?.id) {
      // Soft-delete automatic receipt if status converted back to Credit or payment amount is 0
      await supabase
        .from("receipts")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: profile.id,
          updated_by: profile.id,
        })
        .eq("id", existingReceipt.id);
    }

    const newCustomerId = updatedHeader?.customer_id || oldCustomerId;
    if (newCustomerId) {
      try {
        await recalculateCustomerBalance(supabase, newCustomerId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate new customer balance on invoice edit:", e);
        return NextResponse.json({ error: `Invoice updated, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    if (oldCustomerId && oldCustomerId !== newCustomerId) {
      try {
        await recalculateCustomerBalance(supabase, oldCustomerId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate old customer balance on invoice edit:", e);
      }
    }

    const { data: refreshedInvoice } = await supabase
      .from("invoices")
      .select("*, invoice_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({ success: true, invoice: refreshedInvoice ? mapInvoiceFromDb(refreshedInvoice) : updatedHeader ? mapInvoiceFromDb(updatedHeader) : null });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating invoice in Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to update invoice" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canSoftDeleteInvoice(profile)) {
      return NextResponse.json({ error: "Forbidden: Only super_admin can soft-delete invoices" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("invoices")
      .select("id, customer_id, is_deleted")
      .eq("id", id)
      .maybeSingle();

    if (!existing || existing.is_deleted) {
      return NextResponse.json({ error: "Invoice not found or already deleted" }, { status: 404 });
    }

    const targetCustomerId = existing.customer_id;

    // Soft-delete invoice (or hard delete fallback)
    let { error } = await supabase
      .from("invoices")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: profile.id,
        updated_by: profile.id,
      })
      .eq("id", id);

    if (error && (error.message.includes("is_deleted") || error.message.includes("deleted_by"))) {
      const deleteRes = await supabase.from("invoices").delete().eq("id", id);
      error = deleteRes.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (targetCustomerId) {
      try {
        await recalculateCustomerBalance(supabase, targetCustomerId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate customer balance on invoice soft-delete:", e);
        return NextResponse.json({ error: `Invoice deleted, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error soft-deleting invoice:", error);
    return NextResponse.json({ error: error.message || "Failed to soft-delete invoice" }, { status: 500 });
  }
}
