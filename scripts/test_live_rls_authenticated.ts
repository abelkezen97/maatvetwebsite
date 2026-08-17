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

async function main() {
  console.log("=== TABLE COLUMNS & DATA STRUCTURE AUDIT ===");

  const tables = [
    "customers",
    "quotations",
    "quotation_items",
    "invoices",
    "invoice_items",
    "receipts",
    "expenses",
    "cash_handovers",
    "salesperson_opening_balances",
    "products",
    "profiles"
  ];

  for (const tbl of tables) {
    const { data, error } = await adminClient.from(tbl).select("*").limit(1);
    if (error) {
      console.log(`Table '${tbl}': ERROR - ${error.message}`);
    } else {
      const sample = data?.[0] || {};
      console.log(`Table '${tbl}' Columns:`, Object.keys(sample));
    }
  }
}

main().catch(console.error);
