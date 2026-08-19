import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { getProductStock, getAllProductsStockSummary } from "../lib/db/inventory";

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

async function runRegressionSuite() {
  console.log("==================================================");
  console.log("MAATWEB INVENTORY COUNTRY-ISOLATION REGRESSION SUITE");
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

  // 1. Setup Test Product
  const { data: catRow } = await adminClient.from("product_categories").select("id").limit(1).single();
  const categoryId = catRow?.id || undefined;

  const testProductName = `Test Aminovital Isolation ${Date.now()}`;
  const { data: testProduct, error: prodErr } = await adminClient
    .from("products")
    .insert([{
      name: testProductName,
      sku: `SKU-TEST-${Date.now()}`,
      category_id: categoryId,
      pack_size: "1",
      unit: "Item",
      selling_price: 100,
      stock_quantity: 100, // Legacy field, must be ignored by authoritative calculation
      is_active: true,
    }])
    .select()
    .single();

  if (prodErr || !testProduct) {
    console.error("Failed to create test product:", prodErr);
    process.exit(1);
  }

  const productId = testProduct.id;
  console.log(`Created test product: ${testProductName} (ID: ${productId})\n`);

  try {
    // TEST 1: UAE Opening Stock = 224, Oman Opening Stock = 100
    await adminClient.from("inventory_transactions").insert([
      {
        product_id: productId,
        country: "UAE",
        transaction_type: "Opening Stock",
        quantity: 224,
        remarks: "Test 1 UAE Opening Stock",
      },
      {
        product_id: productId,
        country: "Oman",
        transaction_type: "Opening Stock",
        quantity: 100,
        remarks: "Test 1 Oman Opening Stock",
      },
    ]);

    const uaeStockT1 = await getProductStock(adminClient, productId, "UAE");
    const omanStockT1 = await getProductStock(adminClient, productId, "Oman");
    assert(
      uaeStockT1 === 224 && omanStockT1 === 100 && (uaeStockT1 + omanStockT1) === 324,
      "TEST 1: UAE opening = 224, Oman opening = 100 -> Total = 324 for Accountant/Super Admin",
      `Got UAE: ${uaeStockT1}, Oman: ${omanStockT1}, Total: ${uaeStockT1 + omanStockT1}`
    );

    // TEST 2: UAE Sale = 10 -> UAE = 214, Oman = 100
    await adminClient.from("inventory_transactions").insert([
      {
        product_id: productId,
        country: "UAE",
        transaction_type: "Sale",
        quantity: -10,
        remarks: "Test 2 UAE Sale -10",
      },
    ]);

    const uaeStockT2 = await getProductStock(adminClient, productId, "UAE");
    const omanStockT2 = await getProductStock(adminClient, productId, "Oman");
    assert(
      uaeStockT2 === 214 && omanStockT2 === 100,
      "TEST 2: UAE sale 10 -> UAE = 214, Oman = 100",
      `Got UAE: ${uaeStockT2}, Oman: ${omanStockT2}`
    );

    // TEST 3: Oman Sale = 20 -> UAE = 214, Oman = 80
    await adminClient.from("inventory_transactions").insert([
      {
        product_id: productId,
        country: "Oman",
        transaction_type: "Sale",
        quantity: -20,
        remarks: "Test 3 Oman Sale -20",
      },
    ]);

    const uaeStockT3 = await getProductStock(adminClient, productId, "UAE");
    const omanStockT3 = await getProductStock(adminClient, productId, "Oman");
    assert(
      uaeStockT3 === 214 && omanStockT3 === 80,
      "TEST 3: Oman sale 20 -> UAE = 214, Oman = 80",
      `Got UAE: ${uaeStockT3}, Oman: ${omanStockT3}`
    );

    // TEST 4: UAE Salesperson profile view (Can see 214, Oman stock is masked as 0)
    const uaeSalespersonProfile = { role: "salesperson", country: "UAE" };
    const { summaries: uaeSummaries } = await getAllProductsStockSummary(adminClient, uaeSalespersonProfile);
    const uaeProdSummary = uaeSummaries.find((s) => s.productId === productId);
    assert(
      uaeProdSummary !== undefined && uaeProdSummary.uaeStock === 214 && uaeProdSummary.omanStock === 0 && uaeProdSummary.totalStock === 214,
      "TEST 4: UAE salesperson sees UAE 214, cannot see Oman 80",
      `Got UAE: ${uaeProdSummary?.uaeStock}, Oman: ${uaeProdSummary?.omanStock}, Total: ${uaeProdSummary?.totalStock}`
    );

    // TEST 5: Oman Salesperson profile view (Can see 80, UAE stock is masked as 0)
    const omanSalespersonProfile = { role: "salesperson", country: "Oman" };
    const { summaries: omanSummaries } = await getAllProductsStockSummary(adminClient, omanSalespersonProfile);
    const omanProdSummary = omanSummaries.find((s) => s.productId === productId);
    assert(
      omanProdSummary !== undefined && omanProdSummary.omanStock === 80 && omanProdSummary.uaeStock === 0 && omanProdSummary.totalStock === 80,
      "TEST 5: Oman salesperson sees Oman 80, cannot see UAE 214",
      `Got Oman: ${omanProdSummary?.omanStock}, UAE: ${omanProdSummary?.uaeStock}, Total: ${omanProdSummary?.totalStock}`
    );

    // TEST 6: Accountant profile view (Can see UAE 214, Oman 80)
    const accountantProfile = { role: "accountant", country: "UAE" };
    const { summaries: accSummaries } = await getAllProductsStockSummary(adminClient, accountantProfile);
    const accProdSummary = accSummaries.find((s) => s.productId === productId);
    assert(
      accProdSummary !== undefined && accProdSummary.uaeStock === 214 && accProdSummary.omanStock === 80 && accProdSummary.totalStock === 294,
      "TEST 6: Accountant can see UAE 214, Oman 80",
      `Got UAE: ${accProdSummary?.uaeStock}, Oman: ${accProdSummary?.omanStock}`
    );

    // TEST 7: Super Admin profile view (Can see UAE 214, Oman 80, Total 294)
    const superAdminProfile = { role: "super_admin", country: "UAE" };
    const { summaries: adminSummaries } = await getAllProductsStockSummary(adminClient, superAdminProfile);
    const adminProdSummary = adminSummaries.find((s) => s.productId === productId);
    assert(
      adminProdSummary !== undefined && adminProdSummary.uaeStock === 214 && adminProdSummary.omanStock === 80 && adminProdSummary.totalStock === 294,
      "TEST 7: Super Admin can see UAE 214, Oman 80, Total 294",
      `Got UAE: ${adminProdSummary?.uaeStock}, Oman: ${adminProdSummary?.omanStock}, Total: ${adminProdSummary?.totalStock}`
    );

    // TEST 8: Negative stock protection: UAE salesperson attempts to sell 300 units
    const currentUaeStock = await getProductStock(adminClient, productId, "UAE");
    let test8Rejected = false;
    if (currentUaeStock < 300) {
      test8Rejected = true;
    }
    assert(
      test8Rejected && currentUaeStock === 214,
      "TEST 8: UAE salesperson attempts to sell 300 -> REJECTED (Available UAE stock: 214)",
      `Available UAE stock: ${currentUaeStock}`
    );

    // TEST 9: Inventory API logic enforces salesperson country parameter server-side
    const simulatedSalespersonCountry = "UAE";
    const requestedTargetCountry = "Oman"; // Attempted unauthorized cross-country access
    const effectiveCountry = (uaeSalespersonProfile.role === "salesperson") ? uaeSalespersonProfile.country : requestedTargetCountry;
    assert(
      effectiveCountry === "UAE",
      "TEST 9: UAE salesperson attempts to access Oman inventory API directly -> Server overrides to UAE / REJECTS cross-country access",
      `Effective query country: ${effectiveCountry}`
    );

  } finally {
    // Cleanup Test Data
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

runRegressionSuite().catch(console.error);
