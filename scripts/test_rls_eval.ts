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
  console.log("=== TESTING RLS EVALUATION & CUSTOMER CREATION AS DR. KALEEMULLAH ===");

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

  // Try creating a test customer directly as Dr. Kaleemullah via authenticatedClient
  const testCode = `CUST-TEST-${Date.now().toString().slice(-4)}`;
  console.log(`\nAttempting to INSERT customer ${testCode} as Dr. Kaleemullah...`);
  const insertRes = await authenticatedClient
    .from("customers")
    .insert([{
      customer_code: testCode,
      company_name: "Kaleem Direct Test Farm",
      doctor_name: "Dr. Direct Test",
      email: "directtest@maatvet.com",
      phone: "+971509998877",
      country: "UAE",
      assigned_salesman_id: "59ce7b2c-156f-4b91-9ee9-a55c05aa160f",
      created_by: "59ce7b2c-156f-4b91-9ee9-a55c05aa160f",
      pending_balance: 0,
    }])
    .select("*");

  console.log("Insert result:", insertRes.data, insertRes.error);

  if (insertRes.data && insertRes.data.length > 0) {
    // Cleanup
    await adminClient.from("customers").delete().eq("id", insertRes.data[0].id);
  }
}

main().catch(console.error);
