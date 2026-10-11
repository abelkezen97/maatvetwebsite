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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("=== LISTING ALL CUSTOM DB FUNCTIONS / RPCS ===");

  // Query profiles or other tables to see if functions are callable
  const testRPCs = [
    "admin_create_user",
    "get_auth_profile",
    "get_user_role",
    "get_user_country",
    "is_super_admin",
    "exec",
    "exec_sql",
    "sql",
    "query"
  ];

  for (const name of testRPCs) {
    const { data, error } = await supabase.rpc(name as any, {});
    console.log(`RPC '${name}':`, error ? `${error.code} - ${error.message}` : "EXISTS");
  }
}

main().catch(console.error);
