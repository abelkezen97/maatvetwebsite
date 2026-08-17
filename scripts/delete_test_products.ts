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
  console.log("EXECUTING CLEANUP OF TEST PRODUCTS");
  console.log("==================================================");

  // 1. Fetch test products
  const { data: allProducts, error: fetchErr } = await adminClient.from("products").select("*");
  if (fetchErr) {
    console.error("Error fetching products:", fetchErr);
    process.exit(1);
  }

  const testProducts = allProducts.filter((p) => {
    const nameLower = (p.name || "").toLowerCase();
    const skuLower = (p.sku || "").toLowerCase();
    return nameLower.includes("test") || skuLower.includes("test");
  });

  console.log(`Found ${testProducts.length} test product(s) to delete.`);

  if (testProducts.length === 0) {
    console.log("No test products found. Nothing to delete.");
    return;
  }

  const testProductIds = testProducts.map((p) => p.id);

  // 2. Delete child records referencing test products
  console.log("Cleaning up referencing child records in inventory_movements, invoice_items, quotation_items...");
  await adminClient.from("inventory_movements").delete().in("product_id", testProductIds);
  await adminClient.from("invoice_items").delete().in("product_id", testProductIds);
  await adminClient.from("quotation_items").delete().in("product_id", testProductIds);

  // 3. Delete test products
  const { data: deleted, error: deleteErr } = await adminClient
    .from("products")
    .delete()
    .in("id", testProductIds)
    .select();

  if (deleteErr) {
    console.error("Error deleting test products:", deleteErr);
    process.exit(1);
  }

  console.log(`Successfully deleted ${(deleted || []).length} test product(s).`);

  // 4. Verify remaining product count
  const { data: remainingProducts } = await adminClient.from("products").select("id");
  console.log(`Remaining real products in catalog: ${(remainingProducts || []).length}`);
  console.log("==================================================");
}

main().catch(console.error);
