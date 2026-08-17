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
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("==================================================");
  console.log("EXECUTING CLEANUP OF TEST INVOICES");
  console.log("==================================================");

  // 1. Fetch all invoices
  const { data: allInvoices, error: fetchErr } = await adminClient.from("invoices").select("*");
  if (fetchErr) {
    console.error("Error fetching invoices:", fetchErr);
    process.exit(1);
  }

  // Filter test invoices matching test invoice prefixes or timestamps
  const testInvoices = allInvoices.filter((inv) => {
    const num = (inv.invoice_number || "").toUpperCase();
    return (
      num.startsWith("INV-CONF-") ||
      num.startsWith("INV-CANCEL-") ||
      num.startsWith("INV-DRAFT-") ||
      num.startsWith("INV-EDIT-") ||
      num.startsWith("INV-TEST-")
    );
  });

  console.log(`Found ${testInvoices.length} test invoice(s) out of ${(allInvoices || []).length} total invoices.`);
  console.table(
    testInvoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      grand_total: inv.grand_total,
      created_at: inv.created_at,
    }))
  );

  if (testInvoices.length === 0) {
    console.log("No test invoices found. Nothing to delete.");
    return;
  }

  const testInvoiceIds = testInvoices.map((inv) => inv.id);

  // 2. Delete child records (invoice_items, receipts, inventory_movements referencing reference_id)
  console.log("Cleaning up invoice items, receipts, and inventory movements for test invoices...");
  await adminClient.from("invoice_items").delete().in("invoice_id", testInvoiceIds);
  await adminClient.from("receipts").delete().in("invoice_id", testInvoiceIds);
  await adminClient.from("inventory_movements").delete().in("reference_id", testInvoiceIds);

  // Also clean up any orphaned test customer records created alongside test invoices
  const { data: testCustomers } = await adminClient
    .from("customers")
    .select("id, customer_code")
    .or("customer_code.ilike.CUST-UAE-%,customer_code.ilike.CUST-OMAN-%,customer_code.ilike.CUST-TEST-%");

  const testCustomerIds = (testCustomers || []).map((c) => c.id);
  if (testCustomerIds.length > 0) {
    await adminClient.from("customers").delete().in("id", testCustomerIds);
    console.log(`Cleaned up ${testCustomerIds.length} test customer record(s).`);
  }

  // 3. Delete test invoices
  const { data: deletedInvoices, error: deleteErr } = await adminClient
    .from("invoices")
    .delete()
    .in("id", testInvoiceIds)
    .select();

  if (deleteErr) {
    console.error("Error deleting test invoices:", deleteErr);
    process.exit(1);
  }

  console.log(`Successfully deleted ${(deletedInvoices || []).length} test invoice(s).`);

  // 4. Verify remaining production invoices
  const { data: remainingInvoices } = await adminClient.from("invoices").select("id, invoice_number, grand_total, created_at");
  console.log(`Remaining production invoices in system: ${(remainingInvoices || []).length}`);
  console.table(remainingInvoices);
  console.log("==================================================");
}

main().catch(console.error);
