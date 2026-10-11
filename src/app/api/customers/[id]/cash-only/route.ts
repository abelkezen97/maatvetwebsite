import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/customers/:id/cash-only   { cashOnly: boolean, reason?: string }
 *
 * Admin of the customer's country only. A bounced cheque sets the flag
 * automatically; this is how an admin lifts it (or sets it by hand).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden: Only an Admin can change a customer's cash-only status." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body?.cashOnly !== "boolean") {
      return NextResponse.json({ error: "cashOnly (true or false) is required" }, { status: 400 });
    }
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    const client = createAdminClient() || supabase;
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("customers")
      .update({
        cash_only: body.cashOnly,
        cash_only_reason: body.cashOnly ? reason || "Set by admin" : null,
        cash_only_since: body.cashOnly ? now : null,
        updated_at: now,
        updated_by: profile.id,
      })
      .eq("id", id)
      .eq("country", profile.country)
      .select("id, company_name, cash_only, cash_only_reason")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: body.cashOnly ? "CUSTOMER_CASH_ONLY_SET" : "CUSTOMER_CASH_ONLY_CLEARED",
        details: { customer_id: id, company_name: data.company_name, reason: reason || undefined },
      }]);
    } catch {
      // audit logging must not block the action
    }

    return NextResponse.json({
      success: true,
      customer: { id: data.id, cashOnly: data.cash_only, cashOnlyReason: data.cash_only_reason || undefined },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}
