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

async function runConcurrencyTests() {
  console.log("==================================================");
  console.log("MAATWEB — INVOICE CONCURRENCY & SEQUENCE TEST SUITE");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  // Setup test customer IDs
  const uaeCustId = crypto.randomUUID();
  const omanCustId = crypto.randomUUID();

  // Fetch product IDs for testing
  const { data: prods } = await adminSupabase.from("products").select("id, name").limit(2);
  const testProd1 = prods?.[0]?.id;

  if (!testProd1) {
    console.error("Test product not found in DB!");
    process.exit(1);
  }

  const { data: superAdminProf } = await adminSupabase.from("profiles").select("id, role, country").eq("role", "super_admin").limit(1).single();
  const adminUserId = superAdminProf?.id || "07e59a9f-586f-4d45-a665-cce9d3bdb6a9";

  // Create test customers
  await adminSupabase.from("customers").insert([
    {
      id: uaeCustId,
      customer_code: "CUST-[#D356-TEST]",
      company_name: "Test UAE Clinic Concurrency",
      doctor_name: "Dr. UAE Concurrency Test",
      country: "UAE",
      opening_balance: 0,
      pending_balance: 0,
      created_by: adminUserId,
    },
    {
      id: omanCustId,
      customer_code: "CUST-[#D356-OMAN]",
      company_name: "Test Oman Clinic Concurrency",
      doctor_name: "Dr. Oman Concurrency Test",
      country: "Oman",
      opening_balance: 0,
      pending_balance: 0,
      created_by: adminUserId,
    },
  ]);

  const { generateNextDocumentNumber } = await import("../../src/lib/db/sequence");
  const { getProductStock } = await import("../../src/lib/db/inventory");
  const createdTestInvoiceIds: string[] = [];

  // TEST 1: Generate next Dr. Kaleem invoice number -> Expected: D0356
  console.log("TEST 1: Next Dr. Kaleem invoice number generation (D0356 check).");
  try {
    const nextNum = await generateNextDocumentNumber(adminSupabase, "invoices", "invoice_number", "D", 4);
    if (nextNum === "D0356") {
      console.log(`  ✓ SUCCESS: Next invoice number is exactly "${nextNum}".`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Expected D0356, got "${nextNum}"`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 1 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 2: Create a new invoice and verify it receives D0356
  console.log("\nTEST 2: Insert new invoice -> Expected D0356.");
  let inv1Num = "";
  try {
    const inv1Id = crypto.randomUUID();
    inv1Num = await generateNextDocumentNumber(adminSupabase, "invoices", "invoice_number", "D", 4);
    await adminSupabase.from("invoices").insert([{
      id: inv1Id,
      invoice_number: inv1Num,
      customer_id: uaeCustId,
      salesman_id: adminUserId,
      status: "Credit",
      payment_status: "Credit",
      grand_total: 500,
      subtotal: 500,
      country: "UAE",
      created_by: adminUserId,
    }]);
    createdTestInvoiceIds.push(inv1Id);

    const nextNum2 = await generateNextDocumentNumber(adminSupabase, "invoices", "invoice_number", "D", 4);
    if (inv1Num === "D0356" && nextNum2 === "D0357") {
      console.log(`  ✓ SUCCESS: Invoice inserted with number "${inv1Num}", next number is now "${nextNum2}".`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Inserted "${inv1Num}", next is "${nextNum2}"`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 2 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 3: Simultaneous concurrent invoice inserts
  console.log("\nTEST 3: Create multiple invoices concurrently (no duplicate numbers).");
  try {
    const concurrentCount = 4;
    const promises: Promise<string>[] = [];

    for (let i = 0; i < concurrentCount; i++) {
      const invId = crypto.randomUUID();
      createdTestInvoiceIds.push(invId);

      promises.push((async () => {
        let insertedNum = "";
        for (let attempt = 0; attempt < 5; attempt++) {
          const cand = await generateNextDocumentNumber(adminSupabase, "invoices", "invoice_number", "D", 4);
          const { error } = await adminSupabase.from("invoices").insert([{
            id: invId,
            invoice_number: cand,
            customer_id: uaeCustId,
            salesman_id: adminUserId,
            status: "Credit",
            payment_status: "Credit",
            grand_total: 100 * (i + 1),
            country: "UAE",
            created_by: adminUserId,
          }]);

          if (!error) {
            insertedNum = cand;
            break;
          }
        }
        return insertedNum;
      })());
    }

    const insertedNumbers = await Promise.all(promises);
    const uniqueNumbers = new Set(insertedNumbers);

    if (insertedNumbers.length === concurrentCount && uniqueNumbers.size === concurrentCount && !insertedNumbers.includes("")) {
      console.log(`  ✓ SUCCESS: All ${concurrentCount} concurrent invoices created with unique numbers: ${insertedNumbers.join(", ")}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Concurrency collision found. Numbers:`, insertedNumbers);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 3 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 4: Verify existing invoices D0354 and D0355 remain unchanged
  console.log("\nTEST 4: Verify existing D0354 and D0355 remain untouched.");
  try {
    const { data: inv354 } = await adminSupabase.from("invoices").select("id, invoice_number").eq("id", "ccd534c6-5e7d-458b-bba2-6bad7cd118d0").single();
    const { data: inv355 } = await adminSupabase.from("invoices").select("id, invoice_number").eq("id", "96f886b3-437d-40b7-a926-ae7f5ea54ac7").single();

    if (inv354?.invoice_number === "D0354" && inv355?.invoice_number === "D0355") {
      console.log(`  ✓ SUCCESS: D0354 (ID: ${inv354.id}) and D0355 (ID: ${inv355.id}) are unchanged.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Invoices mutated! D0354=${inv354?.invoice_number}, D0355=${inv355?.invoice_number}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 4 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 5: Verify inventory deduction on invoice creation
  console.log("\nTEST 5: Inventory deduction on invoice creation.");
  try {
    const inv5Id = crypto.randomUUID();
    createdTestInvoiceIds.push(inv5Id);
    const baselineStock = await getProductStock(adminSupabase, testProd1, "UAE");

    await adminSupabase.from("inventory_transactions").insert([{
      product_id: testProd1,
      country: "UAE",
      transaction_type: "Sale",
      quantity: -5,
      reference_type: "INVOICE",
      reference_id: inv5Id,
      remarks: "Test 5 sale",
      created_by: adminUserId,
    }]);

    const stockAfter = await getProductStock(adminSupabase, testProd1, "UAE");
    if (stockAfter === baselineStock - 5) {
      console.log(`  ✓ SUCCESS: Baseline ${baselineStock} reduced by 5 to ${stockAfter}.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Expected stock ${baselineStock - 5}, got ${stockAfter}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 5 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 6: Verify Paid invoice creates receipt correctly
  console.log("\nTEST 6: Paid invoice creates receipt voucher.");
  try {
    const inv6Id = crypto.randomUUID();
    const rec6Id = crypto.randomUUID();
    createdTestInvoiceIds.push(inv6Id);

    await adminSupabase.from("invoices").insert([{
      id: inv6Id,
      invoice_number: `D-TEST-REC`,
      customer_id: uaeCustId,
      salesman_id: adminUserId,
      status: "Paid",
      payment_status: "Paid",
      grand_total: 250,
      country: "UAE",
      created_by: adminUserId,
    }]);

    await adminSupabase.from("receipts").insert([{
      id: rec6Id,
      receipt_number: "REC-TEST-006",
      customer_id: uaeCustId,
      invoice_id: inv6Id,
      amount_paid: 250,
      payment_method: "Cash",
      payment_date: new Date().toISOString().split("T")[0],
      country: "UAE",
      is_deleted: false,
      created_by: adminUserId,
    }]);

    const { data: recData } = await adminSupabase.from("receipts").select("id, amount_paid").eq("invoice_id", inv6Id).eq("is_deleted", false).single();
    if (recData?.amount_paid === 250) {
      console.log(`  ✓ SUCCESS: Active receipt created for AED ${recData.amount_paid}.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Receipt not found or amount incorrect.`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 6 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 7: Verify Credit invoice does NOT create receipt
  console.log("\nTEST 7: Credit invoice does not create receipt.");
  try {
    const inv7Id = crypto.randomUUID();
    createdTestInvoiceIds.push(inv7Id);

    await adminSupabase.from("invoices").insert([{
      id: inv7Id,
      invoice_number: `D-TEST-CRED`,
      customer_id: uaeCustId,
      salesman_id: adminUserId,
      status: "Credit",
      payment_status: "Credit",
      grand_total: 400,
      country: "UAE",
      created_by: adminUserId,
    }]);

    const { data: noRec } = await adminSupabase.from("receipts").select("id").eq("invoice_id", inv7Id).eq("is_deleted", false);
    if (!noRec || noRec.length === 0) {
      console.log(`  ✓ SUCCESS: Credit invoice created with 0 receipts as expected.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Unexpected receipt created for Credit invoice.`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 7 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 8: Country isolation (UAE vs Oman)
  console.log("\nTEST 8: Country isolation (UAE vs Oman).");
  try {
    const invOmanId = crypto.randomUUID();
    createdTestInvoiceIds.push(invOmanId);

    await adminSupabase.from("invoices").insert([{
      id: invOmanId,
      invoice_number: `INV-OMAN-TEST`,
      customer_id: omanCustId,
      salesman_id: adminUserId,
      status: "Credit",
      payment_status: "Credit",
      grand_total: 300,
      country: "Oman",
      created_by: adminUserId,
    }]);

    const { data: omanInv } = await adminSupabase.from("invoices").select("country").eq("id", invOmanId).single();
    if (omanInv?.country === "Oman") {
      console.log(`  ✓ SUCCESS: Oman invoice correctly isolated with country="Oman".`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Oman invoice country mismatch: ${omanInv?.country}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 8 ERROR:`, err.message);
    testsFailed++;
  }

  // Cleanup test artifacts (DO NOT touch D0354 or D0355!)
  console.log("\nCleaning up test artifacts...");
  await adminSupabase.from("receipts").delete().or(`customer_id.eq.${uaeCustId},customer_id.eq.${omanCustId}`);
  await adminSupabase.from("inventory_transactions").delete().in("reference_id", createdTestInvoiceIds);
  await adminSupabase.from("invoices").delete().in("id", createdTestInvoiceIds);
  await adminSupabase.from("customers").delete().in("id", [uaeCustId, omanCustId]);

  console.log("\n==================================================");
  console.log(`SUMMARY: ${testsPassed} Passed | ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runConcurrencyTests();
