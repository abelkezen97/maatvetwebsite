import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { mapProductFromDb, mapProductToDb } from "../lib/db/mappers";
import { Permissions } from "../lib/auth/permissions";

// Parse .env.local
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
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function runProductCreationTests() {
  console.log("==================================================");
  console.log("TESTING PRODUCT CREATION & OPTIONAL BARCODE/SKU FLOW");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName} ${detail ? `-> ${detail}` : ""}`);
      failed++;
    }
  }

  const createdProductIds: string[] = [];

  try {
    // Fetch valid category
    const { data: catData } = await adminClient.from("product_categories").select("id").limit(1).single();
    const categoryId = catData?.id;

    // 1. Super Admin creates product without barcode (barcode = null)
    const payload1 = mapProductToDb({
      name: `Test Prod No Barcode 1 ${Date.now()}`,
      sellingPrice: 150.0,
      unit: "Bottle",
      categoryId: categoryId,
    });

    const { data: p1, error: e1 } = await adminClient.from("products").insert([payload1]).select().single();
    assert(!e1 && Boolean(p1), "TEST 1: Super Admin creates product without barcode", e1?.message);
    assert(p1?.barcode === null, "TEST 1: Database barcode is NULL (not empty string)", `Got: ${JSON.stringify(p1?.barcode)}`);
    if (p1) createdProductIds.push(p1.id);

    // 2. Super Admin creates product without SKU (sku = null)
    const payload2 = mapProductToDb({
      name: `Test Prod No SKU 2 ${Date.now()}`,
      sellingPrice: 200.0,
      unit: "Box",
      categoryId: categoryId,
    });

    const { data: p2, error: e2 } = await adminClient.from("products").insert([payload2]).select().single();
    assert(!e2 && Boolean(p2), "TEST 2: Super Admin creates product without SKU", e2?.message);
    assert(p2?.sku === null, "TEST 2: Database SKU is NULL (not fake string)", `Got: ${JSON.stringify(p2?.sku)}`);
    if (p2) createdProductIds.push(p2.id);

    // 3 & 4 & 7: Multiple products without barcode and without SKU (No unique constraint violation)
    const payload3 = mapProductToDb({
      name: `Test Prod No Barcode/SKU 3 ${Date.now()}`,
      sellingPrice: 250.0,
      unit: "Vial",
      categoryId: categoryId,
    });
    const { data: p3, error: e3 } = await adminClient.from("products").insert([payload3]).select().single();
    assert(!e3 && Boolean(p3), "TEST 3, 4, 7: Second product without barcode/SKU created without products_barcode_key violation", e3?.message);
    if (p3) createdProductIds.push(p3.id);

    const payload4 = mapProductToDb({
      name: `Test Prod No Barcode/SKU 4 ${Date.now()}`,
      sellingPrice: 300.0,
      unit: "Pack",
      categoryId: categoryId,
    });
    const { data: p4, error: e4 } = await adminClient.from("products").insert([payload4]).select().single();
    assert(!e4 && Boolean(p4), "TEST 3, 4, 7: Third product without barcode/SKU created successfully", e4?.message);
    if (p4) createdProductIds.push(p4.id);

    // 5 & 6: Existing products with barcode / SKU preserve existing values on update
    const customBarcode = `BARCODE-${Date.now()}`;
    const customSku = `SKU-EXISTING-${Date.now()}`;

    const payloadWithCode = mapProductToDb({
      name: `Test Prod With Barcode/SKU ${Date.now()}`,
      barcode: customBarcode,
      sku: customSku,
      sellingPrice: 500.0,
      unit: "Item",
      categoryId: categoryId,
    });
    const { data: pExisting } = await adminClient.from("products").insert([payloadWithCode]).select().single();
    if (pExisting) createdProductIds.push(pExisting.id);

    assert(pExisting?.barcode === customBarcode, "TEST 5: Custom barcode inserted correctly", `Got ${pExisting?.barcode}`);
    assert(pExisting?.sku === customSku, "TEST 6: Custom SKU inserted correctly", `Got ${pExisting?.sku}`);

    // Update existing product without changing barcode/SKU
    const updatePayload = mapProductToDb({
      name: `Test Prod With Barcode/SKU Updated ${Date.now()}`,
      sellingPrice: 550.0,
    });
    const { data: pUpdated } = await adminClient
      .from("products")
      .update(updatePayload)
      .eq("id", pExisting.id)
      .select()
      .single();

    assert(pUpdated?.barcode === customBarcode, "TEST 5: Existing barcode preserved during update", `Got ${pUpdated?.barcode}`);
    assert(pUpdated?.sku === customSku, "TEST 6: Existing SKU preserved during update", `Got ${pUpdated?.sku}`);

    // 8 & 9: Accountant and Salesperson permission guards
    const canAccountantManage = Permissions.canManageProducts({ id: "acc-1", role: "accountant", country: "UAE", is_active: true });
    assert(canAccountantManage === false, "TEST 8: Accountant cannot create products (DENIED)");

    const canSalespersonManage = Permissions.canManageProducts({ id: "sp-1", role: "salesperson", country: "UAE", is_active: true });
    assert(canSalespersonManage === false, "TEST 9: Salesperson cannot create products (DENIED)");
  } finally {
    // Clean up created test products
    if (createdProductIds.length > 0) {
      await adminClient.from("products").delete().in("id", createdProductIds);
      console.log(`Cleaned up ${createdProductIds.length} test products.`);
    }
  }

  console.log("==================================================");
  console.log(`PRODUCT CREATION FLOW TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runProductCreationTests();
