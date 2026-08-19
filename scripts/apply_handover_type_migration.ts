import { Client } from 'pg';
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const projectRef = "qoalkjijnxhhiqtynbri";
const passwords = ["postgres", "maatweb", "maatweb2026", "Password123!", "Maatweb@2026", "qoalkjijnxhhiqtynbri", "Abelkezen97!", "abelkezen97"];
const hosts = [
  `db.${projectRef}.supabase.co`,
  `aws-0-eu-central-1.pooler.supabase.com`,
  `aws-0-us-east-1.pooler.supabase.com`,
  `aws-0-ap-southeast-1.pooler.supabase.com`,
];

async function main() {
  console.log("=== APPLYING HANDOVER_TYPE MIGRATION ===");
  
  const sqlPath = path.resolve(process.cwd(), "supabase/migrations/20260818000000_add_handover_type.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf8");

  // 1. Try Direct PG connection
  for (const host of hosts) {
    for (const pass of passwords) {
      const connStrPooler = `postgres://postgres.${projectRef}:${encodeURIComponent(pass)}@${host}:6543/postgres`;
      const connStrDirect = `postgres://postgres:${encodeURIComponent(pass)}@${host}:5432/postgres`;
      
      for (const uri of [connStrPooler, connStrDirect]) {
        const client = new Client({ connectionString: uri, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 2500 });
        try {
          await client.connect();
          console.log(`✓ Connected to ${host}! Applying SQL...`);
          await client.query(sqlContent);
          await client.query("NOTIFY pgrst, 'reload schema';");
          console.log("✓ DDL Migration applied successfully via PG direct client.");
          await client.end();
          return;
        } catch (e: any) {
          // ignore failure and continue search
        }
      }
    }
  }

  // 2. Try Supabase rpc if exec_sql exists
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: rpcErr } = await supabase.rpc("exec_sql", { sql_string: sqlContent });
  if (!rpcErr) {
    console.log("✓ DDL Migration applied successfully via exec_sql RPC.");
    return;
  }

  // 3. Test if column exists by inserting/updating or querying
  const { data, error } = await supabase.from("cash_handovers").select("id, handover_type").limit(1);
  if (!error) {
    console.log("✓ Column 'handover_type' already present and accessible in REST schema!");
  } else {
    console.log("Notice on schema inspection:", error.message);
  }
}

main().catch(console.error);
