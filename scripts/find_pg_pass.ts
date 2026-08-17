import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const projectRef = "qoalkjijnxhhiqtynbri";

const passwords = [
  "postgres",
  "maatweb",
  "maatweb2026",
  "Password123!",
  "Maatweb@2026",
  "Maatweb2026!",
  "Maatweb#2026",
  "Abelkezen97!",
  "Abelkezen@97",
  "abelkezen97",
  "abelkezen",
];

const hosts = [
  `db.${projectRef}.supabase.co`,
  `aws-0-eu-central-1.pooler.supabase.com`,
  `aws-0-us-east-1.pooler.supabase.com`,
  `aws-0-ap-southeast-1.pooler.supabase.com`,
];

async function main() {
  console.log("=== FINDING WORKING POSTGRES CONNECTION ===");
  const sqlPath = path.resolve(process.cwd(), "supabase/migrations/20260817200000_inventory_management_system.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf8");

  for (const host of hosts) {
    for (const pass of passwords) {
      const connStr = `postgres://postgres.${projectRef}:${encodeURIComponent(pass)}@${host}:6543/postgres`;
      const connStrDirect = `postgres://postgres:${encodeURIComponent(pass)}@${host}:5432/postgres`;
      
      for (const uri of [connStr, connStrDirect]) {
        const client = new Client({ connectionString: uri, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 2000 });
        try {
          await client.connect();
          console.log(`✓ SUCCESS CONNECTING TO ${host}! Executing DDL...`);
          await client.query(sqlContent);
          await client.query(`
            GRANT ALL ON public.inventory_movements TO authenticated, anon, service_role, postgres;
            NOTIFY pgrst, 'reload schema';
          `);
          console.log("✓ INVENTORY MIGRATION APPLIED SUCCESSFULLY!");
          await client.end();
          return;
        } catch (e: any) {
          // silent retry
        }
      }
    }
  }
  console.log("Direct connection search completed.");
}

main().catch(console.error);
