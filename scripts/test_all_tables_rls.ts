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
  console.log("=== COMPREHENSIVE RLS ACCESS AUDIT FOR DR. KALEEMULLAH ===");

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

  const tables = [
    "profiles",
    "customers",
    "products",
    "quotations",
    "quotation_items",
    "invoices",
    "invoice_items",
    "receipts",
    "expenses"
  ];

  for (const table of tables) {
    const { data, error } = await authenticatedClient.from(table).select("*");
    console.log(`Table '${table}':`, error ? `ERROR: ${error.message}` : `SUCCESS (${data?.length || 0} rows)`);
    if (data && data.length > 0 && table === "customers") {
      console.log("  Customers returned:", data.map(c => c.company_name));
    }
  }
}

main().catch(console.error);
