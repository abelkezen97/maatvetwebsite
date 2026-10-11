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
  console.log("AUDITING TEST PRODUCTS FOR DELETION");
  console.log("==================================================");

  // Fetch all products
  const { data: allProducts, error } = await adminClient.from("products").select("*");
  if (error) {
    console.error("Error fetching products:", error);
    process.exit(1);
  }

  console.log(`Total products in database: ${allProducts.length}`);

  const testProducts = allProducts.filter((p) => {
    const nameLower = (p.name || "").toLowerCase();
    const skuLower = (p.sku || "").toLowerCase();
    return (
      nameLower.includes("test") ||
      skuLower.includes("test") ||
      nameLower.includes("biolax") ||
      skuLower.includes("biolax")
    );
  });

  console.log(`Test products found matching criteria ('test', 'biolax'): ${testProducts.length}`);
  console.table(
    testProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      selling_price: p.selling_price,
      created_at: p.created_at,
    }))
  );
}

main().catch(console.error);
