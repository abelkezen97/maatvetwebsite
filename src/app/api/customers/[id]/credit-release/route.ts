import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/customers/:id/credit-release   { released: boolean, reason?: string }
 * Admin or accountant of the customer's country. Releasing lets salesmen sell on
 * credit to an overdue customer again; blocking again puts the rule back.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) {
      return NextResponse.json({ error: "Only an Admin or Accountant can release a blocked customer." }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body?.released !== "boolean") return NextResponse.json({ error: "released (true or false) is required" }, { status: 400 });
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const now = new Date().toISOString();
    const client = createAdminClient() || supabase;
    const { data, error } = await client
      .from("customers")
      .update({
        credit_released: body.released,
        credit_released_reason: body.released ? reason || "Released by office" : null,
        credit_released_by: body.released ? profile.id : null,
        credit_released_at: body.released ? now : null,
        updated_at: now,
        updated_by: profile.id,
      })
      .eq("id", id)
      .eq("country", profile.country)
      .select("id, company_name, credit_released")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: body.released ? "CUSTOMER_CREDIT_RELEASED" : "CUSTOMER_CREDIT_BLOCKED",
        details: { customer_id: id, company_name: data.company_name, reason: reason || undefined },
      }]);
    } catch {}
    return NextResponse.json({ success: true, released: data.credit_released });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}
