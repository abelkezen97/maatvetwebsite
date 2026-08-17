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
  console.log("=== TRYING TO FETCH LIVE RLS POLICIES FROM PG_CATALOG ===");

  try {
    const { data, error } = await adminClient
      .schema("pg_catalog" as any)
      .from("pg_policies" as any)
      .select("*")
      .eq("schemaname", "public")
      .in("tablename", ["customers", "quotations", "quotation_items"]);

    console.log("Policies result:", JSON.stringify(data, null, 2), error);
  } catch (e) {
    console.error("Schema query error:", e);
  }
}

main().catch(console.error);
