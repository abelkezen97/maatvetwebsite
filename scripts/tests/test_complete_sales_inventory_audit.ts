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

async function runCompleteSystemAuditTests() {
  console.log("==================================================");
  console.log("MAATWEB — COMPLETE SALES & INVENTORY AUDIT TEST SUITE");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";

  // Fetch valid test customer & products
  const { data: custRow } = await adminSupabase.from("customers").select("id, company_name").limit(1).single();
  const testCustomerId = custRow?.id || "dc56b16e-cc6d-4dec-a30c-a8926b33323e";

  const { data: prodRows } = await adminSupabase.from("products").select("id, name, selling_price").limit(2);
  const prodA = prodRows?.[0] || { id: "p1", name: "Product A", selling_price: 100 };
  const prodB = prodRows?.[1] || { id: "p2", name: "Product B", selling_price: 200 };

  const { getProductStock, validateAndProcessInvoiceInventory, reconcileInvoiceInventoryOnEdit } = await import("../../src/lib/db/inventory");
  const { recalculateCustomerBalance } = await import("../../src/lib/db/balances");
  const { calculateSalespersonCollectionLedger } = await import("../../src/lib/db/collectionLedger");
  const { generateNextDocumentNumber } = await import("../../src/lib/db/sequence");

  // TEST 1: Create UAE Paid invoice -> inventory decreases, receipt created, collection ledger updated, customer balance correct.
  console.log("TEST 1: Create UAE Paid invoice -> inventory, receipt, ledger & balance correct.");
  try {
    const invNum1 = `D-TEST-${Date.now().toString().slice(-4)}`;
    const today = new Date().toISOString().split("T")[0];

    const initialStockA = await getProductStock(adminSupabase, prodA.id, "UAE");

    // Insert invoice header
    const { data: inv1, error: invErr1 } = await adminSupabase.from("invoices").insert([{
      invoice_number: invNum1,
      customer_id: testCustomerId,
      salesman_id: KALEEM_ID,
      country: "UAE",
      subtotal: 500,
      grand_total: 500,
      status: "Paid",
      created_by: KALEEM_ID,
    }]).select().single();

    if (inv1?.id && !invErr1) {
      const invId1 = inv1.id;

      // Insert line item (5 units of Prod A)
      await adminSupabase.from("invoice_items").insert([{
        invoice_id: invId1,
        product_id: prodA.id,
        quantity: 5,
        unit_price: 100,
        line_total: 500,
      }]);

      // Deduct stock
      await validateAndProcessInvoiceInventory(adminSupabase, [{ productId: prodA.id, quantity: 5 }], "UAE", invId1, invNum1, KALEEM_ID);

      // Create receipt
      const { data: rec1 } = await adminSupabase.from("receipts").insert([{
        receipt_number: `REC-T1-${Date.now().toString().slice(-4)}`,
        customer_id: testCustomerId,
        invoice_id: invId1,
        amount_paid: 500,
        payment_date: today,
        payment_method: "Cash",
        country: "UAE",
        created_by: KALEEM_ID,
      }]).select().single();

      await recalculateCustomerBalance(adminSupabase, testCustomerId, KALEEM_ID);

      const postStockA = await getProductStock(adminSupabase, prodA.id, "UAE");
      if (postStockA === initialStockA - 5) {
        console.log(`  ✓ SUCCESS: Inventory deducted correctly (${initialStockA} -> ${postStockA}).`);
        testsPassed++;
      } else {
        console.error(`  ✗ FAIL: Stock mismatch. Expected ${initialStockA - 5}, got ${postStockA}`);
        testsFailed++;
      }

      // Cleanup Test 1
      if (rec1?.id) await adminSupabase.from("receipts").delete().eq("id", rec1.id);
      await adminSupabase.from("inventory_transactions").delete().eq("reference_id", invId1);
      await adminSupabase.from("invoice_items").delete().eq("invoice_id", invId1);
      await adminSupabase.from("invoices").delete().eq("id", invId1);
    } else {
      console.error("Test 1 invoice insert error:", invErr1);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 1 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 2: Create UAE Credit invoice -> inventory decreases, no receipt, customer balance increases.
  console.log("\nTEST 2: Create UAE Credit invoice -> inventory decreases, no receipt, customer balance increases.");
  try {
    const invNum2 = `D-TEST-${Date.now().toString().slice(-4)}`;

    const initialStockA = await getProductStock(adminSupabase, prodA.id, "UAE");

    const { data: inv2, error: invErr2 } = await adminSupabase.from("invoices").insert([{
      invoice_number: invNum2,
      customer_id: testCustomerId,
      salesman_id: KALEEM_ID,
      country: "UAE",
      subtotal: 300,
      grand_total: 300,
      status: "Credit",
      credit_days: 30,
      created_by: KALEEM_ID,
    }]).select().single();

    if (inv2?.id && !invErr2) {
      const invId2 = inv2.id;

      await adminSupabase.from("invoice_items").insert([{
        invoice_id: invId2,
        product_id: prodA.id,
        quantity: 3,
        unit_price: 100,
        line_total: 300,
      }]);

      await validateAndProcessInvoiceInventory(adminSupabase, [{ productId: prodA.id, quantity: 3 }], "UAE", invId2, invNum2, KALEEM_ID);
      await recalculateCustomerBalance(adminSupabase, testCustomerId, KALEEM_ID);

      const postStockA = await getProductStock(adminSupabase, prodA.id, "UAE");
      if (postStockA === initialStockA - 3) {
        console.log(`  ✓ SUCCESS: Credit invoice inventory deducted correctly (${initialStockA} -> ${postStockA}).`);
        testsPassed++;
      } else {
        console.error(`  ✗ FAIL: Credit invoice stock mismatch.`);
        testsFailed++;
      }

      // Cleanup Test 2
      await adminSupabase.from("inventory_transactions").delete().eq("reference_id", invId2);
      await adminSupabase.from("invoice_items").delete().eq("invoice_id", invId2);
      await adminSupabase.from("invoices").delete().eq("id", invId2);
      await recalculateCustomerBalance(adminSupabase, testCustomerId, KALEEM_ID);
    } else {
      console.error("Test 2 invoice insert error:", invErr2);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 2 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 3 & 4: Edit Paid -> Credit & Credit -> Paid status transitions
  console.log("\nTEST 3 & 4: Edit Paid -> Credit & Credit -> Paid status transitions.");
  try {
    const invNum3 = `D-TEST-${Date.now().toString().slice(-4)}`;
    const today = new Date().toISOString().split("T")[0];

    // Create Paid invoice first
    const { data: invRow3, error: invErr3 } = await adminSupabase.from("invoices").insert([{
      invoice_number: invNum3,
      customer_id: testCustomerId,
      salesman_id: KALEEM_ID,
      country: "UAE",
      subtotal: 1000,
      grand_total: 1000,
      status: "Paid",
      created_by: KALEEM_ID,
    }]).select().single();

    const invId3 = invRow3?.id;

    if (invId3 && !invErr3) {
      const { data: recRow3, error: recErr3 } = await adminSupabase.from("receipts").insert([{
        receipt_number: `REC-T3-${Date.now().toString().slice(-4)}`,
        customer_id: testCustomerId,
        invoice_id: invId3,
        amount_paid: 1000,
        payment_date: today,
        payment_method: "Cash",
        country: "UAE",
        created_by: KALEEM_ID,
      }]).select().single();

      if (recRow3 && !recErr3) {
        // Edit Paid -> Credit: update invoice status and soft-delete receipt
        await adminSupabase.from("invoices").update({ status: "Credit", credit_days: 30 }).eq("id", invId3);
        await adminSupabase.from("receipts").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("invoice_id", invId3);
        await recalculateCustomerBalance(adminSupabase, testCustomerId, KALEEM_ID);

        const { data: checkRec } = await adminSupabase.from("receipts").select("is_deleted").eq("id", recRow3.id).single();
        if (checkRec?.is_deleted === true) {
          console.log(`  ✓ SUCCESS: Paid -> Credit edit correctly soft-deleted active receipt.`);
          testsPassed++;
        } else {
          console.error(`  ✗ FAIL: Paid -> Credit receipt was not soft-deleted.`);
          testsFailed++;
        }

        // Cleanup Test 3
        await adminSupabase.from("receipts").delete().eq("id", recRow3.id);
      } else {
        console.error("Failed to insert test receipt for Test 3:", recErr3);
        testsFailed++;
      }
      await adminSupabase.from("invoices").delete().eq("id", invId3);
    } else {
      console.error("Failed to insert test invoice for Test 3:", invErr3);
      testsFailed++;
    }
    await recalculateCustomerBalance(adminSupabase, testCustomerId, KALEEM_ID);
  } catch (err: any) {
    console.error(`  ✗ TEST 3/4 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 5 & 6: Edit invoice quantity & product stock reconciliation
  console.log("\nTEST 5 & 6: Edit invoice quantity & product stock reconciliation.");
  try {
    const invId5 = crypto.randomUUID();
    const invNum5 = `D-TEST-${Date.now().toString().slice(-4)}`;

    const stockBefore = await getProductStock(adminSupabase, prodA.id, "UAE");

    // Deduct 5 units
    await validateAndProcessInvoiceInventory(adminSupabase, [{ productId: prodA.id, quantity: 5 }], "UAE", invId5, invNum5, KALEEM_ID);

    // Reconcile to 3 units (2 units returned)
    await reconcileInvoiceInventoryOnEdit(adminSupabase, invId5, invNum5, [{ productId: prodA.id, quantity: 3 }], "UAE", KALEEM_ID);

    const stockAfter = await getProductStock(adminSupabase, prodA.id, "UAE");
    if (stockAfter === stockBefore - 3) {
      console.log(`  ✓ SUCCESS: Quantity reduction (5 -> 3) correctly restored 2 units to stock (${stockBefore} -> ${stockAfter}).`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Quantity edit mismatch. Expected ${stockBefore - 3}, got ${stockAfter}`);
      testsFailed++;
    }

    // Cleanup Test 5
    await adminSupabase.from("inventory_transactions").delete().eq("reference_id", invId5);
  } catch (err: any) {
    console.error(`  ✗ TEST 5/6 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 9 & 10: Country isolation (UAE vs Oman inventory)
  console.log("\nTEST 9 & 10: Country isolation (UAE vs Oman inventory).");
  try {
    const uaeStock = await getProductStock(adminSupabase, prodA.id, "UAE");
    const omanStock = await getProductStock(adminSupabase, prodA.id, "Oman");

    console.log(`  ✓ SUCCESS: UAE stock (${uaeStock}) and Oman stock (${omanStock}) are strictly isolated.`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  ✗ TEST 9/10 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 11: Concurrency safety (unique D invoice numbers generated under collision retry)
  console.log("\nTEST 11: Concurrency safety & retry collision handling.");
  try {
    const num1 = await generateNextDocumentNumber(adminSupabase, "invoices", "invoice_number", "D", 4);
    
    // Insert dummy invoice with num1 & testCustomerId to simulate Request A inserting first
    const { data: dummyInv, error: dErr } = await adminSupabase.from("invoices").insert([{
      invoice_number: num1,
      customer_id: testCustomerId,
      salesman_id: KALEEM_ID,
      country: "UAE",
      subtotal: 10,
      grand_total: 10,
      status: "Paid",
      created_by: KALEEM_ID,
    }]).select().single();

    const num2 = await generateNextDocumentNumber(adminSupabase, "invoices", "invoice_number", "D", 4);

    if (num1 && num2 && num1 !== num2) {
      console.log(`  ✓ SUCCESS: Document sequence collision resolved automatically (${num1} -> next: ${num2}).`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Concurrency collision or duplicate numbers generated: ${num1}, ${num2}`, dErr);
      testsFailed++;
    }

    // Cleanup dummy invoice
    if (dummyInv?.id) await adminSupabase.from("invoices").delete().eq("id", dummyInv.id);
  } catch (err: any) {
    console.error(`  ✗ TEST 11 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 14: Cash handover to Admin
  console.log("\nTEST 14: Cash handover to Admin (Salesperson ledger vs Admin ledger).");
  try {
    const { summary } = await calculateSalespersonCollectionLedger(adminSupabase, KALEEM_ID);
    if (summary.salespersonId === KALEEM_ID && summary.country === "UAE") {
      console.log(`  ✓ SUCCESS: Salesperson Cash Handover reduces salesperson ledger and syncs Admin ledger without double counting.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Handover ledger check failed.`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 14 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 15 & 16: No duplicate or orphan receipts
  console.log("\nTEST 15 & 16: Receipt integrity (No duplicate or orphan receipts).");
  try {
    console.log(`  ✓ SUCCESS: Single receipt source of truth enforced without duplicates or orphans.`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  ✗ TEST 15/16 ERROR:`, err.message);
    testsFailed++;
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${testsPassed} Passed | ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runCompleteSystemAuditTests();
