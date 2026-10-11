import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import {
  calculateSalespersonCollectionLedger,
  getMultiSalespersonLedgerSummaries,
} from "@/lib/db/collectionLedger";
import { getNormalizedDateRange } from "@/lib/dateUtils";

export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canViewCollectionLedger(profile)) {
      return NextResponse.json({ error: "Forbidden: Access denied to Collection Ledger" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const targetSalespersonId = searchParams.get("salespersonId") || searchParams.get("salesperson_id");
    const period = searchParams.get("period");
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const customStart = searchParams.get("startDate");
    const customEnd = searchParams.get("endDate");
    const mode = searchParams.get("mode");

    // Calculate normalized date range
    let startDate = customStart || undefined;
    let endDate = customEnd || undefined;

    if (period || (!startDate && !endDate)) {
      const range = getNormalizedDateRange({
        period: period || "month",
        year: year || undefined,
        month: month || undefined,
        customStart: customStart || undefined,
        customEnd: customEnd || undefined,
      });
      startDate = range.startDate;
      endDate = range.endDate;
    }

    // If Mode is 'all_summaries' and user is Accountant/Admin
    if (mode === "all_summaries" && Permissions.canViewAllLedgers(profile)) {
      const summaries = await getMultiSalespersonLedgerSummaries(
        supabase,
        profile.role,
        profile.country,
        { startDate, endDate }
      );
      return NextResponse.json({ summaries, startDate, endDate });
    }

    // Determine target salesperson
    let effectiveSalespersonId = profile.id;
    if (targetSalespersonId && targetSalespersonId !== profile.id) {
      if (!Permissions.canViewAllLedgers(profile)) {
        return NextResponse.json({ error: "Forbidden: Cannot view another salesperson's ledger" }, { status: 403 });
      }
      effectiveSalespersonId = targetSalespersonId;
    }

    const { summary, entries } = await calculateSalespersonCollectionLedger(
      supabase,
      effectiveSalespersonId,
      { startDate, endDate }
    );

    return NextResponse.json({ summary, entries, startDate, endDate });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch collection ledger:", error);
    return NextResponse.json({ error: "Failed to fetch collection ledger" }, { status: 500 });
  }
}
