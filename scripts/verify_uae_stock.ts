import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { getAllProductsStockSummary } from "../lib/db/inventory";

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
  console.log("VERIFYING UAE INVENTORY STOCK CALCULATION");
  console.log("==================================================");

  const profile = { role: "super_admin", country: "UAE" };
  const { summaries, metrics } = await getAllProductsStockSummary(adminClient, profile);

  console.log(`Total Products: ${metrics.totalProducts}`);
  console.log(`Total Stock Units Across Catalog: ${metrics.totalStockUnits}`);
  console.log(`Low Stock Count: ${metrics.lowStockProducts}`);
  console.log(`Out of Stock Count: ${metrics.outOfStockProducts}`);

  console.log("\nFirst 10 Products Stock Summary:");
  console.table(
    summaries.slice(0, 10).map((s) => ({
      productId: s.productId,
      productName: s.productName,
      uaeStock: s.uaeStock,
      omanStock: s.omanStock,
      totalStock: s.totalStock,
      status: s.status,
    }))
  );

  const uaeZeroCount = summaries.filter((s) => s.uaeStock === 0).length;
  console.log(`Products with UAE Stock = 0: ${uaeZeroCount}`);

  if (uaeZeroCount === 0) {
    console.log("SUCCESS: All products have UAE Stock > 0 (100 units)!");
  } else {
    console.error(`WARNING: ${uaeZeroCount} products still have UAE Stock = 0`);
  }
}

main().catch(console.error);
