import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

async function auditTargetDeletions() {
  console.log("==================================================");
  console.log("AUDITING TARGET INVOICES, QUOTATIONS & DEPENDENCIES");
  console.log("==================================================\n");

  const targetNums = ["INV-2026-000354", "INV-2026-000353", "D0352", "INV-2026-000352", "Q-2026-000352"];

  // 1. Audit Invoices for Al Majda Veterinary Pharmacy
  const { data: invoices, error: invErr } = await adminClient
    .from("invoices")
    .select("id, invoice_number, customer_id, salesman_id, status, grand_total, created_at, is_deleted")
    .eq("customer_id", "ab6b9b7c-1ba8-495f-b775-70ec6d4eb451");

  console.log("ALL Invoices for Al Majda Veterinary Pharmacy:", invoices, invErr?.message);

  const invoiceIds = (invoices || []).map((i) => i.id);

  // 2. Audit Quotations
  const { data: quotations, error: qErr } = await adminClient
    .from("quotations")
    .select("id, quotation_number, customer_id, salesman_id, status, grand_total, total_amount, created_at")
    .or(`quotation_number.in.(${targetNums.join(",")}),quotation_number.ilike.%354%,quotation_number.ilike.%353%,quotation_number.ilike.%352%,quotation_number.ilike.%D0352%`);

  console.log("Found Quotations:", quotations, qErr?.message);
  const quotationIds = (quotations || []).map((q) => q.id);

  // 3. Audit Receipts linked to Customer or Invoices
  const { data: allReceipts } = await adminClient
    .from("receipts")
    .select("id, receipt_number, invoice_id, customer_id, amount_paid, payment_method, payment_date, reference_no, reference_number, notes")
    .eq("customer_id", "ab6b9b7c-1ba8-495f-b775-70ec6d4eb451");

  console.log("Found Customer Receipts:", allReceipts);

  // 4. Audit Cash Handovers or Ledger items for Dr. Kaleemullah
  const { data: handovers } = await adminClient
    .from("cash_handovers")
    .select("id, handover_number, salesperson_id, amount, handover_date, handover_type")
    .eq("salesperson_id", "59ce7b2c-156f-4b91-9ee9-a55c05aa160f");

  console.log("Found Cash Handovers for Dr. Kaleemullah:", handovers);

  // 4. Audit Inventory Transactions linked to Invoices
  let invTx: any[] = [];
  if (invoiceIds.length > 0) {
    const { data: txData } = await adminClient
      .from("inventory_transactions")
      .select("id, product_id, country, transaction_type, quantity, reference_type, reference_id, remarks")
      .in("reference_id", invoiceIds);
    invTx = txData || [];
  }
  console.log("Found Inventory Transactions:", invTx);

  // 5. Audit Invoice Items
  let invoiceItems: any[] = [];
  if (invoiceIds.length > 0) {
    const { data: itemData } = await adminClient
      .from("invoice_items")
      .select("id, invoice_id, product_id, quantity, unit_price, total_price, line_total")
      .in("invoice_id", invoiceIds);
    invoiceItems = itemData || [];
  }
  console.log("Found Invoice Items count:", invoiceItems.length);

  // 6. Audit Quotation Items
  let quotationItems: any[] = [];
  if (quotationIds.length > 0) {
    const { data: qItemData } = await adminClient
      .from("quotation_items")
      .select("id, quotation_id, product_id, quantity, unit_price, total_price")
      .in("quotation_id", quotationIds);
    quotationItems = qItemData || [];
  }
  console.log("Found Quotation Items count:", quotationItems.length);

  // 7. Audit Customer Details
  const customerIds = Array.from(new Set([
    ...(invoices || []).map((i: any) => i.customer_id),
    ...(quotations || []).map((q: any) => q.customer_id),
    ...(allReceipts || []).map((r: any) => r.customer_id),
  ])).filter(Boolean);

  if (customerIds.length > 0) {
    const { data: customerRows } = await adminClient
      .from("customers")
      .select("id, company_name, doctor_name, pending_balance, country")
      .in("id", customerIds);
    console.log("Associated Customers:", customerRows);
  }
}

auditTargetDeletions().catch(console.error);
