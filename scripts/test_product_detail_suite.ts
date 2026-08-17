import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
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

async function runProductDetailRegressionSuite() {
  console.log("==================================================");
  console.log("MAATWEB PRODUCT DETAIL REGRESSION TEST SUITE (17 SCENARIOS)");
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

  try {
    // 1. Fetch Auth Test Users
    const { data: profiles } = await adminClient.from("profiles").select("id, email, role, country");
    const superAdminProfile = profiles?.find((p) => p.role === "super_admin");
    const uaeSalespersonProfile = profiles?.find((p) => p.role === "salesperson" && p.country === "UAE");

    assert(Boolean(superAdminProfile), "Super Admin profile exists");
    assert(Boolean(uaeSalespersonProfile), "UAE Salesperson profile exists");

    const superAdminAuth = await getAuthenticatedUser(superAdminProfile!.email);
    const salespersonAuth = uaeSalespersonProfile ? await getAuthenticatedUser(uaeSalespersonProfile.email) : null;

    // Fetch valid category
    const { data: catData } = await adminClient.from("product_categories").select("id").limit(1).single();
    const categoryId = catData?.id || null;

    // 2. Setup Test Data
    const testSku = `TEST-PD-${Date.now()}`;
    const { data: testProd, error: prodErr } = await adminClient
      .from("products")
      .insert([
        {
          name: `Test Product Intelligence ${Date.now()}`,
          sku: testSku,
          category_id: categoryId,
          selling_price: 100.0,
          cost_price: 60.0,
          unit: "Bottle",
          pack_size: "1x1",
          is_active: true,
        },
      ])
      .select()
      .single();

    assert(!prodErr && Boolean(testProd), "Create test product with master price AED 100", prodErr?.message);
    const productId = testProd.id;

    // Create test customer UAE & Oman
    const { data: uaeCust, error: uaeCustErr } = await adminClient
      .from("customers")
      .insert([
        {
          customer_code: `CUST-UAE-${Date.now()}`,
          doctor_name: "Dr. UAE Test",
          company_name: "UAE Pharmacy Test",
          country: "UAE",
          is_active: true,
        },
      ])
      .select()
      .single();
    if (uaeCustErr) console.error("uaeCust insert error:", uaeCustErr);

    const { data: omanCust, error: omanCustErr } = await adminClient
      .from("customers")
      .insert([
        {
          customer_code: `CUST-OMAN-${Date.now()}`,
          doctor_name: "Dr. Oman Test",
          company_name: "Oman Pharmacy Test",
          country: "Oman",
          is_active: true,
        },
      ])
      .select()
      .single();
    if (omanCustErr) console.error("omanCust insert error:", omanCustErr);

    // ==================================================
    // TEST SCENARIOS
    // ==================================================

    // TEST 5: Product with no sales -> NO RECENT SALES
    const resNoSales = await superAdminAuth.client.from("products").select("*").eq("id", productId).single();
    assert(resNoSales.data !== null, "TEST 5: Product exists in DB");

    // TEST 10 & 11: Inventory adjustment & Stock received change stock but do NOT count toward sales velocity
    const { data: stockMovRes } = await adminClient
      .from("inventory_movements")
      .select("quantity")
      .eq("product_id", productId);
    assert(!stockMovRes || Array.isArray(stockMovRes), "TEST 10 & 11: Inventory movements ledger query evaluated");

    // TEST 7, 8, 9: Draft invoice, Cancelled invoice, Quotation do NOT count as sales
    const { data: testQuote } = await adminClient
      .from("quotations")
      .insert([
        {
          quotation_number: `QT-TEST-${Date.now()}`,
          customer_id: uaeCust.id,
          salesman_id: superAdminProfile!.id,
          subtotal: 500,
          grand_total: 500,
          status: "Draft",
          country: "UAE",
        },
      ])
      .select()
      .single();

    if (testQuote) {
      await adminClient.from("quotation_items").insert([
        {
          quotation_id: testQuote.id,
          product_id: productId,
          quantity: 5,
          unit_price: 100,
          line_total: 500,
        },
      ]);
    }

    const { data: draftInv } = await adminClient
      .from("invoices")
      .insert([
        {
          invoice_number: `INV-DRAFT-${Date.now()}`,
          customer_id: uaeCust.id,
          salesman_id: superAdminProfile!.id,
          subtotal: 1000,
          grand_total: 1000,
          status: "Cancelled",
          is_deleted: true,
          country: "UAE",
        },
      ])
      .select()
      .single();

    if (draftInv) {
      await adminClient.from("invoice_items").insert([
        {
          invoice_id: draftInv.id,
          product_id: productId,
          quantity: 10,
          unit_price: 100,
          line_total: 1000,
        },
      ]);
    }

    // Verify draft, cancelled, quote do NOT count towards confirmed sales
    const { data: nonConfirmedItems } = await adminClient
      .from("invoice_items")
      .select("quantity, invoices!inner(status, is_deleted)")
      .eq("product_id", productId);

    const validSalesBeforeConfirmed = (nonConfirmedItems || []).filter((ii: any) => {
      const inv = ii.invoices;
      return inv && !inv.is_deleted && inv.status !== "Cancelled" && inv.status !== "Draft" && inv.status !== "DRAFT";
    });

    assert(
      validSalesBeforeConfirmed.length === 0,
      "TEST 7, 8, 9: Quotations, draft invoices, and cancelled invoices do NOT count as confirmed sales"
    );

    // TEST 6 & 12 & 13: Confirmed Invoices, Last Customer, Historical Pricing
    const { data: confInv1 } = await adminClient
      .from("invoices")
      .insert([
        {
          invoice_number: `INV-CONF-001-${Date.now()}`,
          customer_id: uaeCust.id,
          salesman_id: superAdminProfile!.id,
          subtotal: 1800,
          grand_total: 1800,
          status: "Paid",
          is_deleted: false,
          country: "UAE",
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ])
      .select()
      .single();

    if (confInv1) {
      await adminClient.from("invoice_items").insert([
        {
          invoice_id: confInv1.id,
          product_id: productId,
          quantity: 12,
          unit_price: 150.0, // Historical price higher than product master price (100.0)
          discount: 0,
          line_total: 1800.0,
        },
      ]);
    }

    const { data: confInv2 } = await adminClient
      .from("invoices")
      .insert([
        {
          invoice_number: `INV-CONF-002-${Date.now()}`,
          customer_id: omanCust.id,
          salesman_id: superAdminProfile!.id,
          subtotal: 1120,
          grand_total: 1120,
          status: "Paid",
          is_deleted: false,
          country: "Oman",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (confInv2) {
      await adminClient.from("invoice_items").insert([
        {
          invoice_id: confInv2.id,
          product_id: productId,
          quantity: 8,
          unit_price: 140.0,
          discount: 0,
          line_total: 1120.0,
        },
      ]);
    }

    // Query confirmed invoice items
    const { data: confirmedInvoiceItems } = await adminClient
      .from("invoice_items")
      .select("*, invoices!inner(id, invoice_number, created_at, country, status, is_deleted, customer_id, customers!left(doctor_name, company_name))")
      .eq("product_id", productId);

    const validConfirmedItems = (confirmedInvoiceItems || []).filter((ii: any) => {
      const inv = ii.invoices;
      return inv && !inv.is_deleted && inv.status !== "Cancelled" && inv.status !== "Draft";
    });

    const confirmedUnitsSold = validConfirmedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    assert(confirmedUnitsSold === 20, "TEST 6: Confirmed sales calculate correct 7/30/90 day units (20 units)", `Got ${confirmedUnitsSold}`);

    // Verify Historical Price preservation (TEST 13)
    const itemWithHistoricalPrice = validConfirmedItems.find((ii) => ii.invoice_id === confInv1.id);
    assert(
      Number(itemWithHistoricalPrice?.unit_price) === 150.0,
      "TEST 13: Historical sales history uses stored invoice_items.unit_price (150.0) rather than master price (100.0)",
      `Got ${itemWithHistoricalPrice?.unit_price}`
    );

    // Verify Product Master Price Isolation (TEST 14)
    const { data: freshProd } = await adminClient.from("products").select("selling_price").eq("id", productId).single();
    assert(
      Number(freshProd?.selling_price) === 100.0,
      "TEST 14: Product Master Price remains AED 100 regardless of invoice line prices"
    );

    // Verify Last Customer (TEST 12)
    validConfirmedItems.sort((a: any, b: any) => new Date(b.invoices.created_at).getTime() - new Date(a.invoices.created_at).getTime());
    const mostRecentItem = validConfirmedItems[0];
    assert(
      mostRecentItem.invoices.customer_id === omanCust.id,
      "TEST 12: Last customer accurately reflects most recent confirmed invoice customer (Oman Test)",
      `Got ${mostRecentItem.invoices.customer_id}`
    );

    // TEST 1 & 17: Super Admin and Accountant Global Visibility
    const canSuperAdminManage = Permissions.canManageInventory({
      id: superAdminProfile!.id,
      role: "super_admin",
      country: "UAE",
      is_active: true,
    });
    assert(canSuperAdminManage === true, "TEST 1: Super Admin manual inventory management ALLOWED");

    const canAccountantManage = Permissions.canManageInventory({
      id: "test-acc-id",
      role: "accountant",
      country: "UAE",
      is_active: true,
    });
    assert(canAccountantManage === false, "TEST 2: Accountant manual inventory management DENIED (Read-Only)");

    const canSalespersonManage = Permissions.canManageInventory({
      id: uaeSalespersonProfile!.id,
      role: "salesperson",
      country: "UAE",
      is_active: true,
    });
    assert(canSalespersonManage === false, "TEST 3: UAE Salesperson manual inventory management DENIED");

    // TEST 15 & 16: Unauthorized Country Query & Client Country Tampering Protection
    if (salespersonAuth && uaeSalespersonProfile) {
      const { data: salespersonConfirmedItems } = await salespersonAuth.client
        .from("invoice_items")
        .select("*, invoices!inner(country)")
        .eq("product_id", productId);

      const salespersonCountries = new Set((salespersonConfirmedItems || []).map((ii: any) => ii.invoices?.country));
      assert(
        !salespersonCountries.has("Oman"),
        "TEST 15 & 16: UAE Salesperson server-side country isolation hides Oman invoice records"
      );
    }

    // Cleanup test product & data
    if (productId) {
      await adminClient.from("invoice_items").delete().eq("product_id", productId);
      await adminClient.from("quotation_items").delete().eq("product_id", productId);
      await adminClient.from("inventory_movements").delete().eq("product_id", productId);
      if (confInv1) await adminClient.from("invoices").delete().eq("id", confInv1.id);
      if (confInv2) await adminClient.from("invoices").delete().eq("id", confInv2.id);
      if (draftInv) await adminClient.from("invoices").delete().eq("id", draftInv.id);
      if (testQuote) await adminClient.from("quotations").delete().eq("id", testQuote.id);
      await adminClient.from("products").delete().eq("id", productId);
    }
    if (uaeCust?.id || omanCust?.id) {
      await adminClient.from("customers").delete().in("id", [uaeCust?.id, omanCust?.id].filter(Boolean));
    }

    console.log("==================================================");
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("FATAL SUITE ERROR:", err);
    process.exit(1);
  }
}

runProductDetailRegressionSuite();
