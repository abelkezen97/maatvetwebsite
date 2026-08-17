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
  console.log("=== SEARCHING FOR ALL EXPOSED ROUTINES / RPCS ===");

  // Let's test calling pg_proc or rpcs
  const candidateNames = [
    "exec_sql", "execute_sql", "run_sql", "sql", "exec", "query", "admin_execute_sql", "execute_migration"
  ];

  for (const name of candidateNames) {
    const { data, error } = await adminClient.rpc(name as any, { sql: "SELECT 1" });
    if (!error) {
      console.log(`FOUND EXECUTABLE SQL RPC: '${name}'`);
    } else {
      console.log(`RPC '${name}': ${error.code} - ${error.message}`);
    }
  }
}

main().catch(console.error);
