import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapReceiptFromDb, mapReceiptToDb } from "@/lib/db/mappers";
import { recalculateCustomerBalance } from "@/lib/db/balances";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewReceipts(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view receipt" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Receipt ID is required" }, { status: 400 });
    }

    let query = supabase
      .from("receipts")
      .select("*, customers!left(company_name, doctor_name, pending_balance, assigned_salesman_id), invoices!left(invoice_number, salesman_id)")
      .eq("id", id);

    if (profile.role === "salesperson" || profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    let { data, error } = await query.eq("is_deleted", false).maybeSingle();

    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      const res = await supabase
        .from("receipts")
        .select("*, customers!left(company_name, doctor_name, pending_balance, assigned_salesman_id), invoices!left(invoice_number, salesman_id)")
        .eq("id", id)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (error || !data) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Additional server-side salesperson ownership check
    if (profile.role === "salesperson") {
      const isCreatedBy = data.created_by === profile.id;
      const isInvoiceOwner = data.invoices?.salesman_id === profile.id;
      const isCustomerOwner = data.customers?.assigned_salesman_id === profile.id;
      if (data.country !== profile.country || (!isCreatedBy && !isInvoiceOwner && !isCustomerOwner)) {
        return NextResponse.json({ error: "Forbidden: Cannot access another salesperson's receipt" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && data.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot access receipt in another country" }, { status: 403 });
    }

    const receipt = mapReceiptFromDb(data);
    return NextResponse.json(receipt);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error fetching receipt from Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch receipt" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canEditReceipt(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot edit receipt" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Receipt ID is required" }, { status: 400 });
    }

    let { data: existing, error: fetchErr } = await supabase
      .from("receipts")
      .select("*, customers!left(assigned_salesman_id), invoices!left(salesman_id)")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing || existing.is_deleted) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (profile.role === "salesperson") {
      const isCreatedBy = existing.created_by === profile.id;
      const isInvoiceOwner = existing.invoices?.salesman_id === profile.id;
      const isCustomerOwner = existing.customers?.assigned_salesman_id === profile.id;
      if (existing.country !== profile.country || (!isCreatedBy && !isInvoiceOwner && !isCustomerOwner)) {
        return NextResponse.json({ error: "Forbidden: Cannot edit another salesperson's receipt" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && existing.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot edit receipt in another country" }, { status: 403 });
    }

    const oldCustomerId = existing.customer_id;

    const payload = await request.json();

    if (payload.amountPaid !== undefined && Number(payload.amountPaid) <= 0) {
      return NextResponse.json(
        { error: "Receipt payment amount must be greater than 0" },
        { status: 400 }
      );
    }

    // 1. Integrity check if invoiceId or customerId changes
    const newInvoiceId = payload.invoiceId || existing.invoice_id;
    const newCustomerId = payload.customerId || existing.customer_id;

    if (newInvoiceId) {
      const { data: invRow, error: invErr } = await supabase
        .from("invoices")
        .select("id, customer_id")
        .eq("id", newInvoiceId)
        .maybeSingle();

      if (invErr || !invRow) {
        return NextResponse.json({ error: "Linked invoice not found" }, { status: 400 });
      }

      if (newCustomerId && invRow.customer_id && invRow.customer_id !== newCustomerId) {
        return NextResponse.json(
          { error: "Invoice/Customer Integrity Violation: Selected invoice belongs to another customer." },
          { status: 400 }
        );
      }
    }

    const updatePayload = mapReceiptToDb(payload);

    // IMMUTABLE / READ-ONLY FIELDS MUST NEVER BE SENT IN UPDATE/PATCH PAYLOAD
    delete updatePayload.id;
    delete updatePayload.receipt_number;
    delete updatePayload.created_by;
    delete updatePayload.created_at;
    delete updatePayload.country;
    delete updatePayload.is_deleted;
    delete updatePayload.deleted_at;
    delete updatePayload.deleted_by;

    updatePayload.updated_by = profile.id;
    updatePayload.updated_at = new Date().toISOString();

    let { data: updated, error: updateErr } = await supabase
      .from("receipts")
      .update(updatePayload)
      .eq("id", id)
      .select("*, customers!left(company_name, doctor_name, pending_balance)")
      .maybeSingle();

    if (updateErr && (updateErr.message.includes("updated_by") || updateErr.message.includes("country"))) {
      delete updatePayload.updated_by;
      delete updatePayload.country;

      const retryRes = await supabase
        .from("receipts")
        .update(updatePayload)
        .eq("id", id)
        .select("*, customers!left(company_name, doctor_name, pending_balance)")
        .maybeSingle();
      updated = retryRes.data;
      updateErr = retryRes.error;
    }

    if (updateErr) {
      console.error("Supabase update receipt error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const targetCustId = updated?.customer_id || newCustomerId;
    if (targetCustId) {
      try {
        await recalculateCustomerBalance(supabase, targetCustId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate target customer balance on receipt patch:", e);
        return NextResponse.json({ error: `Receipt updated, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    if (oldCustomerId && oldCustomerId !== targetCustId) {
      try {
        await recalculateCustomerBalance(supabase, oldCustomerId, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate old customer balance on receipt patch:", e);
      }
    }

    return NextResponse.json({ success: true, receipt: updated ? mapReceiptFromDb(updated) : null });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating receipt in Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to update receipt" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canSoftDeleteReceipt(profile)) {
      return NextResponse.json({ error: "Forbidden: Only super_admin can soft-delete receipts" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Receipt ID is required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("receipts")
      .select("id, customer_id, amount_paid, is_deleted")
      .eq("id", id)
      .maybeSingle();

    if (!existing || existing.is_deleted) {
      return NextResponse.json({ error: "Receipt not found or already deleted" }, { status: 404 });
    }

    // Soft delete receipt (or hard delete fallback)
    let { error: deleteErr } = await supabase
      .from("receipts")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: profile.id,
        updated_by: profile.id,
      })
      .eq("id", id);

    if (deleteErr && (deleteErr.message.includes("is_deleted") || deleteErr.message.includes("deleted_by"))) {
      const deleteRes = await supabase.from("receipts").delete().eq("id", id);
      deleteErr = deleteRes.error;
    }

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (existing?.customer_id) {
      try {
        await recalculateCustomerBalance(supabase, existing.customer_id, profile.id);
      } catch (e: any) {
        console.error("Failed to recalculate customer balance on receipt soft-delete:", e);
        return NextResponse.json({ error: `Receipt deleted, but customer balance recalculation failed: ${e.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Receipt deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error soft-deleting receipt from Supabase:", error);
    return NextResponse.json({ error: error.message || "Failed to soft-delete receipt" }, { status: 500 });
  }
}
