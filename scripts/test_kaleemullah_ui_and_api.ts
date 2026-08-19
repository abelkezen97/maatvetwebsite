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

async function main() {
  console.log("==================================================");
  console.log("TESTING DR. KALEEMULLAH API & PREVIEW NUMBERING");
  console.log("==================================================\n");

  const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";

  // 1. Test Server Generator for Dr. Kaleemullah
  const kaleemNext = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "D", 4);
  console.log("Server generated next invoice number for Dr. Kaleemullah:", kaleemNext);

  if (kaleemNext !== "D0353") {
    console.error(`FAILED: Expected D0353, got ${kaleemNext}`);
    process.exit(1);
  }
  console.log("✓ [PASS] Dr. Kaleemullah next invoice reference is D0353");

  // 2. Test Server Generator for Standard Salesperson
  const otherNext = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "INV", 6);
  console.log("Server generated next invoice number for standard salesperson:", otherNext);

  if (!otherNext.startsWith("INV-2026-")) {
    console.error(`FAILED: Expected INV-2026-XXXXXX, got ${otherNext}`);
    process.exit(1);
  }
  console.log("✓ [PASS] Standard salesperson invoice reference uses INV-2026-XXXXXX and is unaffected");

  // 3. Create Test Product & Invoices to verify increment (D0353 -> D0354)
  const { data: catRow } = await adminClient.from("product_categories").select("id").limit(1).single();
  const prodName = `Test Product ${Date.now()}`;
  const { data: product } = await adminClient
    .from("products")
    .insert([{
      name: prodName,
      sku: `SKU-TEST-${Date.now()}`,
      category_id: catRow?.id,
      pack_size: "1",
      unit: "Item",
      selling_price: 150,
      is_active: true
    }])
    .select()
    .single();

  const { data: customer } = await adminClient.from("customers").select("id").limit(1).single();
  const createdInvIds: string[] = [];

  try {
    // Create 1st Invoice (D0353)
    const num1 = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "D", 4);
    const { data: inv1 } = await adminClient
      .from("invoices")
      .insert([{
        invoice_number: num1,
        customer_id: customer?.id,
        salesman_id: KALEEM_ID,
        country: "UAE",
        status: "Paid",
        subtotal: 300,
        vat_total: 0,
        discount_total: 0,
        grand_total: 300
      }])
      .select()
      .single();

    createdInvIds.push(inv1.id);
    console.log(`✓ [PASS] Created 1st invoice in DB: ${inv1.invoice_number}`);
    if (inv1.invoice_number !== "D0353") {
      console.error(`FAILED: Expected D0353, got ${inv1.invoice_number}`);
      process.exit(1);
    }

    // Create 2nd Invoice (D0354)
    const num2 = await generateNextDocumentNumber(adminClient, "invoices", "invoice_number", "D", 4);
    const { data: inv2 } = await adminClient
      .from("invoices")
      .insert([{
        invoice_number: num2,
        customer_id: customer?.id,
        salesman_id: KALEEM_ID,
        country: "UAE",
        status: "Paid",
        subtotal: 300,
        vat_total: 0,
        discount_total: 0,
        grand_total: 300
      }])
      .select()
      .single();

    createdInvIds.push(inv2.id);
    console.log(`✓ [PASS] Created 2nd invoice in DB: ${inv2.invoice_number}`);
    if (inv2.invoice_number !== "D0354") {
      console.error(`FAILED: Expected D0354, got ${inv2.invoice_number}`);
      process.exit(1);
    }

  } finally {
    // Cleanup
    if (createdInvIds.length > 0) {
      await adminClient.from("invoices").delete().in("id", createdInvIds);
    }
    if (product?.id) {
      await adminClient.from("products").delete().eq("id", product.id);
    }
    console.log("✓ Cleaned up test invoice data.");
  }

  console.log("\n==================================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

main().catch(console.error);
