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

async function runReconciliationTests() {
  console.log("==================================================");
  console.log("MAATWEB — INVOICE EDIT & RECONCILIATION TEST SUITE");
  console.log("==================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  // Setup test profiles, products, customer using valid UUIDs
  const uaeCustId = crypto.randomUUID();
  const omanCustId = crypto.randomUUID();

  // Fetch product IDs for testing
  const { data: prods } = await adminSupabase.from("products").select("id, name").limit(2);
  const testProd1 = prods?.[0]?.id;
  const testProd2 = prods?.[1]?.id;
  const prod1Name = prods?.[0]?.name || "Test Prod 1";
  const prod2Name = prods?.[1]?.name || "Test Prod 2";

  if (!testProd1 || !testProd2) {
    console.error("Test products not found in DB!");
    process.exit(1);
  }

  const { data: superAdminProf } = await adminSupabase.from("profiles").select("id, role, country").eq("role", "super_admin").limit(1).single();
  const { data: salespersonProf } = await adminSupabase.from("profiles").select("id, role, country").eq("role", "salesperson").limit(1).maybeSingle();

  const adminUserId = superAdminProf?.id || "d01bd127-fd81-4bc9-abbf-ae8c89c65613";
  const salesmanUserId = salespersonProf?.id || "70102915-1294-4149-973e-033518c25f68";

  // Create test customers
  await adminSupabase.from("customers").insert([
    {
      id: uaeCustId,
      customer_code: "CUST-TEST-UAE",
      company_name: "Test UAE Clinic",
      doctor_name: "Dr. UAE Test",
      country: "UAE",
      opening_balance: 500,
      pending_balance: 500,
      created_by: adminUserId,
    },
    {
      id: omanCustId,
      customer_code: "CUST-TEST-OMAN",
      company_name: "Test Oman Farm",
      doctor_name: "Dr. Oman Test",
      country: "Oman",
      opening_balance: 1000,
      pending_balance: 1000,
      created_by: adminUserId,
    },
  ]);

  const { reconcileInvoiceInventoryOnEdit, getProductStock } = await import("../../src/lib/db/inventory");
  const { recalculateCustomerBalance } = await import("../../src/lib/db/balances");

  // TEST 1: Original sells 5. Edit to 4 -> final stock = stockAfterSale + 1.
  console.log("TEST 1: Original sells 5. Edit to 4 -> final stock = stockAfterSale + 1.");
  try {
    const inv1Id = crypto.randomUUID();
    const baselineStock1 = await getProductStock(adminSupabase, testProd1, "UAE");

    // Original sale: -5
    await adminSupabase.from("inventory_transactions").insert([{
      product_id: testProd1,
      country: "UAE",
      transaction_type: "Sale",
      quantity: -5,
      reference_type: "INVOICE",
      reference_id: inv1Id,
      remarks: "Original sale 5",
      created_by: adminUserId,
    }]);

    let stockAfterSale1 = await getProductStock(adminSupabase, testProd1, "UAE");
    console.log(`  Baseline stock: ${baselineStock1} | Stock after sale of 5: ${stockAfterSale1}`);

    // Edit invoice to quantity 4
    await reconcileInvoiceInventoryOnEdit(
      adminSupabase,
      inv1Id,
      "INV-TEST-001",
      [{ productId: testProd1, quantity: 4, productName: prod1Name }],
      "UAE",
      adminUserId
    );

    let finalStock1 = await getProductStock(adminSupabase, testProd1, "UAE");
    const expectedFinal1 = baselineStock1 - 4; // Restored (baselineStock1) - new (4)

    if (finalStock1 === expectedFinal1) {
      console.log(`  ✓ SUCCESS: Final stock after edit to 4 is ${finalStock1} (restored ${baselineStock1} - new 4 = ${expectedFinal1}).`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Expected final stock ${expectedFinal1}, got ${finalStock1}`);
      testsFailed++;
    }

    // Cleanup inv1 transactions
    await adminSupabase.from("inventory_transactions").delete().eq("reference_id", inv1Id);
  } catch (err: any) {
    console.error(`  ✗ TEST 1 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 2: Original sells 5. Edit to 4 MUST SUCCEED.
  console.log("\nTEST 2: Original sells 5. Edit to 4 MUST SUCCEED.");
  try {
    const inv2Id = crypto.randomUUID();
    const baselineStock2 = await getProductStock(adminSupabase, testProd1, "UAE");

    await adminSupabase.from("inventory_transactions").insert([{
      product_id: testProd1,
      country: "UAE",
      transaction_type: "Sale",
      quantity: -5,
      reference_type: "INVOICE",
      reference_id: inv2Id,
      remarks: "Original sale 5",
      created_by: adminUserId,
    }]);

    await reconcileInvoiceInventoryOnEdit(
      adminSupabase,
      inv2Id,
      "INV-TEST-002",
      [{ productId: testProd1, quantity: 4, productName: prod1Name }],
      "UAE",
      adminUserId
    );

    let finalStock2 = await getProductStock(adminSupabase, testProd1, "UAE");
    const expectedFinal2 = baselineStock2 - 4;

    if (finalStock2 === expectedFinal2) {
      console.log(`  ✓ SUCCESS: Edit to 4 succeeded with final stock ${finalStock2}.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Expected final stock ${expectedFinal2}, got ${finalStock2}`);
      testsFailed++;
    }

    await adminSupabase.from("inventory_transactions").delete().eq("reference_id", inv2Id);
  } catch (err: any) {
    console.error(`  ✗ TEST 2 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 3: Original sells 5. Edit to (baselineStock + 10) -> Fails with restored available stock = baselineStock.
  console.log("\nTEST 3: Edit exceeding restored stock -> Fails with restored available stock.");
  try {
    const inv3Id = crypto.randomUUID();
    const baselineStock3 = await getProductStock(adminSupabase, testProd1, "UAE");

    await adminSupabase.from("inventory_transactions").insert([{
      product_id: testProd1,
      country: "UAE",
      transaction_type: "Sale",
      quantity: -5,
      reference_type: "INVOICE",
      reference_id: inv3Id,
      remarks: "Original sale 5",
      created_by: adminUserId,
    }]);

    const excessiveQty = baselineStock3 + 10;
    let threwExpectedError = false;
    try {
      await reconcileInvoiceInventoryOnEdit(
        adminSupabase,
        inv3Id,
        "INV-TEST-003",
        [{ productId: testProd1, quantity: excessiveQty, productName: prod1Name }],
        "UAE",
        adminUserId
      );
    } catch (err: any) {
      if (err.message.includes("Insufficient stock") && err.message.includes(`Available quantity: ${baselineStock3}`)) {
        threwExpectedError = true;
        console.log(`  ✓ SUCCESS: Caught expected error: "${err.message}"`);
      } else {
        console.error(`  ✗ Unexpected error message: "${err.message}"`);
      }
    }

    if (threwExpectedError) {
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Did not throw expected insufficient stock error.`);
      testsFailed++;
    }

    await adminSupabase.from("inventory_transactions").delete().eq("reference_id", inv3Id);
  } catch (err: any) {
    console.error(`  ✗ TEST 3 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 4: Original Paid -> Edit keeping Paid -> Receipt updated cleanly, no duplicates
  console.log("\nTEST 4: Original Paid -> Edit keeping Paid -> Receipt updated, no duplicates.");
  try {
    const inv4Id = crypto.randomUUID();
    const rec4Id = crypto.randomUUID();

    await adminSupabase.from("invoices").insert([{
      id: inv4Id,
      invoice_number: "INV-TEST-004",
      customer_id: uaeCustId,
      salesman_id: salesmanUserId,
      status: "Paid",
      payment_status: "Paid",
      grand_total: 1000,
      country: "UAE",
      created_by: adminUserId,
    }]);

    await adminSupabase.from("receipts").insert([{
      id: rec4Id,
      receipt_number: "REC-TEST-004",
      customer_id: uaeCustId,
      invoice_id: inv4Id,
      amount_paid: 1000,
      payment_method: "Cash",
      payment_date: new Date().toISOString().split("T")[0],
      country: "UAE",
      is_deleted: false,
      created_by: adminUserId,
    }]);

    // Edit price to 1200 keeping status Paid
    await adminSupabase.from("invoices").update({ grand_total: 1200 }).eq("id", inv4Id);
    await adminSupabase.from("receipts").update({ amount_paid: 1200 }).eq("id", rec4Id);

    const { data: activeRecs4 } = await adminSupabase.from("receipts").select("id, amount_paid").eq("invoice_id", inv4Id).eq("is_deleted", false);

    if (activeRecs4?.length === 1 && activeRecs4[0].amount_paid === 1200) {
      console.log(`  ✓ SUCCESS: Receipt updated to AED 1200, exactly 1 active receipt exists.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Receipt count=${activeRecs4?.length}, amount=${activeRecs4?.[0]?.amount_paid}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 4 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 5: Original Paid -> Edit Paid -> Credit -> Receipt soft-deleted, customer balance updated
  console.log("\nTEST 5: Original Paid -> Edit Paid -> Credit -> Receipt reversed, customer balance updated.");
  try {
    const inv5Id = crypto.randomUUID();
    const rec5Id = crypto.randomUUID();

    await adminSupabase.from("invoices").insert([{
      id: inv5Id,
      invoice_number: "INV-TEST-005",
      customer_id: uaeCustId,
      salesman_id: salesmanUserId,
      status: "Paid",
      payment_status: "Paid",
      grand_total: 1000,
      country: "UAE",
      created_by: adminUserId,
    }]);

    await adminSupabase.from("receipts").insert([{
      id: rec5Id,
      receipt_number: "REC-TEST-005",
      customer_id: uaeCustId,
      invoice_id: inv5Id,
      amount_paid: 1000,
      payment_method: "Cash",
      payment_date: new Date().toISOString().split("T")[0],
      country: "UAE",
      is_deleted: false,
      created_by: adminUserId,
    }]);

    await recalculateCustomerBalance(adminSupabase, uaeCustId, adminUserId);

    // Edit to Credit
    await adminSupabase.from("receipts").update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: adminUserId }).eq("id", rec5Id);
    await adminSupabase.from("invoices").update({ status: "Credit", payment_status: "Credit", credit_days: 30 }).eq("id", inv5Id);

    await recalculateCustomerBalance(adminSupabase, uaeCustId, adminUserId);

    const { data: rec5After } = await adminSupabase.from("receipts").select("is_deleted").eq("id", rec5Id).single();
    const { data: cust5After } = await adminSupabase.from("customers").select("pending_balance").eq("id", uaeCustId).single();

    if (rec5After?.is_deleted === true && cust5After?.pending_balance === 1500) {
      console.log(`  ✓ SUCCESS: Receipt is_deleted=true, Customer Outstanding updated to AED ${cust5After?.pending_balance}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Receipt is_deleted=${rec5After?.is_deleted}, Customer Outstanding=${cust5After?.pending_balance}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 5 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 6: Original Credit -> Edit Credit -> Paid -> New receipt generated, customer balance updated
  console.log("\nTEST 6: Original Credit -> Edit Credit -> Paid -> New receipt generated, customer balance updated.");
  try {
    const inv6Id = crypto.randomUUID();
    await adminSupabase.from("invoices").insert([{
      id: inv6Id,
      invoice_number: "INV-TEST-006",
      customer_id: uaeCustId,
      salesman_id: salesmanUserId,
      status: "Credit",
      payment_status: "Credit",
      grand_total: 600,
      country: "UAE",
      created_by: adminUserId,
    }]);

    await recalculateCustomerBalance(adminSupabase, uaeCustId, adminUserId);

    // Edit to Paid
    await adminSupabase.from("invoices").update({ status: "Paid", payment_status: "Paid" }).eq("id", inv6Id);
    const rec6Id = crypto.randomUUID();
    await adminSupabase.from("receipts").insert([{
      id: rec6Id,
      receipt_number: "REC-TEST-006",
      customer_id: uaeCustId,
      invoice_id: inv6Id,
      amount_paid: 600,
      payment_method: "Cash",
      payment_date: new Date().toISOString().split("T")[0],
      country: "UAE",
      is_deleted: false,
      created_by: adminUserId,
    }]);

    await recalculateCustomerBalance(adminSupabase, uaeCustId, adminUserId);

    const { data: rec6After } = await adminSupabase.from("receipts").select("id").eq("invoice_id", inv6Id).eq("is_deleted", false);
    const { data: cust6After } = await adminSupabase.from("customers").select("pending_balance").eq("id", uaeCustId).single();

    if (rec6After?.length === 1 && cust6After?.pending_balance === 1500) {
      console.log(`  ✓ SUCCESS: New receipt created, Customer Outstanding reduced back to AED ${cust6After?.pending_balance}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Receipt count=${rec6After?.length}, Customer Outstanding=${cust6After?.pending_balance}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 6 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 7: UAE invoice edit affects only UAE inventory
  console.log("\nTEST 7: UAE invoice edit affects only UAE inventory.");
  try {
    const inv7Id = crypto.randomUUID();
    await reconcileInvoiceInventoryOnEdit(
      adminSupabase,
      inv7Id,
      "INV-TEST-007",
      [{ productId: testProd1, quantity: 3, productName: prod1Name }],
      "UAE",
      adminUserId
    );

    const { data: uaeTx } = await adminSupabase.from("inventory_transactions").select("country").eq("reference_id", inv7Id);
    const allUAE = uaeTx?.every((t) => t.country === "UAE");

    if (allUAE && uaeTx?.length === 1) {
      console.log(`  ✓ SUCCESS: All inventory transactions isolated to UAE.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Non-UAE inventory transactions found:`, uaeTx);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 7 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 8: Oman invoice edit affects only Oman inventory
  console.log("\nTEST 8: Oman invoice edit affects only Oman inventory.");
  try {
    const inv8Id = crypto.randomUUID();
    const obOmanId = crypto.randomUUID();
    await adminSupabase.from("inventory_transactions").insert([{
      id: obOmanId,
      product_id: testProd1,
      country: "Oman",
      transaction_type: "Opening Stock",
      quantity: 10,
      reference_type: "TEST",
      reference_id: crypto.randomUUID(),
      remarks: "Test 8 Oman OB",
      created_by: adminUserId,
    }]);

    await reconcileInvoiceInventoryOnEdit(
      adminSupabase,
      inv8Id,
      "INV-TEST-008",
      [{ productId: testProd1, quantity: 3, productName: prod1Name }],
      "Oman",
      adminUserId
    );

    const { data: omanTx } = await adminSupabase.from("inventory_transactions").select("country").eq("reference_id", inv8Id).eq("transaction_type", "Sale");
    const allOman = omanTx?.every((t) => t.country === "Oman");

    if (allOman && omanTx?.length === 1) {
      console.log(`  ✓ SUCCESS: All inventory transactions isolated to Oman.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Non-Oman inventory transactions found:`, omanTx);
      testsFailed++;
    }

    await adminSupabase.from("inventory_transactions").delete().eq("id", obOmanId);
  } catch (err: any) {
    console.error(`  ✗ TEST 8 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 9: Multiple products on one invoice are all restored and rededucted correctly
  console.log("\nTEST 9: Multiple products on one invoice are all restored and rededucted correctly.");
  try {
    const inv9Id = crypto.randomUUID();
    await reconcileInvoiceInventoryOnEdit(
      adminSupabase,
      inv9Id,
      "INV-TEST-009",
      [
        { productId: testProd1, quantity: 2, productName: prod1Name },
        { productId: testProd2, quantity: 4, productName: prod2Name },
      ],
      "UAE",
      adminUserId
    );

    const { data: multiTx } = await adminSupabase.from("inventory_transactions").select("product_id, quantity").eq("reference_id", inv9Id);

    if (multiTx?.length === 2) {
      console.log(`  ✓ SUCCESS: Both products correctly reconciled on multi-item invoice.`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Expected 2 transactions, got ${multiTx?.length}`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 9 ERROR:`, err.message);
    testsFailed++;
  }

  // TEST 10: Force error during replacement operation -> operation rolls back, original state unchanged
  console.log("\nTEST 10: Force error during edit operation -> rolls back cleanly.");
  try {
    const inv10Id = crypto.randomUUID();
    // Simulate original sale of 2 units
    await adminSupabase.from("inventory_transactions").insert([{
      product_id: testProd1,
      country: "UAE",
      transaction_type: "Sale",
      quantity: -2,
      reference_type: "INVOICE",
      reference_id: inv10Id,
      remarks: "Original sale",
      created_by: adminUserId,
    }]);

    let rollbackSuccessful = false;
    try {
      // Pass an enormous quantity (1,000,000) to force stock error
      await reconcileInvoiceInventoryOnEdit(
        adminSupabase,
        inv10Id,
        "INV-TEST-010",
        [{ productId: testProd1, quantity: 1000000, productName: prod1Name }],
        "UAE",
        adminUserId
      );
    } catch (err: any) {
      // Verify original transaction remains intact
      const { data: originalTx } = await adminSupabase.from("inventory_transactions").select("quantity").eq("reference_id", inv10Id);
      if (originalTx?.length === 1 && originalTx[0].quantity === -2) {
        rollbackSuccessful = true;
        console.log(`  ✓ SUCCESS: Error caught, original inventory state untouched (-2 units).`);
      }
    }

    if (rollbackSuccessful) {
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: Rollback check failed!`);
      testsFailed++;
    }
  } catch (err: any) {
    console.error(`  ✗ TEST 10 ERROR:`, err.message);
    testsFailed++;
  }

  // Cleanup test records
  console.log("\nCleaning up test artifacts...");
  await adminSupabase.from("receipts").delete().or(`customer_id.eq.${uaeCustId},customer_id.eq.${omanCustId}`);
  await adminSupabase.from("inventory_transactions").delete().or(`reference_id.like.INV-TEST-%`);
  await adminSupabase.from("invoices").delete().or(`customer_id.eq.${uaeCustId},customer_id.eq.${omanCustId}`);
  await adminSupabase.from("customers").delete().in("id", [uaeCustId, omanCustId]);

  console.log("\n==================================================");
  console.log(`SUMMARY: ${testsPassed} Passed | ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runReconciliationTests();
