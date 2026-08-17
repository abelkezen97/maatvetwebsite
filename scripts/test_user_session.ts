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
  console.log("=== GENERATING MAGIC LINK FOR KALEEM TO GET USER SESSION ===");
  const linkRes = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "kaleem@maatvet.com",
  });

  if (linkRes.error) {
    console.error("Magic link error:", linkRes.error);
    return;
  }

  const token_hash = linkRes.data.properties?.hashed_token;
  console.log("Token hash generated:", token_hash ? "YES" : "NO");

  // Verify OTP to get real user session
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (token_hash) {
    const sessionRes = await userClient.auth.verifyOtp({
      token_hash: token_hash,
      type: "magiclink"
    });

    if (sessionRes.error) {
      console.error("Verify OTP error:", sessionRes.error);
      return;
    }

    console.log("Authenticated User Session obtained successfully for:", sessionRes.data.user?.email);
    console.log("Session User UID:", sessionRes.data.user?.id);
    const accessToken = sessionRes.data.session?.access_token;

    // Create client with this exact user session access token
    const authenticatedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log("\n=== TESTING QUERIES AS DR. KALEEMULLAH (AUTHENTICATED SESSION) ===");

    // 1. Check get_auth_profile, get_user_role, get_user_country
    const { data: profileData, error: profileErr } = await authenticatedClient.rpc("get_auth_profile");
    console.log("get_auth_profile() result:", profileData, profileErr);

    const { data: roleData, error: roleErr } = await authenticatedClient.rpc("get_user_role");
    console.log("get_user_role() result:", roleData, roleErr);

    const { data: countryData, error: countryErr } = await authenticatedClient.rpc("get_user_country");
    console.log("get_user_country() result:", countryData, countryErr);

    // 2. Query customers as Dr. Kaleemullah
    console.log("\nQuerying public.customers with authenticatedClient.from('customers').select('*')...");
    const { data: userCustData, error: userCustErr } = await authenticatedClient
      .from("customers")
      .select("*");
    
    console.log("Customers returned for Dr. Kaleemullah:", userCustData?.length, userCustErr);
    if (userCustData) {
      console.log("Customers list:", JSON.stringify(userCustData, null, 2));
    }

    // 3. Query specific customer Fida by ID
    const fidaId = "41d40997-b999-4524-8f84-dd5293293376";
    console.log(`\nQuerying public.customers for Fida (ID: ${fidaId}) as Dr. Kaleemullah...`);
    const { data: fidaData, error: fidaErr } = await authenticatedClient
      .from("customers")
      .select("id, country, assigned_salesman_id")
      .eq("id", fidaId)
      .maybeSingle();

    console.log("Fida lookup result for Dr. Kaleemullah:", fidaData, fidaErr);
  }
}

main().catch(console.error);
