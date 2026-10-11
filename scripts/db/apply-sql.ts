/**
 * Apply a SQL file to the database using a connection string from the
 * environment. Replaces the old one-off apply_* scripts.
 *
 *   npx tsx scripts/db/apply-sql.ts supabase/migrations/<file>.sql --confirm
 *
 * Needs DATABASE_URL in .env.local (Supabase Dashboard -> Connect -> Session
 * pooler). Never hardcode database passwords in this repo.
 *
 * Prefer `supabase db push` when the Supabase CLI is linked to the project;
 * this script is for when you need to run a single file by hand.
 */
import "../_lib/require-confirm";
import fs from "fs";
import path from "path";
import { Client } from "pg";

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npx tsx scripts/db/apply-sql.ts <path/to/file.sql> --confirm");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  const client = new Client({ connectionString });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`Applied ${file}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
