import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { reportByKey, reportsForRole } from "@/lib/reports/catalog";
import { buildReport, ReportParams } from "@/lib/reports/build";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/:key?from=YYYY-MM-DD&to=YYYY-MM-DD&salesman=&series=&method=&chequeStatus=&expenseStatus=&within=&overdueBy=
 * The report for the signed-in user's active country. Salesmen get only
 * their own figures; office-only reports are refused for them.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { profile, supabase } = await requireAuth();
    const { key } = await params;
    const def = reportByKey(key);
    if (!def) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (!reportsForRole(profile.role).some((r) => r.key === def.key)) {
      return NextResponse.json({ error: "This report is for the office only." }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const series = sp.get("series");
    const query: ReportParams = {
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      salesmanId: sp.get("salesman") || undefined,
      series: series === "standard" || series === "oman_reg" ? series : "",
      method: sp.get("method") || undefined,
      chequeStatus: sp.get("chequeStatus") || undefined,
      expenseStatus: sp.get("expenseStatus") || undefined,
      within: sp.get("within") ? Number(sp.get("within")) : undefined,
      overdueBy: sp.get("overdueBy") ? Number(sp.get("overdueBy")) : undefined,
      expiryWithin: sp.get("expiryWithin") !== null ? Number(sp.get("expiryWithin")) : undefined,
    };

    const report = await buildReport(supabase, profile, def, query);
    return NextResponse.json(report);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error building report:", error);
    return NextResponse.json({ error: error.message || "Could not build the report" }, { status: 500 });
  }
}
