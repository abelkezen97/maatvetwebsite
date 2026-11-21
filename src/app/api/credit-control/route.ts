import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { creditState, loadCreditPolicy, mapCreditStatus } from "@/lib/db/creditControl";

export const dynamic = "force-dynamic";

/** GET: every customer with open invoices, aged, with limit, exposure and block state. Admin / accountant. */
export async function GET() {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const client = createAdminClient() || supabase;
    const policy = await loadCreditPolicy(client, profile.country);

    const { data: custs, error: cErr } = await client
      .from("customers")
      .select("id, company_name, doctor_name, assigned_salesman_id, credit_limit, cash_only, credit_released, credit_released_reason, is_active")
      .eq("country", profile.country);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    const ids = (custs || []).map((c: any) => c.id);
    if (ids.length === 0) return NextResponse.json({ policy, rows: [] });

    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await client.from("customer_credit_status").select("*").in("customer_id", ids.slice(i, i + 300));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows.push(...(data || []));
    }
    const status = new Map(rows.map((r) => [r.customer_id, mapCreditStatus(r)]));

    const { data: people } = await client.from("profiles").select("id, full_name").eq("country", profile.country);
    const names = new Map((people || []).map((p: any) => [p.id, p.full_name]));

    const out = (custs || [])
      .filter((c: any) => status.has(c.id))
      .map((c: any) => {
        const s = status.get(c.id)!;
        const limit = Number(c.credit_limit) || 0;
        return {
          id: c.id,
          company: c.company_name,
          doctor: c.doctor_name || "",
          salesman: names.get(c.assigned_salesman_id) || "",
          creditLimit: limit,
          overLimit: limit > 0 && s.openAmount > limit,
          cashOnly: !!c.cash_only,
          released: !!c.credit_released,
          releasedReason: c.credit_released_reason || "",
          state: creditState(s.maxDaysOverdue, policy, !!c.credit_released),
          ...s,
        };
      })
      .sort((a: any, b: any) => b.maxDaysOverdue - a.maxDaysOverdue || b.openAmount - a.openAmount);

    return NextResponse.json({ policy, rows: out });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not load credit control" }, { status: 500 });
  }
}
