import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envFile = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const envVars: Record<string, string> = {};
envFile.split("\n").forEach((line) => {
  const [k, v] = line.split("=");
  if (k && v) envVars[k.trim()] = v.trim();
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function runAudit() {
  console.log("=== PHASE 1 & 2: AUTH & CUSTOMER RECORD AUDIT ===");

  // 1. Dr. Kaleemullah profile & auth user
  const { data: profiles, error: pErr } = await adminClient
    .from("profiles")
    .select("*")
    .ilike("full_name", "%Kaleem%");
  
  console.log("Profiles matching 'Kaleem':\n", JSON.stringify(profiles, null, 2), pErr);

  const { data: usersData, error: uErr } = await adminClient.auth.admin.listUsers();
  const kaleemUser = usersData?.users?.find(u => u.email?.includes("kaleem"));
  console.log("Auth user matching 'kaleem':\n", kaleemUser ? {
    id: kaleemUser.id,
    email: kaleemUser.email,
    user_metadata: kaleemUser.user_metadata,
    app_metadata: kaleemUser.app_metadata
  } : "NOT FOUND", uErr);

  // 2. Customers
  const { data: customers, error: cErr } = await adminClient
    .from("customers")
    .select("*");
  
  console.log("All Customers count:", customers?.length, cErr);
  const fidaCust = customers?.find(c => c.company_name?.includes("Fida") || c.doctor_name?.includes("Fida"));
  console.log("Customer Fida:\n", JSON.stringify(fidaCust, null, 2));

  // 3. Inspect Live RLS Policies via postgres RPC or sql query if possible
  console.log("\n=== PHASE 3: RLS POLICY AUDIT ===");

  // 4. Test RLS Session Query for Kaleem
  if (kaleemUser && customers && customers.length > 0) {
    console.log("\n=== PHASE 4: REPRODUCING RLS CUSTOMER LOOKUP FOR DR. KALEEM ===");
    const customer = fidaCust || customers[0];
    console.log("Selected Customer ID:", customer.id);
    console.log("Customer Record Details:", {
      id: customer.id,
      customer_code: customer.customer_code,
      company_name: customer.company_name,
      doctor_name: customer.doctor_name,
      country: customer.country,
      assigned_salesman_id: customer.assigned_salesman_id,
      created_by: customer.created_by,
      updated_by: customer.updated_by,
      is_active: customer.is_active
    });

    const kaleemProfile = profiles?.find(p => p.id === kaleemUser.id) || profiles?.[0];
    console.log("Kaleem Profile Details:", kaleemProfile);

    console.log("\n--- MATCH CHECKS ---");
    console.log("customer.assigned_salesman_id === kaleemProfile.id:", customer.assigned_salesman_id === kaleemProfile?.id);
    console.log("customer.country === kaleemProfile.country:", customer.country === kaleemProfile?.country);
  }
}

runAudit().catch(console.error);
