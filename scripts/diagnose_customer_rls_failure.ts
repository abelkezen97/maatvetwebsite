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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== DIAGNOSING CUSTOMER RLS FAILURE ===");

  // 1. Get token for Dr. Kaleem
  const linkRes = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "kaleem@maatvet.com",
  });

  const token_hash = linkRes.data.properties?.hashed_token;
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const sessionRes = await userClient.auth.verifyOtp({
    token_hash: token_hash!,
    type: "magiclink"
  });

  const accessToken = sessionRes.data.session?.access_token;
  const authenticatedClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log("Testing various queries on `customers` table as Dr. Kaleemullah:");

  // Test 1: SELECT count(*)
  const res1 = await authenticatedClient.from("customers").select("*", { count: "exact", head: true });
  console.log("Test 1 (count):", res1.count, res1.error);

  // Test 2: SELECT id
  const res2 = await authenticatedClient.from("customers").select("id");
  console.log("Test 2 (select id):", res2.data, res2.error);

  // Test 3: SELECT with explicit assigned_salesman_id filter
  const res3 = await authenticatedClient
    .from("customers")
    .select("id, company_name")
    .eq("assigned_salesman_id", "59ce7b2c-156f-4b91-9ee9-a55c05aa160f");
  console.log("Test 3 (eq assigned_salesman_id):", res3.data, res3.error);

  // Test 4: Check if there's any customer created_by Dr. Kaleem vs assigned_salesman_id Dr. Kaleem
  const { data: allCusts } = await adminClient.from("customers").select("*");
  console.log("\nAll Customers in Database (Admin View):");
  allCusts?.forEach(c => {
    console.log(`Customer ID: ${c.id}`);
    console.log(`  Company: ${c.company_name}`);
    console.log(`  Country: ${c.country}`);
    console.log(`  Assigned Salesman ID: ${c.assigned_salesman_id}`);
    console.log(`  Created By: ${c.created_by}`);
    console.log(`  Is Active: ${c.is_active}`);
  });
}

main().catch(console.error);
