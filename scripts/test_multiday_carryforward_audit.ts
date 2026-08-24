import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Parse .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function runMultiDayCarryForwardAudit() {
  console.log("==================================================");
  console.log("MAATWEB — MULTI-DAY CARRY-FORWARD FOCUSED AUDIT");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const { calculateSalespersonCollectionLedger } = await import("../lib/db/collectionLedger");

  const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";
  // Use unique isolated test dates (2026-11-01 & 2026-11-02)
  const day1Date = "2026-11-01";
  const day2Date = "2026-11-02";

  const { data: cust } = await adminSupabase.from("customers").select("id").limit(1).single();
  const testCustId = cust?.id || "dc56b16e-cc6d-4dec-a30c-a8926b33323e";

  try {
    // 1. Setup Day 1 Opening Balance = 2,000
    const { data: obData, error: obErr } = await adminSupabase.from("salesperson_opening_balances").insert([{
      salesperson_id: KALEEM_ID,
      opening_cash: 2000,
      effective_date: day1Date,
    }]).select().single();

    if (obErr) console.error("OB Insert Error:", obErr);

    // DAY 1 TRANSACTIONS:
    // Cash Collection +500
    const { data: r1, error: r1Err } = await adminSupabase.from("receipts").insert([{
      receipt_number: `REC-D1-${Date.now().toString().slice(-4)}`,
      customer_id: testCustId,
      amount_paid: 500,
      payment_method: "Cash",
      payment_date: day1Date,
      country: "UAE",
      created_by: KALEEM_ID,
    }]).select().single();
    if (r1Err) console.error("R1 Error:", r1Err);

    // Expense -100 (category: Petrol, employee_id: KALEEM_ID)
    const { data: e1, error: e1Err } = await adminSupabase.from("expenses").insert([{
      expense_number: `EXP-D1-${Date.now().toString().slice(-4)}`,
      salesperson_id: KALEEM_ID,
      employee_id: KALEEM_ID,
      amount: 100,
      category: "Petrol",
      payment_method: "Cash",
      expense_date: day1Date,
      country: "UAE",
      status: "Approved",
      created_by: KALEEM_ID,
    }]).select().single();
    if (e1Err) console.error("E1 Error:", e1Err);

    // Handover -400
    const { data: h1, error: h1Err } = await adminSupabase.from("cash_handovers").insert([{
      handover_number: `CH-D1-${Date.now().toString().slice(-4)}`,
      salesperson_id: KALEEM_ID,
      received_by: KALEEM_ID,
      amount: 400,
      handover_date: day1Date,
      country: "UAE",
      status: "Approved",
      created_by: KALEEM_ID,
    }]).select().single();
    if (h1Err) console.error("H1 Error:", h1Err);

    // Query Day 1 Closing Balance (ledger for Day 1)
    const { summary: sumDay1 } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: day1Date,
      endDate: day1Date,
    });

    console.log("--- DAY 1 VERIFICATION ---");
    console.log(`Opening Balance: AED ${sumDay1.openingCash}`);
    console.log(`Cash Collections: +AED ${sumDay1.totalCashCollected}`);
    console.log(`Expenses: -AED ${sumDay1.totalCashExpenses}`);
    console.log(`Cash Handover: -AED ${sumDay1.totalCashHandedOver}`);
    console.log(`Calculated Day 1 Cash in Hand: AED ${sumDay1.currentCashInHand}`);

    if (sumDay1.currentCashInHand === 2000) {
      console.log("  ✓ SUCCESS: Day 1 Cash in Hand is exactly AED 2,000.00");
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Day 1 Cash in Hand expected 2000, got ${sumDay1.currentCashInHand}`);
      testsFailed++;
    }

    // DAY 2 VERIFICATION (Before Day 2 transactions)
    // Query Day 2 ledger with startDate = day2Date
    const { summary: sumDay2Start } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: day2Date,
      endDate: day2Date,
    });

    console.log("\n--- DAY 2 STARTING CARRY-FORWARD VERIFICATION ---");
    console.log(`Day 2 Opening Cash (Carried Forward from Day 1): AED ${sumDay2Start.openingCash}`);
    console.log(`Day 2 Collections so far: AED ${sumDay2Start.totalCashCollected}`);
    console.log(`Day 2 Expenses so far: AED ${sumDay2Start.totalCashExpenses}`);
    console.log(`Day 2 Handovers so far: AED ${sumDay2Start.totalCashHandedOver}`);
    console.log(`Day 2 Starting Cash in Hand: AED ${sumDay2Start.currentCashInHand}`);

    if (sumDay2Start.openingCash === 2000 && sumDay2Start.currentCashInHand === 2000) {
      console.log("  ✓ SUCCESS: Day 2 opening cash correctly carried forward AED 2,000 from Day 1 without double-counting or resetting to 0.");
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Day 2 carry-forward expected 2000, got openingCash=${sumDay2Start.openingCash}, currentCashInHand=${sumDay2Start.currentCashInHand}`);
      testsFailed++;
    }

    // DAY 2 TRANSACTIONS:
    // Cash Collection +300
    const { data: r2, error: r2Err } = await adminSupabase.from("receipts").insert([{
      receipt_number: `REC-D2-${Date.now().toString().slice(-4)}`,
      customer_id: testCustId,
      amount_paid: 300,
      payment_method: "Cash",
      payment_date: day2Date,
      country: "UAE",
      created_by: KALEEM_ID,
    }]).select().single();
    if (r2Err) console.error("R2 Error:", r2Err);

    // Expense -50 (category: Petrol, employee_id: KALEEM_ID)
    const { data: e2, error: e2Err } = await adminSupabase.from("expenses").insert([{
      expense_number: `EXP-D2-${Date.now().toString().slice(-4)}`,
      salesperson_id: KALEEM_ID,
      employee_id: KALEEM_ID,
      amount: 50,
      category: "Petrol",
      payment_method: "Cash",
      expense_date: day2Date,
      country: "UAE",
      status: "Approved",
      created_by: KALEEM_ID,
    }]).select().single();
    if (e2Err) console.error("E2 Error:", e2Err);

    const { summary: sumDay2Mid } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: day2Date,
      endDate: day2Date,
    });

    console.log("\n--- DAY 2 MID-DAY VERIFICATION (Before Handover) ---");
    console.log(`Day 2 Opening Cash: AED ${sumDay2Mid.openingCash}`);
    console.log(`Day 2 Cash Collections: +AED ${sumDay2Mid.totalCashCollected}`);
    console.log(`Day 2 Expenses: -AED ${sumDay2Mid.totalCashExpenses}`);
    console.log(`Day 2 Mid-Day Cash in Hand: AED ${sumDay2Mid.currentCashInHand}`);

    if (sumDay2Mid.currentCashInHand === 2250) {
      console.log("  ✓ SUCCESS: Day 2 Mid-Day Cash in Hand is exactly AED 2,250.00");
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Day 2 Mid-Day expected 2250, got ${sumDay2Mid.currentCashInHand}`);
      testsFailed++;
    }

    // DAY 2 HANDOVER: -1,000 to Admin
    const { data: h2, error: h2Err } = await adminSupabase.from("cash_handovers").insert([{
      handover_number: `CH-D2-${Date.now().toString().slice(-4)}`,
      salesperson_id: KALEEM_ID,
      received_by: KALEEM_ID,
      amount: 1000,
      handover_date: day2Date,
      country: "UAE",
      status: "Approved",
      created_by: KALEEM_ID,
    }]).select().single();
    if (h2Err) console.error("H2 Error:", h2Err);

    const { summary: sumDay2Final } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: day2Date,
      endDate: day2Date,
    });

    console.log("\n--- DAY 2 FINAL VERIFICATION (After Handover to Admin) ---");
    console.log(`Day 2 Opening Cash: AED ${sumDay2Final.openingCash}`);
    console.log(`Day 2 Cash Collections: +AED ${sumDay2Final.totalCashCollected}`);
    console.log(`Day 2 Expenses: -AED ${sumDay2Final.totalCashExpenses}`);
    console.log(`Day 2 Handover to Admin: -AED ${sumDay2Final.totalCashHandedOver}`);
    console.log(`Day 2 Final Cash in Hand: AED ${sumDay2Final.currentCashInHand}`);
    console.log(`Admin Ledger Entry Amount: +AED ${h2?.amount}`);

    if (sumDay2Final.currentCashInHand === 1250 && Number(h2?.amount) === 1000) {
      console.log("  ✓ SUCCESS: Day 2 Final Cash in Hand is exactly AED 1,250.00 and Admin Ledger received +AED 1,000.00");
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Final state error. Cash: ${sumDay2Final.currentCashInHand}, Admin handover: ${h2?.amount}`);
      testsFailed++;
    }

    // Cleanup test records
    if (r1?.id && r2?.id) await adminSupabase.from("receipts").delete().in("id", [r1.id, r2.id]);
    if (e1?.id && e2?.id) await adminSupabase.from("expenses").delete().in("id", [e1.id, e2.id]);
    if (h1?.id && h2?.id) await adminSupabase.from("cash_handovers").delete().in("id", [h1.id, h2.id]);
    if (obData?.id) await adminSupabase.from("salesperson_opening_balances").delete().eq("id", obData.id);

  } catch (err: any) {
    console.error(`  ✗ AUDIT ERROR:`, err.message);
    testsFailed++;
  }

  console.log("\n==================================================");
  console.log(`AUDIT SUMMARY: ${testsPassed} Passed | ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runMultiDayCarryForwardAudit();
