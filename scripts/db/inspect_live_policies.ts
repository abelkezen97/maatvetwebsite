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
  console.log("=== INSPECTING LIVE RLS POLICIES AND SCHEMA IN SUPABASE ===");

  // Let's test if we can get pg_policies via REST if exposed or via RPC
  // First, check all policies in live DB by querying pg_policies via RPC if any, or testing functions
  const { data: customerRow } = await adminClient
    .from("customers")
    .select("*")
    .eq("id", "41d40997-b999-4524-8f84-dd5293293376")
    .single();

  console.log("Live Customer Row Fida:", {
    id: customerRow.id,
    country: customerRow.country,
    country_type: typeof customerRow.country,
    assigned_salesman_id: customerRow.assigned_salesman_id,
    assigned_salesman_id_type: typeof customerRow.assigned_salesman_id,
    is_active: customerRow.is_active
  });

  const { data: profileRow } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", "59ce7b2c-156f-4b91-9ee9-a55c05aa160f")
    .single();

  console.log("Live Profile Row Kaleem:", {
    id: profileRow.id,
    role: profileRow.role,
    country: profileRow.country,
    is_active: profileRow.is_active
  });

  console.log("Strict equality check:");
  console.log("customerRow.country === profileRow.country:", customerRow.country === profileRow.country);
  console.log("customerRow.assigned_salesman_id === profileRow.id:", customerRow.assigned_salesman_id === profileRow.id);
  console.log("Types:", {
    cust_country_len: customerRow.country.length,
    prof_country_len: profileRow.country.length,
    cust_salesman_len: customerRow.assigned_salesman_id.length,
    prof_id_len: profileRow.id.length
  });
}

main().catch(console.error);
