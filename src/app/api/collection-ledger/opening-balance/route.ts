import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { calculateSalespersonCollectionLedger } from "@/lib/db/collectionLedger";

export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();

    // 1. Authorization: Only Admin or Accountant can set opening balance
    if (!Permissions.canSetOpeningBalance(profile)) {
      return NextResponse.json(
        { error: "Forbidden: Only Admin or Accountant can set opening balance" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { salespersonId, amount, openingCash, effectiveDate, businessDate, country, notes } = body;

    const targetSalespersonId = salespersonId || body.salesperson_id;
    const rawAmount = amount !== undefined ? amount : openingCash;
    const targetAmount = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount || 0));
    const targetDate = effectiveDate || businessDate || body.effective_date || new Date().toISOString().split("T")[0];

    // 2. Validate Salesperson ID
    if (!targetSalespersonId) {
      return NextResponse.json({ error: "salespersonId is required" }, { status: 400 });
    }

    // 3. Validate Amount (must be numeric and non-negative)
    if (isNaN(targetAmount) || targetAmount < 0) {
      return NextResponse.json({ error: "Opening balance amount must be a non-negative number" }, { status: 400 });
    }

    // 4. Retrieve Target Salesperson Profile from Database
    const { data: targetProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, country")
      .eq("id", targetSalespersonId)
      .maybeSingle();

    if (profileErr || !targetProfile) {
      return NextResponse.json({ error: "Salesperson not found" }, { status: 404 });
    }

    // 5. Country Validation & Isolation
    // Staff set opening balances only for salespeople of their own country.
    if (targetProfile.country !== profile.country || (country && country !== profile.country)) {
      return NextResponse.json(
        { error: "Forbidden: Salesperson is in another country" },
        { status: 403 }
      );
    }
    const targetCountry = profile.country === "Oman" ? "Oman" : "UAE";

    // 6. Atomic Upsert Check (salesperson_id + country + effective_date)
    const { data: existingOb } = await supabase
      .from("salesperson_opening_balances")
      .select("id")
      .eq("salesperson_id", targetSalespersonId)
      .eq("country", targetCountry)
      .eq("effective_date", targetDate)
      .maybeSingle();

    let savedRecord: any = null;

    if (existingOb?.id) {
      // Edit existing record
      const { data: updated, error: updateErr } = await supabase
        .from("salesperson_opening_balances")
        .update({
          opening_cash: targetAmount,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingOb.id)
        .select()
        .single();

      if (updateErr) {
        console.error("Failed to update opening balance:", updateErr);
        return NextResponse.json({ error: "Failed to update opening balance" }, { status: 500 });
      }
      savedRecord = updated;
    } else {
      // Insert new record
      const { data: inserted, error: insertErr } = await supabase
        .from("salesperson_opening_balances")
        .insert([{
          salesperson_id: targetSalespersonId,
          country: targetCountry,
          effective_date: targetDate,
          opening_cash: targetAmount,
          notes: notes || null,
          created_by: profile.id,
        }])
        .select()
        .single();

      if (insertErr) {
        console.error("Failed to insert opening balance:", insertErr);
        return NextResponse.json({ error: "Failed to create opening balance" }, { status: 500 });
      }
      savedRecord = inserted;
    }

    // 7. Calculate authoritative collection ledger with updated opening balance
    const { summary } = await calculateSalespersonCollectionLedger(
      supabase,
      targetSalespersonId,
      { startDate: targetDate }
    );

    return NextResponse.json({
      success: true,
      openingBalance: savedRecord,
      summary,
      currentCashInHand: summary.currentCashInHand,
      message: "Opening balance saved successfully",
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to save opening balance:", error);
    return NextResponse.json({ error: "Failed to save opening balance" }, { status: 500 });
  }
}
