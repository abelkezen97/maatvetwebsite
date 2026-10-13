import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { COMMISSION_COUNTRIES, buildCommissionReport } from "@/lib/db/commission";

export const dynamic = "force-dynamic";

async function parse(request: Request) {
  const body = await request.json().catch(() => ({}));
  return {
    salesmanId: String(body?.salesmanId || ""),
    year: Math.floor(Number(body?.year)),
    quarter: Math.floor(Number(body?.quarter)),
    notes: typeof body?.notes === "string" ? body.notes.trim() : "",
  };
}

/**
 * POST /api/commission/payouts  { salesmanId, year, quarter, notes? }
 * Admin or Accountant records a salesman's commission for a quarter as paid.
 * The amounts are worked out on the server at that moment.
 */
export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile) || !COMMISSION_COUNTRIES.includes(profile.country)) {
      return NextResponse.json({ error: "Forbidden: Only an Admin or Accountant can record commission payments." }, { status: 403 });
    }
    const { salesmanId, year, quarter, notes } = await parse(request);
    if (!salesmanId || !(year >= 2000 && year <= 2100) || !(quarter >= 1 && quarter <= 4)) {
      return NextResponse.json({ error: "salesmanId, year and quarter are required" }, { status: 400 });
    }

    const client = createAdminClient() || supabase;
    const { data: salesman } = await client
      .from("profiles")
      .select("id, full_name, role, country")
      .eq("id", salesmanId)
      .maybeSingle();
    if (!salesman || salesman.role !== "salesperson" || salesman.country !== profile.country) {
      return NextResponse.json({ error: "Salesman not found" }, { status: 404 });
    }

    const report = await buildCommissionReport(client, profile.country, [{ id: salesman.id, name: salesman.full_name }], year, quarter);
    const s = report.salesmen[0];

    const { data, error } = await client
      .from("commission_payouts")
      .upsert(
        [{
          salesman_id: salesman.id,
          country: profile.country,
          year,
          quarter,
          eligible_amount: s.eligibleTotal,
          commission_amount: s.commission,
          notes: notes || null,
          paid_at: new Date().toISOString(),
          paid_by: profile.id,
        }],
        { onConflict: "salesman_id,year,quarter" }
      )
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: "COMMISSION_PAID",
        target_user: salesman.id,
        details: { year, quarter, eligible: s.eligibleTotal, commission: s.commission },
      }]);
    } catch {
      // audit logging must not block the action
    }

    return NextResponse.json({ success: true, payout: data });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Failed to record payment" }, { status: 500 });
  }
}

/**
 * DELETE /api/commission/payouts  { salesmanId, year, quarter }
 * Admin only: undo a "paid" record entered by mistake.
 */
export async function DELETE(request: Request) {
  try {
    const { profile, supabase } = await requireAuth(["super_admin", "accountant"]);
    const { salesmanId, year, quarter } = await parse(request);
    const client = createAdminClient() || supabase;
    const { data, error } = await client
      .from("commission_payouts")
      .delete()
      .eq("salesman_id", salesmanId)
      .eq("year", year)
      .eq("quarter", quarter)
      .eq("country", profile.country)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ error: "No payment recorded for that quarter" }, { status: 404 });

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: "COMMISSION_PAYMENT_UNDONE",
        target_user: salesmanId,
        details: { year, quarter },
      }]);
    } catch {
      // audit logging must not block the action
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Failed to undo payment" }, { status: 500 });
  }
}
