import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { recalculateCustomerBalance } from "@/lib/db/balances";
import { mapReceiptFromDb } from "@/lib/db/mappers";

export const dynamic = "force-dynamic";

type ChequeAction = "received" | "clear" | "bounce";

/**
 * POST /api/receipts/:id/cheque   { action: "received" | "clear" | "bounce", reason?: string }
 *
 * Admin or Accountant of the receipt's country only.
 *  - received: the office has the cheque from the salesperson (leaves their "cheques in hand")
 *  - clear:    the cheque has cleared; it now counts as paid
 *  - bounce:   the cheque bounced; its invoices reopen automatically and the
 *              customer becomes cash only until an admin removes the flag
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) {
      return NextResponse.json({ error: "Forbidden: Only an Admin or Accountant can update cheques." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action as ChequeAction;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!["received", "clear", "bounce"].includes(action)) {
      return NextResponse.json({ error: "action must be received, clear or bounce" }, { status: 400 });
    }

    const client = createAdminClient() || supabase;
    const { data: receipt } = await client
      .from("receipts")
      .select("id, receipt_number, customer_id, country, payment_method, cheque_number, cheque_status, cheque_received_at, is_deleted, payment_group_id")
      .eq("id", id)
      .eq("country", profile.country)
      .maybeSingle();

    if (!receipt || receipt.is_deleted) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    if (receipt.payment_method !== "Cheque" || !receipt.cheque_status) {
      return NextResponse.json({ error: "This receipt is not a cheque payment." }, { status: 400 });
    }
    if (receipt.cheque_status !== "Pending") {
      return NextResponse.json({ error: `This cheque is already ${receipt.cheque_status.toLowerCase()}.` }, { status: 400 });
    }

    const now = new Date().toISOString();
    let update: Record<string, any> = { updated_at: now, updated_by: profile.id };

    if (action === "received") {
      if (receipt.cheque_received_at) {
        return NextResponse.json({ error: "The office already has this cheque." }, { status: 400 });
      }
      update = { ...update, cheque_received_at: now, cheque_received_by: profile.id };
    } else if (action === "clear") {
      update = {
        ...update,
        cheque_status: "Cleared",
        cleared_at: now,
        cleared_by: profile.id,
        cheque_received_at: receipt.cheque_received_at || now,
        cheque_received_by: receipt.cheque_received_at ? undefined : profile.id,
      };
    } else {
      update = {
        ...update,
        cheque_status: "Bounced",
        bounced_at: now,
        bounced_by: profile.id,
        bounce_reason: reason || null,
        cheque_received_at: receipt.cheque_received_at || now,
        cheque_received_by: receipt.cheque_received_at ? undefined : profile.id,
      };
    }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    // Only move a cheque that is still Pending (guards against two people clicking at once).
    // One cheque split over a UAE- and an Oman-registered receipt moves both together.
    const { data: updatedRows, error } = await client
      .from("receipts")
      .update(update)
      .eq(receipt.payment_group_id ? "payment_group_id" : "id", receipt.payment_group_id || id)
      .eq("cheque_status", "Pending")
      .eq("is_deleted", false)
      .select("*, customers!left(company_name, doctor_name, pending_balance), receipt_allocations(invoice_id, amount, invoices(invoice_number))");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const updated = (updatedRows || []).find((row: any) => row.id === id) || (updatedRows || [])[0];
    if (!updated) {
      return NextResponse.json({ error: "This cheque was just updated by someone else. Refresh and try again." }, { status: 409 });
    }

    if (action === "bounce" && receipt.customer_id) {
      await client
        .from("customers")
        .update({
          cash_only: true,
          cash_only_reason: `Cheque ${receipt.cheque_number || receipt.receipt_number} bounced${reason ? `: ${reason}` : ""}`,
          cash_only_since: now,
          updated_at: now,
        })
        .eq("id", receipt.customer_id);
    }

    if (action !== "received" && receipt.customer_id) {
      await recalculateCustomerBalance(supabase, receipt.customer_id, profile.id);
    }

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: `CHEQUE_${action.toUpperCase()}`,
        details: {
          receipt_id: id,
          receipt_numbers: (updatedRows || []).map((row: any) => row.receipt_number),
          cheque_number: receipt.cheque_number,
          reason: reason || undefined,
        },
      }]);
    } catch {
      // audit logging must not block the action
    }

    return NextResponse.json({
      success: true,
      receipt: mapReceiptFromDb(updated),
      receipts: (updatedRows || []).map((row: any) => mapReceiptFromDb(row)),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Cheque update failed:", error);
    return NextResponse.json({ error: "Failed to update cheque" }, { status: 500 });
  }
}
