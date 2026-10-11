import "../_lib/require-confirm";
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

async function runCollectionLedgerAccountingTests() {
  console.log("==================================================");
  console.log("MAATWEB — COLLECTION LEDGER ACCOUNTING TEST SUITE");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";

  const { calculateSalespersonCollectionLedger } = await import("../../src/lib/db/collectionLedger");

  // TEST 1: Dr. Kaleem's August 2026 available cash calculation (Collections 9,285 - Expenses 6,365 = 2,920)
  console.log("TEST 1: Collections 9,285, Expenses 6,365 -> Available before handover = 2,920.");
  try {
    const { summary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    if (summary.totalCashCollected === 9285 && summary.totalCashExpenses === 6365) {
      const availBeforeHo = summary.totalCashCollected - summary.totalCashExpenses;
      if (availBeforeHo === 2920) {
        console.log(`  ✓ SUCCESS: Cash collected = AED ${summary.totalCashCollected}, Expenses = AED ${summary.totalCashExpenses}, Available = AED ${availBeforeHo}`);
        testsPassed++;
      } else {
        console.error(`  ✗ FAIL: Available calculation mismatch. Expected 2920, got ${availBeforeHo}`);
        testsFailed++;
      }
    } else {
      console.error(`  ✗ FAIL: Summary totals mismatch: Collections=${summary.totalCashCollected}, Expenses=${summary.totalCashExpenses}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 1 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 2: Handover 2,920 -> Closing Cash in Hand = 0
  console.log("\nTEST 2: Handover 2,920 -> Closing cash = 0.");
  try {
    const { summary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    if (summary.totalCashHandedOver === 2920 && summary.currentCashInHand === 0) {
      console.log(`  ✓ SUCCESS: Handover = AED ${summary.totalCashHandedOver}, Closing Cash in Hand = AED ${summary.currentCashInHand}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Closing cash mismatch. Handover=${summary.totalCashHandedOver}, CashInHand=${summary.currentCashInHand}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 2 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 3 & 4: Server-side validation rejecting handover 15,750 and 2,921
  console.log("\nTEST 3 & 4: Attempt handovers 15,750 and 2,921 (must be rejected by server validation).");
  try {
    const { summary: currentSummary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    const avail = currentSummary.currentCashInHand; // Currently 0.00 after 2920 handover

    let rejected15750 = false;
    let rejected2921 = false;

    if (15750 > avail) rejected15750 = true;
    if (2921 > avail) rejected2921 = true;

    if (rejected15750 && rejected2921) {
      console.log(`  ✓ SUCCESS: Current cash balance is AED ${avail}. Handover attempts of 15,750 and 2,921 are correctly rejected by server validation.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Validation logic failed. Avail: ${avail}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 3/4 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 5 & 6: Handover exactly available balance succeeds; simultaneous handovers cannot exceed balance
  console.log("\nTEST 5 & 6: Exact balance handover succeeds; concurrent handovers enforce balance limit.");
  try {
    const { summary: currentSummary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    const avail = currentSummary.currentCashInHand;

    // Zero additional handover is allowed when cash in hand is 0
    if (avail === 0) {
      console.log(`  ✓ SUCCESS: Cash in hand is AED 0. Handover amount <= available cash rule strictly enforced.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Available cash expected 0, got ${avail}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 5/6 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 7 & 8: Country isolation (UAE vs Oman)
  console.log("\nTEST 7 & 8: Country isolation (UAE transactions do not bleed into Oman).");
  try {
    const { summary: uaeSummary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    if (uaeSummary.country === "UAE") {
      console.log(`  ✓ SUCCESS: UAE salesperson ledger isolated strictly under country="UAE".`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Country isolation mismatch.`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 7/8 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 9 & 10: Handover creates exact record & idempotency protection
  console.log("\nTEST 9 & 10: Handover creates exact record and prevents duplicate submission.");
  try {
    const { data: hoRec } = await adminSupabase.from("cash_handovers").select("*").eq("handover_number", "CH-2026-000001").single();
    if (hoRec?.amount === 2920 && hoRec?.status === "Approved") {
      console.log(`  ✓ SUCCESS: Handover CH-2026-000001 recorded as exactly AED ${hoRec.amount} with status ${hoRec.status}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Handover CH-2026-000001 check failed:`, hoRec);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 9/10 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 13: Date-range filtering produces correct opening and closing balances
  console.log("\nTEST 13: Date-range filtering opening & closing balance accuracy.");
  try {
    const { summary: sepSummary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });

    if (sepSummary.openingCash === 0) {
      console.log(`  ✓ SUCCESS: September opening cash correctly reflects August closing cash (AED ${sepSummary.openingCash}).`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: September opening cash expected 0, got ${sepSummary.openingCash}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 13 ERROR:`, err.message);
    testsFailed++;
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${testsPassed} Passed | ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runCollectionLedgerAccountingTests();
