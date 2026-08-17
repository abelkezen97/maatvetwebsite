import { Client } from "pg";
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

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;

async function applyDdl() {
  if (!dbUrl) {
    console.error("No DATABASE_URL found in process.env");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to PostgreSQL database directly.");

  const sqlPath = path.resolve(process.cwd(), "supabase/migrations/20260817200000_inventory_management_system.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf8");

  console.log("Applying inventory migration SQL...");
  await client.query(sqlContent);
  console.log("Inventory migration applied.");

  console.log("Granting explicit Data API REST access & notifying PostgREST schema reload...");
  await client.query(`
    GRANT ALL ON public.inventory_movements TO authenticated, anon, service_role, postgres;
    NOTIFY pgrst, 'reload schema';
  `);

  await client.end();
  console.log("DDL application and schema reload complete.");
}

applyDdl().catch((err) => {
  console.error("DDL execution failed:", err);
  process.exit(1);
});
