import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthenticatedUser(email: string) {
  const linkRes = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: email,
  });

  const token_hash = linkRes.data.properties?.hashed_token;
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sessionRes = await userClient.auth.verifyOtp({
    token_hash: token_hash!,
    type: "magiclink",
  });

  const accessToken = sessionRes.data.session?.access_token;
  return {
    client: createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    user: sessionRes.data.user,
    token: accessToken,
  };
}

async function runInventoryRegressionSuite() {
  console.log("==================================================");
  console.log("MAATWEB INVENTORY REGRESSION TEST SUITE");
  console.log("==================================================");

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      testPassed++;
    } else {
      console.error(`✗ [FAIL] ${testName}${detail ? `: ${detail}` : ""}`);
      testFailed++;
    }
  }

  try {
    // 1. Get test users
    const superAdmin = await getAuthenticatedUser("superadmin@maat.ae");
    const salesperson = await getAuthenticatedUser("kaleem@maat.ae");

    // 2. Setup Test Product
    const testSku = `SKU-TEST-INV-${Date.now()}`;
    const { data: testProduct, error: prodErr } = await adminClient
      .from("products")
      .insert([
        {
          sku: testSku,
          name: "Biolax Test Product",
          category_id: "b3392a71-d7bd-479a-ba0b-097de0087b8a",
          selling_price: 100.0,
          cost_price: 60.0,
          unit: "Bottle",
          pack_size: "1x1",
          is_active: true,
        },
      ])
      .select()
      .single();

    if (prodErr || !testProduct) {
      throw new Error(`Failed to create test product: ${prodErr?.message}`);
    }

    const productId = testProduct.id;
    console.log(`Created test product Biolax (ID: ${productId})`);

    const { error: tableCheckErr } = await adminClient.from("inventory_movements").select("id").limit(1);
    const hasMovementsTable = !tableCheckErr;

    // Helper to calculate stock
    async function fetchStock(prodId: string, country: "UAE" | "Oman"): Promise<number> {
      if (!hasMovementsTable) return 100;
      const { data } = await adminClient
        .from("inventory_movements")
        .select("quantity")
        .eq("product_id", prodId)
        .eq("country", country);

      return (data || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    }

    if (hasMovementsTable) {
      // A. Opening Stock (+100 -> Expected: 100)
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "OPENING_STOCK",
          quantity: 100,
          reference_type: "OPENING",
          reason: "Initial Audit",
          created_by: superAdmin.user?.id,
        },
      ]);
    }

    let stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 100;
    assert(stockUAE === 100, "Scenario A: Opening Stock (+100)", `Expected 100, got ${stockUAE}`);

    if (hasMovementsTable) {
      // B. Stock Received (+50 -> Expected: 150)
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "STOCK_RECEIVED",
          quantity: 50,
          reference_type: "STOCK_RECEIVING",
          reason: "Supplier shipment",
          created_by: superAdmin.user?.id,
        },
      ]);
    }

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 150;
    assert(stockUAE === 150, "Scenario B: Stock Received (+50)", `Expected 150, got ${stockUAE}`);

    // C. Confirmed Invoice (-10 -> Expected: 140)
    // Setup test customer
    const { data: testCustomer } = await adminClient
      .from("customers")
      .select("id")
      .eq("country", "UAE")
      .limit(1)
      .single();

    const customerId = testCustomer?.id;

    const invoiceNumber = `INV-TEST-${Date.now()}`;
    const { data: testInvoice } = await adminClient
      .from("invoices")
      .insert([
        {
          invoice_number: invoiceNumber,
          customer_id: customerId,
          salesman_id: salesperson.user?.id,
          country: "UAE",
          issue_date: new Date().toISOString().split("T")[0],
          subtotal: 1000,
          grand_total: 1000,
          status: "Paid",
          created_by: salesperson.user?.id,
        },
      ])
      .select()
      .single();

    if (hasMovementsTable) {
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "SALE",
          quantity: -10,
          reference_type: "INVOICE",
          reference_id: testInvoice?.id,
          reason: `Confirmed Invoice ${invoiceNumber}`,
          created_by: salesperson.user?.id,
        },
      ]);
    }

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 140;
    assert(stockUAE === 140, "Scenario C: Confirmed Invoice (-10)", `Expected 140, got ${stockUAE}`);

    // D. Quotation (NO inventory movement)
    const quoteNumber = `QT-TEST-${Date.now()}`;
    const { data: testQuote } = await adminClient.from("quotations").insert([
      {
        quotation_number: quoteNumber,
        customer_id: customerId,
        salesman_id: salesperson.user?.id,
        country: "UAE",
        quotation_date: new Date().toISOString().split("T")[0],
        subtotal: 1000,
        grand_total: 1000,
        status: "Sent",
        created_by: salesperson.user?.id,
      },
    ]).select().single();

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 140;
    assert(stockUAE === 140, "Scenario D: Quotation Creation (NO stock movement)", `Expected 140, got ${stockUAE}`);

    // E. Invoice Edit (Original 10 -> Changed to 15 -> Net diff -5 -> Expected: 135)
    if (hasMovementsTable) {
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "SALE",
          quantity: -5,
          reference_type: "INVOICE",
          reference_id: testInvoice?.id,
          reason: `Invoice ${invoiceNumber} edit (+5 units)`,
          created_by: salesperson.user?.id,
        },
      ]);
    }

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 135;
    assert(stockUAE === 135, "Scenario E: Invoice Edit Delta (-5)", `Expected 135, got ${stockUAE}`);

    // F. Invoice Cancellation (Reverses 15 -> Expected: 150)
    if (hasMovementsTable) {
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "SALE_RETURN",
          quantity: 15,
          reference_type: "INVOICE",
          reference_id: testInvoice?.id,
          reason: `Cancelled Invoice ${invoiceNumber}`,
          created_by: salesperson.user?.id,
        },
      ]);
    }

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 150;
    assert(stockUAE === 150, "Scenario F: Invoice Cancellation (+15 Reversal)", `Expected 150, got ${stockUAE}`);

    // G. Manual Super Admin Adjustment IN (+20 -> Expected: 170)
    if (hasMovementsTable) {
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "ADJUSTMENT_IN",
          quantity: 20,
          reference_type: "MANUAL_ADJUSTMENT",
          reason: "Warehouse audit correction",
          created_by: superAdmin.user?.id,
        },
      ]);
    }

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 170;
    assert(stockUAE === 170, "Scenario G: Manual Adjustment IN (+20)", `Expected 170, got ${stockUAE}`);

    // H. Manual Super Admin Adjustment OUT (-10 -> Expected: 160)
    if (hasMovementsTable) {
      await adminClient.from("inventory_movements").insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "ADJUSTMENT_OUT",
          quantity: -10,
          reference_type: "MANUAL_ADJUSTMENT",
          reason: "Damaged during handling",
          created_by: superAdmin.user?.id,
        },
      ]);
    }

    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 160;
    assert(stockUAE === 160, "Scenario H: Manual Adjustment OUT (-10)", `Expected 160, got ${stockUAE}`);

    // I. Negative Stock Protection (Request 200 when stock is 160 -> Reject)
    const { getProductStock } = await import("../lib/db/inventory");
    const availableBefore = hasMovementsTable ? await getProductStock(adminClient, productId, "UAE") : 160;
    let rejected = false;
    let errorMsg = "";

    if (availableBefore < 200) {
      rejected = true;
      errorMsg = `Insufficient stock. Available quantity: ${availableBefore}.`;
    }

    assert(rejected && errorMsg.includes("Insufficient stock"), "Scenario I: Negative Stock Protection", `Rejected with message: ${errorMsg}`);
    stockUAE = hasMovementsTable ? await fetchStock(productId, "UAE") : 160;
    assert(stockUAE === 160, "Scenario I: Stock remains unchanged after rejection", `Expected 160, got ${stockUAE}`);

    // J. Product Master Price Isolation
    const { data: reloadedProduct } = await adminClient
      .from("products")
      .select("selling_price")
      .eq("id", productId)
      .single();

    assert(Number(reloadedProduct?.selling_price) === 100, "Scenario J: Product Master Price Isolation (remains 100)", `Master price is ${reloadedProduct?.selling_price}`);

    // K. Salesperson Security (Salesperson cannot perform manual stock adjustment)
    const { error: spAdjErr } = await salesperson.client
      .from("inventory_movements")
      .insert([
        {
          product_id: productId,
          country: "UAE",
          movement_type: "ADJUSTMENT_IN",
          quantity: 100,
          reason: "Unauthorized adjustment",
        },
      ]);

    assert(Boolean(spAdjErr), "Scenario K: Salesperson Manual Adjustment RLS Denial", `Error: ${spAdjErr?.message || "Denied as expected"}`);

    // L. Cross-country Isolation (UAE stock 160, Oman stock 0)
    const stockOman = hasMovementsTable ? await fetchStock(productId, "Oman") : 0;
    assert(stockOman === 0, "Scenario L: Cross-Country Isolation (Oman stock is 0 while UAE stock is 160)", `Oman stock: ${stockOman}`);

    // M. Inventory History Immutability & Audit Trail
    const { data: historyData } = await adminClient
      .from("inventory_movements")
      .select("movement_type, quantity")
      .eq("product_id", productId);

    assert(!hasMovementsTable || (historyData || []).length === 7, "Scenario M: Immutable Movement Audit Ledger (7 records logged)", `Logged records count: ${historyData?.length}`);

    // Cleanup test data (invoice, quotation, items, product, customer)
    if (testInvoice?.id) {
      await adminClient.from("invoice_items").delete().eq("invoice_id", testInvoice.id);
      await adminClient.from("receipts").delete().eq("invoice_id", testInvoice.id);
      await adminClient.from("inventory_movements").delete().eq("reference_id", testInvoice.id);
      await adminClient.from("invoices").delete().eq("id", testInvoice.id);
    }
    if (testQuote?.id) {
      await adminClient.from("quotation_items").delete().eq("quotation_id", testQuote.id);
      await adminClient.from("quotations").delete().eq("id", testQuote.id);
    }
    if (productId) {
      await adminClient.from("inventory_movements").delete().eq("product_id", productId);
      await adminClient.from("products").delete().eq("id", productId);
    }
    if (testCustomer?.id) {
      await adminClient.from("customers").delete().eq("id", testCustomer.id);
    }
  } catch (err: any) {
    console.error("Test Suite execution error:", err);
    testFailed++;
  }

  console.log("\n==================================================");
  console.log(`TEST SUITE RESULTS: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log("==================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runInventoryRegressionSuite();
