import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { buildCollectionDashboard, resolvePeriod } from "@/lib/dashboards/build";

export const dynamic = "force-dynamic";

/** GET /api/dashboards/collections?from=&to= : admin and accountant, active country. */
export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const sp = req.nextUrl.searchParams;
    const data = await buildCollectionDashboard(createAdminClient() || supabase, profile.country, resolvePeriod(sp.get("from"), sp.get("to")));
    return NextResponse.json(data);
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Could not build the collection dashboard" }, { status: 500 });
  }
}
