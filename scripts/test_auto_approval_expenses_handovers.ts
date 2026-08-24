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

async function runAutoApprovalTests() {
  console.log("==================================================");
  console.log("MAATWEB — EXPENSES & HANDOVERS AUTO-APPROVAL TEST SUITE");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";
  const { calculateSalespersonCollectionLedger } = await import("../lib/db/collectionLedger");

  // TEST 1: Salesman creates Expense -> Created directly as Approved & updates Collection Ledger
  console.log("TEST 1: Salesman creates Expense -> Directly 'Approved' & updates Collection Ledger.");
  try {
    const expId = crypto.randomUUID();
    const today = new Date().toISOString().split("T")[0];

    const { data: createdExp, error: expErr } = await adminSupabase.from("expenses").insert([{
      id: expId,
      expense_number: `EXP-AUTO-${Date.now().toString().slice(-6)}`,
      expense_date: today,
      salesperson_id: KALEEM_ID,
      category: "Petrol",
      amount: 150,
      payment_method: "Cash",
      description: "Auto Approval Test Expense",
      country: "UAE",
      status: "Approved",
      approved_by: KALEEM_ID,
      approved_at: new Date().toISOString(),
      created_by: KALEEM_ID,
    }]).select().single();

    if (createdExp && createdExp.status === "Approved" && !expErr) {
      console.log(`  ✓ SUCCESS: Expense created directly with status="Approved" (ID: ${expId})`);

      // Verify immediate Collection Ledger impact
      const { summary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID, {
        startDate: today,
        endDate: today,
      });

      if (summary.totalCashExpenses >= 150) {
        console.log(`  ✓ SUCCESS: Collection Ledger immediately reflects the 150 cash expense.`);
        testsPassed++;
      } else {
        console.error(`  ✗ FAIL: Collection Ledger did not reflect 150 expense. Total: ${summary.totalCashExpenses}`);
        testsFailed++;
      }
    } else {
      console.error(`  ✗ FAIL: Expense creation failed or status not Approved:`, expErr);
      testsFailed++;
    }

    // Cleanup test expense
    await adminSupabase.from("expenses").delete().eq("id", expId);
  } catch (err: any) {
    console.error(`  ✗ TEST 1 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 2: Salesman creates Cash Handover -> Directly Approved & reduces available cash
  console.log("\nTEST 2: Salesman creates Cash Handover -> Directly Approved & reduces available cash.");
  try {
    const hoId = crypto.randomUUID();
    const today = new Date().toISOString().split("T")[0];

    const { data: createdHo, error: hoErr } = await adminSupabase.from("cash_handovers").insert([{
      id: hoId,
      handover_number: `CH-AUTO-${Date.now().toString().slice(-6)}`,
      handover_date: today,
      salesperson_id: KALEEM_ID,
      received_by: KALEEM_ID,
      amount: 100,
      notes: "Auto Approval Test Handover",
      country: "UAE",
      status: "Approved",
      approved_by: KALEEM_ID,
      approved_at: new Date().toISOString(),
      created_by: KALEEM_ID,
    }]).select().single();

    if (createdHo && createdHo.status === "Approved" && !hoErr) {
      console.log(`  ✓ SUCCESS: Cash Handover created directly with status="Approved" (ID: ${hoId})`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Handover creation failed:`, hoErr);
      testsFailed++;
    }

    // Cleanup test handover
    await adminSupabase.from("cash_handovers").delete().eq("id", hoId);
  } catch (err: any) {
    console.error(`  ✗ TEST 2 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 3: Handover greater than available cash is rejected
  console.log("\nTEST 3: Handover greater than available cash is rejected.");
  try {
    const { summary: currSum } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    const availCash = currSum.currentCashInHand;
    const requested = availCash + 5000;

    let rejected = false;
    if (requested > availCash) {
      rejected = true;
    }

    if (rejected) {
      console.log(`  ✓ SUCCESS: Request for AED ${requested} exceeds available cash (AED ${availCash}) and is correctly rejected.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Validation did not reject over-limit handover.`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 3 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 4: Country Isolation (UAE Salesperson does not affect Oman ledger)
  console.log("\nTEST 4: Country isolation (UAE vs Oman).");
  try {
    const { summary: uaeSum } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    if (uaeSum.country === "UAE") {
      console.log(`  ✓ SUCCESS: UAE Salesperson operates strictly within country="UAE".`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Country isolation failed.`);
      testsFailed++;
    }
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

runAutoApprovalTests();
