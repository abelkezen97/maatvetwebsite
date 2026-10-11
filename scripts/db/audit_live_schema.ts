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
  console.log("=== AUDITING LIVE DATABASE SCHEMAS ===");

  const tables = ["products", "invoice_items", "invoices", "inventory_movements"];

  for (const table of tables) {
    console.log(`\n--- TABLE: public.${table} ---`);
    const { data: row, error } = await adminClient.from(table).select("*").limit(1);
    if (error) {
      console.log(`Error inspecting ${table}: ${error.code} - ${error.message}`);
    } else if (row && row.length > 0) {
      console.log("Columns present:", Object.keys(row[0]).sort());
      console.log("Sample Row:", JSON.stringify(row[0], null, 2));
    } else {
      // Row is empty, let's select limit 0 or query via RPC if available
      console.log(`Table exists but has 0 rows. Fetching columns via select('*').limit(0)...`);
      const { data: emptyData, error: emptyErr } = await adminClient.from(table).select("*").limit(0);
      if (emptyErr) {
        console.log(`Empty select error:`, emptyErr.message);
      }
    }
  }

  // Also let's inspect columns for products table specifically by testing individual column selects
  console.log("\n--- TESTING PRODUCTS COLUMNS ---");
  const testCols = [
    "id", "name", "sku", "product_code", "code", "barcode", "selling_price", "price", "cost_price",
    "unit", "pack_size", "category_id", "category", "category_name", "brand", "manufacturer",
    "description", "is_active", "is_available", "created_at", "updated_at"
  ];

  for (const col of testCols) {
    const { error } = await adminClient.from("products").select(col).limit(1);
    if (error) {
      console.log(`Column 'products.${col}': ABSENT (${error.message})`);
    } else {
      console.log(`Column 'products.${col}': PRESENT`);
    }
  }
}

main().catch(console.error);
