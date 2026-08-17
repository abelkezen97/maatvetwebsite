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
  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const custCode1 = `CUST-DIAG1-${Date.now().toString().slice(-4)}`;
  console.log("Attempting Customer Insert WITHOUT select()...");
  const insertNoSelect = await authClient.from("customers").insert([{
    customer_code: custCode1,
    company_name: "Diag Farm NoSelect",
    doctor_name: "Dr. Diag",
    email: "diag1@maatvet.com",
    phone: "+971500001122",
    country: "UAE",
    assigned_salesman_id: "59ce7b2c-156f-4b91-9ee9-a55c05aa160f",
    created_by: "59ce7b2c-156f-4b91-9ee9-a55c05aa160f",
    pending_balance: 0,
  }]);

  console.log("Insert without select result:", insertNoSelect.error ? insertNoSelect.error : "SUCCESS!");

  if (!insertNoSelect.error) {
    await adminClient.from("customers").delete().eq("customer_code", custCode1);
  }

  const custCode2 = `CUST-DIAG2-${Date.now().toString().slice(-4)}`;
  console.log("\nAttempting Customer Insert WITH select()...");
  const insertWithSelect = await authClient.from("customers").insert([{
    customer_code: custCode2,
    company_name: "Diag Farm WithSelect",
    doctor_name: "Dr. Diag",
    email: "diag2@maatvet.com",
    phone: "+971500001122",
    country: "UAE",
    assigned_salesman_id: "59ce7b2c-156f-4b91-9ee9-a55c05aa160f",
    created_by: "59ce7b2c-156f-4b91-9ee9-a55c05aa160f",
    pending_balance: 0,
  }]).select("*");

  console.log("Insert with select result:", insertWithSelect.error ? insertWithSelect.error : "SUCCESS!", insertWithSelect.data);

  if (!insertWithSelect.error && insertWithSelect.data?.[0]?.id) {
    await adminClient.from("customers").delete().eq("id", insertWithSelect.data[0].id);
  }
}

main().catch(console.error);
