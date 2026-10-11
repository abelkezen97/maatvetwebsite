/**
 * Safety gate for scripts that WRITE to the database.
 *
 * Import this as the very first line of any script that inserts, updates or
 * deletes data:
 *
 *   import "../_lib/require-confirm";
 *
 * It loads .env.local, prints which Supabase project the script is about to
 * touch, and exits unless the script was started with `--confirm`.
 * There is no separate test database: every script here talks to whatever
 * NEXT_PUBLIC_SUPABASE_URL points at, which is usually production.
 */
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    let value = (match[2] || "").trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

const target = process.env.NEXT_PUBLIC_SUPABASE_URL || "(NEXT_PUBLIC_SUPABASE_URL not set)";
const script = path.relative(process.cwd(), process.argv[1] || "script");

if (!process.argv.includes("--confirm")) {
  console.error(
    [
      "",
      `  ${script} writes to the database at:`,
      `    ${target}`,
      "",
      "  Re-run with --confirm if you really mean it:",
      `    npx tsx ${script} --confirm`,
      "",
    ].join("\n")
  );
  process.exit(1);
}

console.log(`[confirmed] ${script} -> ${target}`);
