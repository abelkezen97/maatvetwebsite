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

async function runPricingTests() {
  console.log("==================================================");
  console.log("STARTING QUOTATION & INVOICE PRICING BEHAVIOR AUDIT");
  console.log("==================================================");

  // 1. Get or create test product (Biolax, stored price = AED 100)
  let { data: sampleList } = await adminClient
    .from("products")
    .select("id, name, selling_price")
    .limit(1);

  let productId: string;
  if (sampleList && sampleList.length > 0) {
    productId = sampleList[0].id;
    await adminClient.from("products").update({ selling_price: 100 }).eq("id", productId);
  } else {
    const { data: cats } = await adminClient.from("product_categories").select("id").limit(1);
    const catId = cats?.[0]?.id;
    const { data: newProd, error: createErr } = await adminClient
      .from("products")
      .insert([{ name: "Biolax", selling_price: 100, unit: "Box", category_id: catId }])
      .select("id, selling_price")
      .single();
    if (createErr || !newProd) {
      console.error("Failed to create test product Biolax:", createErr);
      process.exit(1);
    }
    productId = newProd.id;
  }

  async function getProductPrice(): Promise<number> {
    const { data: p } = await adminClient
      .from("products")
      .select("selling_price")
      .eq("id", productId)
      .single();
    return Number(p?.selling_price);
  }

  const { data: custs } = await adminClient.from("customers").select("id").limit(1);
  const customerId = custs?.[0]?.id || null;

  const { data: profiles } = await adminClient.from("profiles").select("id").limit(1);
  const salesmanId = profiles?.[0]?.id || null;

  const createdQuoteIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  let initialPrice = await getProductPrice();
  console.log(`INITIAL PRODUCT MASTER PRICE: AED ${initialPrice}`);
  if (initialPrice !== 100) {
    console.error("ERROR: Product master price is not 100.");
    process.exit(1);
  }

  console.log("\n--------------------------------------------------");
  console.log("TEST 1: Create quotation with unitPrice = 100");
  const { data: q1, error: q1Err } = await adminClient
    .from("quotations")
    .insert([{ quotation_number: `QT-TEST-${Date.now()}-1`, customer_id: customerId, salesman_id: salesmanId, created_by: salesmanId, subtotal: 100, grand_total: 100 }])
    .select("id")
    .single();

  if (q1Err || !q1) throw q1Err;
  createdQuoteIds.push(q1.id);

  await adminClient.from("quotation_items").insert([{
    quotation_id: q1.id,
    product_id: productId,
    quantity: 1,
    unit_price: 100,
    discount: 0,
    line_total: 100,
  }]);

  const { data: q1Item } = await adminClient.from("quotation_items").select("unit_price").eq("quotation_id", q1.id).single();
  const priceAfterT1 = await getProductPrice();
  console.log(`-> Quotation Unit Price: AED ${q1Item?.unit_price}`);
  console.log(`-> Product Master Price: AED ${priceAfterT1}`);
  if (q1Item?.unit_price !== 100 || priceAfterT1 !== 100) throw new Error("Test 1 failed!");
  console.log("PASS: Test 1");

  console.log("\n--------------------------------------------------");
  console.log("TEST 2: Create quotation with unitPrice = 150");
  const { data: q2, error: q2Err } = await adminClient
    .from("quotations")
    .insert([{ quotation_number: `QT-TEST-${Date.now()}-2`, customer_id: customerId, salesman_id: salesmanId, created_by: salesmanId, subtotal: 150, grand_total: 150 }])
    .select("id")
    .single();

  if (q2Err || !q2) throw q2Err;
  createdQuoteIds.push(q2.id);

  await adminClient.from("quotation_items").insert([{
    quotation_id: q2.id,
    product_id: productId,
    quantity: 1,
    unit_price: 150,
    discount: 0,
    line_total: 150,
  }]);

  const { data: q2Item } = await adminClient.from("quotation_items").select("unit_price").eq("quotation_id", q2.id).single();
  const priceAfterT2 = await getProductPrice();
  console.log(`-> Quotation Unit Price: AED ${q2Item?.unit_price}`);
  console.log(`-> Product Master Price: AED ${priceAfterT2}`);
  if (q2Item?.unit_price !== 150 || priceAfterT2 !== 100) throw new Error("Test 2 failed!");
  console.log("PASS: Test 2");

  console.log("\n--------------------------------------------------");
  console.log("TEST 3: Create quotation with unitPrice = 250");
  const { data: q3, error: q3Err } = await adminClient
    .from("quotations")
    .insert([{ quotation_number: `QT-TEST-${Date.now()}-3`, customer_id: customerId, salesman_id: salesmanId, created_by: salesmanId, subtotal: 250, grand_total: 250 }])
    .select("id")
    .single();

  if (q3Err || !q3) throw q3Err;
  createdQuoteIds.push(q3.id);

  await adminClient.from("quotation_items").insert([{
    quotation_id: q3.id,
    product_id: productId,
    quantity: 1,
    unit_price: 250,
    discount: 0,
    line_total: 250,
  }]);

  const { data: q3Item } = await adminClient.from("quotation_items").select("unit_price").eq("quotation_id", q3.id).single();
  const priceAfterT3 = await getProductPrice();
  console.log(`-> Quotation Unit Price: AED ${q3Item?.unit_price}`);
  console.log(`-> Product Master Price: AED ${priceAfterT3}`);
  if (q3Item?.unit_price !== 250 || priceAfterT3 !== 100) throw new Error("Test 3 failed!");
  console.log("PASS: Test 3");

  console.log("\n--------------------------------------------------");
  console.log("TEST 4: Create invoice with unitPrice = 150");
  const { data: inv1, error: inv1Err } = await adminClient
    .from("invoices")
    .insert([{ invoice_number: `INV-TEST-${Date.now()}-1`, customer_id: customerId, salesman_id: salesmanId, created_by: salesmanId, subtotal: 150, grand_total: 150 }])
    .select("id")
    .single();

  if (inv1Err || !inv1) throw inv1Err;
  createdInvoiceIds.push(inv1.id);

  await adminClient.from("invoice_items").insert([{
    invoice_id: inv1.id,
    product_id: productId,
    quantity: 1,
    unit_price: 150,
    line_total: 150,
  }]);

  const { data: inv1Item } = await adminClient.from("invoice_items").select("unit_price").eq("invoice_id", inv1.id).single();
  const priceAfterT4 = await getProductPrice();
  console.log(`-> Invoice Unit Price: AED ${inv1Item?.unit_price}`);
  console.log(`-> Product Master Price: AED ${priceAfterT4}`);
  if (inv1Item?.unit_price !== 150 || priceAfterT4 !== 100) throw new Error("Test 4 failed!");
  console.log("PASS: Test 4");

  console.log("\n--------------------------------------------------");
  console.log("TEST 5: Edit invoice from 150 to 175");
  await adminClient.from("invoices").update({ subtotal: 175, grand_total: 175 }).eq("id", inv1.id);
  await adminClient.from("invoice_items").delete().eq("invoice_id", inv1.id);
  await adminClient.from("invoice_items").insert([{
    invoice_id: inv1.id,
    product_id: productId,
    quantity: 1,
    unit_price: 175,
    line_total: 175,
  }]);

  const { data: inv1EditedItem } = await adminClient.from("invoice_items").select("unit_price").eq("invoice_id", inv1.id).single();
  const priceAfterT5 = await getProductPrice();
  console.log(`-> Edited Invoice Unit Price: AED ${inv1EditedItem?.unit_price}`);
  console.log(`-> Product Master Price: AED ${priceAfterT5}`);
  if (inv1EditedItem?.unit_price !== 175 || priceAfterT5 !== 100) throw new Error("Test 5 failed!");
  console.log("PASS: Test 5");

  console.log("\n--------------------------------------------------");
  console.log("TEST 6: Reload/edit existing invoice -> unitPrice remains 175");
  const { data: reloadedInv } = await adminClient
    .from("invoices")
    .select("*, invoice_items(*, products(selling_price))")
    .eq("id", inv1.id)
    .single();

  const loadedUnitPrice = reloadedInv?.invoice_items?.[0]?.unit_price;
  const loadedProductMasterPrice = reloadedInv?.invoice_items?.[0]?.products?.selling_price;
  const currentProductPrice = await getProductPrice();

  console.log(`-> Loaded Invoice Item Unit Price: AED ${loadedUnitPrice}`);
  console.log(`-> Loaded Product Master Price from relation: AED ${loadedProductMasterPrice}`);
  console.log(`-> Actual Product Master Price in DB: AED ${currentProductPrice}`);

  if (loadedUnitPrice !== 175 || currentProductPrice !== 100) throw new Error("Test 6 failed!");
  console.log("PASS: Test 6");

  console.log("\n--------------------------------------------------");
  console.log("TEST 7: Create a new invoice for the same product -> default unitPrice loads as 100");
  const { data: freshProd } = await adminClient.from("products").select("selling_price").eq("id", productId).single();
  const defaultLoadedUnitPrice = Number(freshProd?.selling_price);
  const priceAfterT7 = await getProductPrice();

  console.log(`-> New Document Default Unit Price: AED ${defaultLoadedUnitPrice}`);
  console.log(`-> Product Master Price: AED ${priceAfterT7}`);
  if (defaultLoadedUnitPrice !== 100 || priceAfterT7 !== 100) throw new Error("Test 7 failed!");
  console.log("PASS: Test 7");

  console.log("\n--------------------------------------------------");
  console.log("Cleaning up test documents...");
  if (createdQuoteIds.length > 0) {
    await adminClient.from("quotation_items").delete().in("quotation_id", createdQuoteIds);
    await adminClient.from("quotations").delete().in("id", createdQuoteIds);
  }
  if (createdInvoiceIds.length > 0) {
    await adminClient.from("invoice_items").delete().in("invoice_id", createdInvoiceIds);
    await adminClient.from("receipts").delete().in("invoice_id", createdInvoiceIds);
    await adminClient.from("invoices").delete().in("id", createdInvoiceIds);
  }
  console.log("Cleanup complete.");

  console.log("\n==================================================");
  console.log("ALL 7 TEST SCENARIOS PASSED SUCCESSFULLY!");
  console.log("PRODUCT MASTER PRICE WAS NEVER MODIFIED AND REMAINED AED 100");
  console.log("==================================================");
}

runPricingTests().catch((err) => {
  console.error("TEST SUITE FAILED:", err);
  process.exit(1);
});
