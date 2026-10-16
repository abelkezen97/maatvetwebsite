import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { buildPerformance } from "@/lib/performance/build";
import { PerfPeriodKind } from "@/lib/performance/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/performance?period=day|half|month&date=YYYY-MM-DD&salesman=<id>
 * Salesman performance for the admin's active country. Admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "The performance report is for the admin only." }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const p = sp.get("period");
    const kind: PerfPeriodKind = p === "day" || p === "half" ? p : "month";
    const report = await buildPerformance(supabase, profile, {
      kind,
      date: sp.get("date") || undefined,
      salesmanId: sp.get("salesman") || undefined,
    });
    return NextResponse.json(report);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error building performance report:", error);
    return NextResponse.json({ error: error.message || "Could not build the performance report" }, { status: 500 });
  }
}
