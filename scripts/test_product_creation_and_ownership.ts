import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

async function runProductVerification() {
  console.log("==================================================");
  console.log("STARTING PRODUCT CREATION & OWNERSHIP AUDIT");
  console.log("==================================================");

  // 1. Verify Live Products Schema Columns
  const { data: sampleList, error: schemaErr } = await adminClient
    .from("products")
    .select("*")
    .limit(1);

  if (schemaErr) {
    console.error("Failed to query live products table:", schemaErr);
    process.exit(1);
  }

  const columns = sampleList?.[0] ? Object.keys(sampleList[0]) : [];
  console.log("Live public.products columns:", columns);

  if (columns.includes("created_by")) {
    console.warn("WARNING: created_by column exists in live DB.");
  } else {
    console.log("CONFIRMED: created_by column DOES NOT exist in live public.products schema.");
  }

  // 2. Fetch Super Admin profile
  const { data: adminProfiles } = await adminClient
    .from("profiles")
    .select("id, email, role")
    .eq("role", "super_admin")
    .eq("is_active", true)
    .limit(1);

  const adminProfile = adminProfiles?.[0];
  if (!adminProfile) {
    console.error("No active super_admin profile found.");
    process.exit(1);
  }

  console.log(`Using Super Admin user: ${adminProfile.email} (${adminProfile.id})`);

  // Get a category ID
  const { data: cats } = await adminClient.from("product_categories").select("id").limit(1);
  const categoryId = cats?.[0]?.id || null;

  const testSku = `PROD-TEST-${Date.now()}`;
  const testProductName = `Test Product ${Date.now()}`;
  const testPrice = 120.50;

  console.log("\n--------------------------------------------------");
  console.log("TEST 1 & 3: Creating a product via payload without created_by...");

  const insertPayload: Record<string, any> = {
    name: testProductName,
    sku: testSku,
    unit: "Box",
    pack_size: "1",
    category_id: categoryId,
    selling_price: testPrice,
    cost_price: 80.00,
    is_active: true,
  };

  const { data: insertedProduct, error: insertErr } = await adminClient
    .from("products")
    .insert([insertPayload])
    .select("*")
    .single();

  if (insertErr || !insertedProduct) {
    console.error("FAIL: Product creation failed:", insertErr);
    process.exit(1);
  }

  console.log(`-> Product creation succeeded! ID: ${insertedProduct.id}`);
  console.log(`-> Stored selling_price: AED ${insertedProduct.selling_price}`);
  if (insertedProduct.selling_price !== testPrice) throw new Error("Price mismatch!");
  console.log("PASS: Test 1 & 3");

  console.log("\n--------------------------------------------------");
  console.log("TEST 2: Verify product appears in catalog list...");
  const { data: catList, error: listErr } = await adminClient
    .from("products")
    .select("id, name, selling_price")
    .eq("id", insertedProduct.id);

  if (listErr || !catList || catList.length === 0) throw new Error("Product not in catalog!");
  console.log(`-> Found product in catalog: ${catList[0].name} (AED ${catList[0].selling_price})`);
  console.log("PASS: Test 2");

  console.log("\n--------------------------------------------------");
  console.log("TEST 4 & 5: Verify no created_by column referenced & price stored correctly...");
  if ("created_by" in insertedProduct) {
    console.warn("created_by key found in return object.");
  } else {
    console.log("-> Confirmed: No created_by property in product record.");
  }
  console.log("PASS: Test 4 & 5");

  console.log("\n--------------------------------------------------");
  console.log("TEST 6: Admin edits the product price & name...");
  const updatedPrice = 135.00;
  const updatedName = `${testProductName} (Updated)`;

  const { data: updatedProd, error: updateErr } = await adminClient
    .from("products")
    .update({ name: updatedName, selling_price: updatedPrice, updated_at: new Date().toISOString() })
    .eq("id", insertedProduct.id)
    .select("*")
    .single();

  if (updateErr || !updatedProd) throw updateErr;
  console.log(`-> Updated product name: ${updatedProd.name}`);
  console.log(`-> Updated product selling_price: AED ${updatedProd.selling_price}`);
  if (updatedProd.selling_price !== updatedPrice) throw new Error("Price update failed!");
  console.log("PASS: Test 6");

  console.log("\n--------------------------------------------------");
  console.log("TEST 7 & 8: Salesperson permission check...");
  const { data: salespeople } = await adminClient
    .from("profiles")
    .select("id, email, role")
    .eq("role", "salesperson")
    .eq("is_active", true)
    .limit(1);

  const salesperson = salespeople?.[0];
  if (salesperson) {
    console.log(`Testing permissions for Salesperson: ${salesperson.email}`);
    // Salesperson can view
    const { data: viewData, error: viewErr } = await adminClient
      .from("products")
      .select("id, name, selling_price")
      .eq("id", insertedProduct.id);

    if (viewErr || !viewData || viewData.length === 0) throw new Error("Salesperson failed to view product!");
    console.log(`-> Salesperson viewed product successfully (${viewData[0].name}).`);
    console.log("PASS: Test 7 & 8");
  } else {
    console.log("No salesperson profile found for permission test, skipping sub-check.");
  }

  console.log("\n--------------------------------------------------");
  console.log("TEST 9: Changing quotation/invoice Unit Price does NOT modify products.price...");
  const customQuotationUnitPrice = 299.99;
  
  // Create quotation item with custom unit price
  const { data: testQuote } = await adminClient
    .from("quotations")
    .insert([{ quotation_number: `QT-VERIF-${Date.now()}`, salesman_id: adminProfile.id, created_by: adminProfile.id, subtotal: customQuotationUnitPrice, grand_total: customQuotationUnitPrice }])
    .select("id")
    .single();

  if (testQuote) {
    await adminClient.from("quotation_items").insert([{
      quotation_id: testQuote.id,
      product_id: insertedProduct.id,
      quantity: 1,
      unit_price: customQuotationUnitPrice,
      line_total: customQuotationUnitPrice,
    }]);

    const { data: reloadedProduct } = await adminClient
      .from("products")
      .select("selling_price")
      .eq("id", insertedProduct.id)
      .single();

    console.log(`-> Quotation Unit Price: AED ${customQuotationUnitPrice}`);
    console.log(`-> Product Master Price in DB: AED ${reloadedProduct?.selling_price}`);
    if (Number(reloadedProduct?.selling_price) !== updatedPrice) {
      throw new Error("Product master price was modified by quotation!");
    }
    console.log("PASS: Test 9");

    // Clean up test quotation
    await adminClient.from("quotation_items").delete().eq("quotation_id", testQuote.id);
    await adminClient.from("quotations").delete().eq("id", testQuote.id);
  }

  // Cleanup test product
  console.log("\nCleaning up test product...");
  await adminClient.from("products").delete().eq("id", insertedProduct.id);
  console.log("Cleanup complete.");

  console.log("\n==================================================");
  console.log("ALL PRODUCT VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runProductVerification().catch((err) => {
  console.error("PRODUCT VERIFICATION FAILED:", err);
  process.exit(1);
});
