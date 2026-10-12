import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { COMMISSION_COUNTRIES, buildCommissionReport, commissionSalesmenFor, quarterOf, todayInDubai } from "@/lib/db/commission";

export const dynamic = "force-dynamic";

/**
 * GET /api/commission?year=2026&quarter=4
 * Quarter report: per salesman eligible / late collections, commission by band,
 * payout status, and open invoices still inside the 100-day window.
 */
export async function GET(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!COMMISSION_COUNTRIES.includes(profile.country)) {
      return NextResponse.json({ enabled: false });
    }

    const { searchParams } = new URL(request.url);
    const now = quarterOf(new Date(todayInDubai()));
    const year = Number(searchParams.get("year")) || now.year;
    const quarterRaw = Number(searchParams.get("quarter")) || now.quarter;
    const quarter = Math.min(4, Math.max(1, Math.floor(quarterRaw)));

    const client = createAdminClient() || supabase;
    const salesmen = await commissionSalesmenFor(client, profile);
    const report = await buildCommissionReport(client, profile.country, salesmen, year, quarter);
    return NextResponse.json({ enabled: true, canMarkPaid: isCountryStaff(profile), ...report });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Commission report failed:", error);
    return NextResponse.json({ error: error.message || "Failed to load commission" }, { status: 500 });
  }
}
