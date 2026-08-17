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
  console.log("UPDATING ALL MEDICINE PRODUCT QUANTITIES TO 100");
  console.log("==================================================");

  // 1. Fetch all active products
  const { data: products, error: prodErr } = await adminClient
    .from("products")
    .select("id, name, sku, stock_quantity")
    .order("name", { ascending: true });

  if (prodErr) {
    console.error("Error fetching products:", prodErr);
    process.exit(1);
  }

  console.log(`Found ${(products || []).length} products in database.`);

  if (!products || products.length === 0) {
    console.log("No products found.");
    return;
  }

  const productIds = products.map((p) => p.id);

  // 2. Update products.stock_quantity = 100 for all products
  console.log("Updating products.stock_quantity = 100...");
  const { error: updateErr } = await adminClient
    .from("products")
    .update({ stock_quantity: 100, updated_at: new Date().toISOString() })
    .in("id", productIds);

  if (updateErr) {
    console.error("Error updating products stock_quantity:", updateErr);
    process.exit(1);
  }

  // 3. Update inventory_movements ledger if available
  console.log("Updating inventory_movements ledger to 100 units per product...");
  try {
    await adminClient.from("inventory_movements").delete().in("product_id", productIds);

    const adminProfile = await adminClient.from("profiles").select("id").eq("role", "super_admin").limit(1).single();
    const adminId = adminProfile.data?.id || null;

    const movementPayloads = productIds.map((pid) => ({
      product_id: pid,
      country: "UAE",
      movement_type: "OPENING_STOCK",
      quantity: 100,
      reference_type: "MANUAL_OPENING",
      reason: "Stock balance set to 100 units",
      created_by: adminId,
      created_at: new Date().toISOString(),
    }));

    const { error: movErr } = await adminClient.from("inventory_movements").insert(movementPayloads);
    if (movErr) {
      console.log("inventory_movements ledger note:", movErr.message);
    }
  } catch (err: any) {
    console.log("inventory_movements ledger catch:", err?.message || err);
  }

  console.log(`Successfully updated ${(products || []).length} medicine products to 100 stock units!`);

  // 4. Verify updated products
  const { data: updatedProducts } = await adminClient
    .from("products")
    .select("id, name, stock_quantity")
    .order("name", { ascending: true })
    .limit(20);

  console.log("\nSample of updated products:");
  console.table(updatedProducts);

  console.log("==================================================");
  console.log("ALL MEDICINE QUANTITIES UPDATED TO 100 SUCCESSFULLY");
  console.log("==================================================");
}

main().catch(console.error);
