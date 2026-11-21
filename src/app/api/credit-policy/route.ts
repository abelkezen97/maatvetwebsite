import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadCreditPolicy } from "@/lib/db/creditControl";

export const dynamic = "force-dynamic";

/** GET: the credit policy of the user's country. PUT: change it (admin only). */
export async function GET() {
  try {
    const { profile, supabase } = await requireAuth();
    return NextResponse.json(await loadCreditPolicy(supabase, profile.country));
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not load the credit policy" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Only the admin can change the credit policy." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const blockAfter = Math.round(Number(body.blockAfterDays));
    const defDays = Math.round(Number(body.defaultCreditDays));
    if (!Number.isFinite(blockAfter) || blockAfter < 1 || blockAfter > 1000) {
      return NextResponse.json({ error: "Block after must be between 1 and 1000 days." }, { status: 400 });
    }
    if (!Number.isFinite(defDays) || defDays < 0 || defDays > 365) {
      return NextResponse.json({ error: "Default credit days must be between 0 and 365." }, { status: 400 });
    }
    const client = createAdminClient() || supabase;
    const { error } = await client.from("credit_policy").upsert({
      country: profile.country,
      block_enabled: body.blockEnabled !== false,
      block_after_days: blockAfter,
      default_credit_days: defDays,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ blockEnabled: body.blockEnabled !== false, blockAfterDays: blockAfter, defaultCreditDays: defDays });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not save the credit policy" }, { status: 500 });
  }
}
