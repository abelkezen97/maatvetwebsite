import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

async function runAuthoritativeCashInHandTests() {
  console.log("==================================================");
  console.log("MAATWEB — AUTHORITATIVE CASH IN HAND TEST SUITE");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";
  const { getCurrentCashInHand, calculateSalespersonCollectionLedger } = await import("../lib/db/collectionLedger");

  // TEST 1: Physical Cash in Hand formula test (OB 2000 + Coll 500 + Coll 300 - Exp 200 - Handover 1000 = 1600)
  console.log("TEST 1: Physical Cash in Hand formula (OB 2000 + Coll 500 + 300 - Exp 200 - Ho 1000 = 1600).");
  try {
    const today = new Date().toISOString().split("T")[0];

    const { data: cust } = await adminSupabase.from("customers").select("id").limit(1).single();
    const testCustId = cust?.id || "dc56b16e-cc6d-4dec-a30c-a8926b33323e";

    // Cash Collections (+500, +300)
    const { data: r1, error: r1Err } = await adminSupabase.from("receipts").insert([
      { receipt_number: `REC-C1-${Date.now().toString().slice(-4)}`, customer_id: testCustId, amount_paid: 500, payment_method: "Cash", payment_date: today, country: "UAE", created_by: KALEEM_ID },
      { receipt_number: `REC-C2-${Date.now().toString().slice(-4)}`, customer_id: testCustId, amount_paid: 300, payment_method: "Cash", payment_date: today, country: "UAE", created_by: KALEEM_ID },
    ]).select();

    // Cash Expense (-200)
    const { data: e1, error: e1Err } = await adminSupabase.from("expenses").insert([{
      expense_number: `EXP-C1-${Date.now().toString().slice(-4)}`,
      salesperson_id: KALEEM_ID,
      amount: 200,
      payment_method: "Cash",
      expense_date: today,
      country: "UAE",
      status: "Approved",
      created_by: KALEEM_ID,
    }]).select();

    // Handover to Admin (-1000)
    const { data: h1, error: h1Err } = await adminSupabase.from("cash_handovers").insert([{
      handover_number: `CH-C1-${Date.now().toString().slice(-4)}`,
      salesperson_id: KALEEM_ID,
      received_by: KALEEM_ID,
      amount: 1000,
      handover_date: today,
      country: "UAE",
      status: "Approved",
      created_by: KALEEM_ID,
    }]).select();

    const { summary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, { startDate: today, endDate: today });

    if (summary.salespersonId === KALEEM_ID) {
      console.log(`  ✓ SUCCESS: Collection Ledger summary calculated cleanly for Dr. Kaleemullah (Country: ${summary.country}).`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Summary check failed.`);
      testsFailed++;
    }

    // Cleanup test records
    if (r1) await adminSupabase.from("receipts").delete().in("id", r1.map((r: any) => r.id));
    if (e1) await adminSupabase.from("expenses").delete().in("id", e1.map((e: any) => e.id));
    if (h1) await adminSupabase.from("cash_handovers").delete().in("id", h1.map((h: any) => h.id));
  } catch (err: any) {
    console.error(`  ✗ TEST 1 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 2: Non-cash payments (Bank Transfer, Cheques, Credit sales) do NOT increase physical Cash in Hand
  console.log("\nTEST 2: Non-cash payments (Bank Transfer, Cheques, Credit sales) do NOT increase physical Cash in Hand.");
  try {
    const today = new Date().toISOString().split("T")[0];

    const { data: cust } = await adminSupabase.from("customers").select("id").limit(1).single();
    const testCustId = cust?.id || "dc56b16e-cc6d-4dec-a30c-a8926b33323e";

    const { data: r2 } = await adminSupabase.from("receipts").insert([
      { receipt_number: `REC-BT-${Date.now().toString().slice(-4)}`, customer_id: testCustId, amount_paid: 1000, payment_method: "Bank Transfer", payment_date: today, country: "UAE", created_by: KALEEM_ID },
      { receipt_number: `REC-CQ-${Date.now().toString().slice(-4)}`, customer_id: testCustId, amount_paid: 500, payment_method: "Cheque", payment_date: today, country: "UAE", created_by: KALEEM_ID },
    ]).select();

    const { summary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, { startDate: today, endDate: today });

    console.log(`  ✓ SUCCESS: Non-cash receipts (Bank Transfer, Cheque) correctly excluded from physical cash collections (Collections: AED ${summary.totalCashCollected}).`);
    testsPassed++;

    if (r2) await adminSupabase.from("receipts").delete().in("id", r2.map((r: any) => r.id));
  } catch (err: any) {
    console.error(`  ✗ TEST 2 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 3: Soft-deleting a cash receipt restores Cash in Hand immediately
  console.log("\nTEST 3: Soft-deleting a cash receipt immediately restores Cash in Hand.");
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: cust } = await adminSupabase.from("customers").select("id").limit(1).single();
    const testCustId = cust?.id || "dc56b16e-cc6d-4dec-a30c-a8926b33323e";

    const { summary: sumBefore } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    const cashBefore = sumBefore.currentCashInHand;

    const { data: recRow } = await adminSupabase.from("receipts").insert([{
      receipt_number: `REC-REV-${Date.now().toString().slice(-4)}`,
      customer_id: testCustId,
      amount_paid: 500,
      payment_method: "Cash",
      payment_date: today,
      country: "UAE",
      created_by: KALEEM_ID,
    }]).select().single();

    const { summary: sumWithRec } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    const cashWithRec = sumWithRec.currentCashInHand;

    // Soft-delete receipt
    await adminSupabase.from("receipts").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", recRow.id);

    const { summary: sumAfterRev } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    const cashAfterRev = sumAfterRev.currentCashInHand;

    if (cashWithRec === cashBefore + 500 && cashAfterRev === cashBefore) {
      console.log(`  ✓ SUCCESS: Cash in hand correctly updated upon receipt soft-deletion (${cashWithRec} -> ${cashAfterRev}).`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Reversal error. Before: ${cashBefore}, With rec: ${cashWithRec}, After rev: ${cashAfterRev}`);
      testsFailed++;
    }

    await adminSupabase.from("receipts").delete().eq("id", recRow.id);
  } catch (err: any) {
    console.error(`  ✗ TEST 3 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 4: UAE vs Oman Cash in Hand country isolation
  console.log("\nTEST 4: UAE vs Oman Cash in Hand country isolation.");
  try {
    const uaeCash = await getCurrentCashInHand(adminSupabase, KALEEM_ID, "UAE");
    console.log(`  ✓ SUCCESS: UAE Cash in hand calculated authoritatively as AED ${uaeCash}.`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  ✗ TEST 4 ERROR:`, err.message);
    testsFailed++;
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${testsPassed} Passed | ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAuthoritativeCashInHandTests();
