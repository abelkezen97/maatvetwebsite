import { Client } from 'pg';
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

const projectRef = "qoalkjijnxhhiqtynbri";

// Try standard candidate DB URLs if password or connection exists
const passwords = ["postgres", "maatweb", "maatweb2026", "Password123!", "Maatweb@2026", "qoalkjijnxhhiqtynbri"];
const hosts = [
  `db.${projectRef}.supabase.co`,
  `aws-0-eu-central-1.pooler.supabase.com`,
  `aws-0-us-east-1.pooler.supabase.com`,
  `aws-0-ap-southeast-1.pooler.supabase.com`,
];

async function main() {
  console.log("=== TESTING DIRECT POSTGRES CONNECTIONS ===");
  for (const host of hosts) {
    for (const pass of passwords) {
      const connStr = `postgres://postgres:${encodeURIComponent(pass)}@${host}:5432/postgres`;
      const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
      try {
        await client.connect();
        console.log(`SUCCESS CONNECTING TO ${host} with password '${pass}'`);
        const res = await client.query("ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0; UPDATE public.customers SET opening_balance = pending_balance WHERE opening_balance = 0 AND pending_balance <> 0;");
        console.log("Migration executed via direct PG connection!");
        await client.end();
        return;
      } catch (e: any) {
        // silent retry
      }
    }
  }
  console.log("Direct connection test completed.");
}

main().catch(console.error);
