import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { recalculateCustomerBalance } from "../lib/db/balances";

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
  console.log("EXECUTING TARGET INVOICES DELETION");
  console.log("==================================================\n");

  const targetInvoiceIds = [
    "791cb4f0-6447-4444-ada3-238b24c8acb6", // INV-2026-000354
    "284b899f-4820-4604-89bd-4af1696fad00", // INV-2026-000353
    "37061f0f-99ee-4c96-99a1-cc9af032f5bf", // D0352
  ];

  const customerId = "ab6b9b7c-1ba8-495f-b775-70ec6d4eb451"; // Al Majda Veterinary Pharmacy

  // 1. Delete Invoice Items
  const { error: itemErr } = await adminClient
    .from("invoice_items")
    .delete()
    .in("invoice_id", targetInvoiceIds);

  if (itemErr) {
    console.error("Error deleting invoice items:", itemErr);
  } else {
    console.log("✓ Deleted associated invoice_items (if any).");
  }

  // 2. Delete Receipts
  const { error: rcptErr } = await adminClient
    .from("receipts")
    .delete()
    .in("invoice_id", targetInvoiceIds);

  if (rcptErr) {
    console.error("Error deleting receipts:", rcptErr);
  } else {
    console.log("✓ Deleted associated receipts (if any).");
  }

  // 3. Delete Inventory Transactions
  const { error: txErr } = await adminClient
    .from("inventory_transactions")
    .delete()
    .in("reference_id", targetInvoiceIds);

  if (txErr) {
    console.error("Error deleting inventory transactions:", txErr);
  } else {
    console.log("✓ Deleted associated inventory_transactions (if any).");
  }

  // 4. Delete Invoices
  const { data: deletedInvoices, error: invErr } = await adminClient
    .from("invoices")
    .delete()
    .in("id", targetInvoiceIds)
    .select();

  if (invErr) {
    console.error("Error deleting invoices:", invErr);
    process.exit(1);
  } else {
    console.log(`✓ Deleted ${deletedInvoices?.length || 0} invoice records from public.invoices:`);
    (deletedInvoices || []).forEach((inv) => {
      console.log(`   - ID: ${inv.id} | Number: ${inv.invoice_number} | Amount: AED ${inv.grand_total}`);
    });
  }

  // 5. Recalculate Customer Balance
  console.log(`\nRecalculating balance for customer ${customerId} (Al Majda Veterinary Pharmacy)...`);
  const newBalance = await recalculateCustomerBalance(adminClient, customerId);
  console.log(`✓ Recalculated customer pending balance: AED ${newBalance.pendingBalance}`);

  console.log("\n==================================================");
  console.log("DELETION EXECUTED AND VERIFIED SUCCESSFULLY!");
  console.log("==================================================");
}

main().catch(console.error);
