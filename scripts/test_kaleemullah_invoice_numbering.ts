import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { generateNextDocumentNumber } from "../lib/db/sequence";
import { getProductStock, validateAndProcessInvoiceInventory } from "../lib/db/inventory";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runKaleemullahNumberingSuite() {
  console.log("==================================================");
  console.log("DR. KALEEMULLAH INVOICE NUMBERING VERIFICATION SUITE");
  console.log("==================================================\n");

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      testPassed++;
    } else {
      console.error(`✗ [FAIL] ${testName} - ${detail || "Assertion failed"}`);
      testFailed++;
    }
  }

  const KALEEM_PROFILE_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";

  // 1. Setup Category & Test Product
  const { data: catRow } = await adminClient.from("product_categories").select("id").limit(1).single();
  const categoryId = catRow?.id;

  const prodName = `Kaleem Test Product ${Date.now()}`;
  const { data: product, error: prodErr } = await adminClient
    .from("products")
    .insert([{
      name: prodName,
      sku: `SKU-KAL-${Date.now()}`,
      category_id: categoryId,
      pack_size: "1",
      unit: "Item",
      selling_price: 200,
      is_active: true
    }])
    .select()
    .single();

  if (prodErr || !product) {
    console.error("Failed to create test product:", prodErr);
    process.exit(1);
  }

  const productId = product.id;
  console.log(`Created test product: ${prodName} (ID: ${productId})`);

  // Add initial UAE stock = 100
  await adminClient.from("inventory_transactions").insert([{
    product_id: productId,
    country: "UAE",
    transaction_type: "Opening Stock",
    quantity: 100,
    remarks: "Opening stock for Kaleem test"
  }]);

  // Fetch Customer ID
  let { data: customer } = await adminClient.from("customers").select("id").limit(1).single();
  const customerId = customer?.id;

  const createdInvoiceIds: string[] = [];

  try {
    // TEST 1: Check Next Candidate Sequence for Dr. Kaleemullah
    const nextKaleemCandidate = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "D", 4);
    assert(
      nextKaleemCandidate === "D0353",
      "TEST 1: Next reference candidate for Dr. Kaleemullah is D0353",
      `Got: ${nextKaleemCandidate}`
    );

    // TEST 2: Create First Invoice for Dr. Kaleemullah -> Must receive D0353
    const inv1Num = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "D", 4);
    const { data: inv1, error: inv1Err } = await adminClient
      .from("invoices")
      .insert([{
        invoice_number: inv1Num,
        customer_id: customerId,
        salesman_id: KALEEM_PROFILE_ID,
        country: "UAE",
        status: "Paid",
        subtotal: 1000,
        vat_total: 0,
        discount_total: 0,
        grand_total: 1000
      }])
      .select()
      .single();

    if (inv1Err || !inv1) {
      console.error("Failed to create inv1:", inv1Err);
      process.exit(1);
    }
    createdInvoiceIds.push(inv1.id);

    assert(
      inv1.invoice_number === "D0353",
      "TEST 2: Dr. Kaleemullah's first invoice successfully created as D0353",
      `Got invoice_number: ${inv1.invoice_number}`
    );

    // Process UAE inventory deduction (5 units)
    await validateAndProcessInvoiceInventory(
      adminClient,
      [{ productId, quantity: 5, productName: prodName }],
      "UAE",
      inv1.id,
      inv1.invoice_number,
      KALEEM_PROFILE_ID
    );

    const stockAfterInv1 = await getProductStock(adminClient, productId, "UAE");
    assert(
      stockAfterInv1 === 95,
      "TEST 2 (Inventory): UAE stock correctly deducted by 5 (100 -> 95)",
      `Got UAE stock: ${stockAfterInv1}`
    );

    // TEST 3: Create Second Invoice for Dr. Kaleemullah -> Must receive D0354
    const inv2Num = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "D", 4);
    const { data: inv2, error: inv2Err } = await adminClient
      .from("invoices")
      .insert([{
        invoice_number: inv2Num,
        customer_id: customerId,
        salesman_id: KALEEM_PROFILE_ID,
        country: "UAE",
        status: "Paid",
        subtotal: 1000,
        vat_total: 0,
        discount_total: 0,
        grand_total: 1000
      }])
      .select()
      .single();

    if (inv2Err || !inv2) {
      console.error("Failed to create inv2:", inv2Err);
      process.exit(1);
    }
    createdInvoiceIds.push(inv2.id);

    assert(
      inv2.invoice_number === "D0354",
      "TEST 3: Dr. Kaleemullah's second invoice successfully created as D0354",
      `Got invoice_number: ${inv2.invoice_number}`
    );

    // TEST 4: Verify Standard Salesperson Numbering is Completely Unaffected
    const otherSalespersonCandidate = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "INV", 6);
    assert(
      otherSalespersonCandidate.startsWith("INV-2026-"),
      "TEST 4: Standard salesperson numbering uses INV-2026-XXXXXX and is unaffected by D-series",
      `Got: ${otherSalespersonCandidate}`
    );

  } finally {
    // Cleanup Test Records
    if (createdInvoiceIds.length > 0) {
      await adminClient.from("inventory_transactions").delete().in("reference_id", createdInvoiceIds);
      await adminClient.from("invoices").delete().in("id", createdInvoiceIds);
    }
    await adminClient.from("inventory_transactions").delete().eq("product_id", productId);
    await adminClient.from("products").delete().eq("id", productId);
    console.log("\nCleaned up test data.");
  }

  console.log("\n==================================================");
  console.log(`SUITE SUMMARY: Passed = ${testPassed}, Failed = ${testFailed}`);
  console.log("==================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runKaleemullahNumberingSuite().catch(console.error);
