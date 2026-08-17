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
  console.log("AUDITING INVOICES FOR DELETION");
  console.log("==================================================");

  const { data: allInvoices, error } = await adminClient
    .from("invoices")
    .select("id, invoice_number, customer_id, salesman_id, grand_total, status, country, is_deleted, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching invoices:", error);
    process.exit(1);
  }

  console.log(`Total Invoices in Database: ${(allInvoices || []).length}`);
  console.table(allInvoices);
}

main().catch(console.error);
