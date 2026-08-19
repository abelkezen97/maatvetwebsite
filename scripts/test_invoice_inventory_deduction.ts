import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
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
  console.log("TEST: LIVE UAE INVOICE CREATION & INVENTORY DEDUCTION");
  console.log("==================================================\n");

  // 1. Setup Category & Test Product
  const { data: catRow } = await adminClient.from("product_categories").select("id").limit(1).single();
  const categoryId = catRow?.id;

  const prodName = `UAE Test Product ${Date.now()}`;
  const { data: product, error: prodErr } = await adminClient
    .from("products")
    .insert([{
      name: prodName,
      sku: `SKU-INV-${Date.now()}`,
      category_id: categoryId,
      pack_size: "1",
      unit: "Item",
      selling_price: 150,
      is_active: true
    }])
    .select()
    .single();

  if (prodErr || !product) {
    console.error("Failed to create product:", prodErr);
    process.exit(1);
  }

  const productId = product.id;
  console.log(`✓ Created test product: ${prodName} (ID: ${productId})`);

  try {
    // 2. Add Opening Stock for UAE = 50
    const { error: opErr } = await adminClient.from("inventory_transactions").insert([{
      product_id: productId,
      country: "UAE",
      transaction_type: "Opening Stock",
      quantity: 50,
      remarks: "Initial opening stock for UAE test"
    }]);

    if (opErr) {
      console.error("Failed to add opening stock:", opErr);
      process.exit(1);
    }

    const initialStock = await getProductStock(adminClient, productId, "UAE");
    console.log(`✓ Added initial UAE stock: ${initialStock} units.`);

    // 3. Fetch Existing Customer
    let { data: customer } = await adminClient.from("customers").select("id").limit(1).single();
    let customerId = customer?.id;
    if (!customerId) {
      const { data: newCust } = await adminClient.from("customers").insert([{ company_name: "UAE Test Clinic", country: "UAE" }]).select().single();
      customerId = newCust?.id;
    }
    console.log(`✓ Using test customer ID: ${customerId}`);

    const { data: profileRow } = await adminClient.from("profiles").select("id").limit(1).single();
    const salesmanId = profileRow?.id;

    const invoiceNum = `INV-UAE-TEST-${Date.now()}`;
    const { data: invoice, error: invErr } = await adminClient
      .from("invoices")
      .insert([{
        invoice_number: invoiceNum,
        customer_id: customerId,
        salesman_id: salesmanId,
        country: "UAE",
        status: "Paid",
        subtotal: 750,
        vat_total: 0,
        discount_total: 0,
        grand_total: 750,
      }])
      .select()
      .single();

    if (invErr || !invoice) {
      console.error("Failed to create invoice:", invErr);
      process.exit(1);
    }
    console.log(`✓ Successfully created UAE Invoice ${invoiceNum} (ID: ${invoice.id})`);

    // 5. Deduct Inventory via validateAndProcessInvoiceInventory
    await validateAndProcessInvoiceInventory(
      adminClient,
      [{ productId, quantity: 5, productName: prodName }],
      "UAE",
      invoice.id,
      invoiceNum,
      salesmanId
    );
    console.log(`✓ Invoked validateAndProcessInvoiceInventory (Deducted 5 units)`);

    // 6. Verify Created Inventory Transaction in DB
    const { data: txRows, error: txFetchErr } = await adminClient
      .from("inventory_transactions")
      .select("*")
      .eq("reference_id", invoice.id);

    if (txFetchErr || !txRows || txRows.length === 0) {
      console.error("✗ Failed to retrieve inventory transaction for invoice:", txFetchErr);
      process.exit(1);
    }

    const tx = txRows[0];
    console.log("\n--- VERIFIED INVENTORY TRANSACTION ROW ---");
    console.log(`  ID: ${tx.id}`);
    console.log(`  Product ID: ${tx.product_id}`);
    console.log(`  Country: ${tx.country}`);
    console.log(`  Transaction Type: ${tx.transaction_type}`);
    console.log(`  Quantity: ${tx.quantity}`);
    console.log(`  Reference Type: ${tx.reference_type}`);
    console.log(`  Reference ID: ${tx.reference_id}`);
    console.log(`  Remarks: ${tx.remarks}`);
    console.log("------------------------------------------\n");

    if (
      tx.country === "UAE" &&
      tx.transaction_type === "Sale" &&
      Number(tx.quantity) === -5 &&
      tx.reference_id === invoice.id
    ) {
      console.log("✓ SUCCESS! Transaction matches all constraints (Country: UAE, Type: Sale, Quantity: -5).");
    } else {
      console.error("✗ Transaction validation failed!");
      process.exit(1);
    }

    // 7. Verify New Total Stock
    const finalStock = await getProductStock(adminClient, productId, "UAE");
    console.log(`✓ Final calculated UAE stock: ${finalStock} units (50 - 5 = 45).`);
    if (finalStock === 45) {
      console.log("✓ Stock calculation verified accurately!");
    } else {
      console.error(`✗ Stock mismatch! Expected 45, got ${finalStock}`);
      process.exit(1);
    }

    // Cleanup
    await adminClient.from("inventory_transactions").delete().eq("product_id", productId);
    await adminClient.from("invoices").delete().eq("id", invoice.id);
    await adminClient.from("products").delete().eq("id", productId);
    console.log("\n✓ Cleaned up test records.");

  } catch (err: any) {
    console.error("✗ Error in invoice inventory deduction test:", err);
    process.exit(1);
  }
}

main();
