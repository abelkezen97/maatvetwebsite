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

async function reloadSchemaCache() {
  console.log("Granting permissions and notifying PostgREST schema cache reload...");
  const { error: grantErr } = await adminClient.rpc("get_user_country"); // dummy call to verify connection
  
  // Grant table access explicitly to authenticated, anon, service_role, postgres
  const res = await adminClient.rpc("exec_sql" as any, {
    sql_query: `
      GRANT ALL ON public.inventory_movements TO authenticated, anon, service_role, postgres;
      NOTIFY pgrst, 'reload schema';
    `
  });

  if (res.error) {
    console.log("exec_sql result:", res.error.message);
  } else {
    console.log("Schema cache reloaded successfully!");
  }
}

reloadSchemaCache();
