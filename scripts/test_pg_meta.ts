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

async function main() {
  console.log("=== TESTING PG META & QUERY ENDPOINTS ===");

  const endpoints = [
    `${supabaseUrl}/pg/columns`,
    `${supabaseUrl}/pg/query`,
    `${supabaseUrl}/rest/v1/pg/query`,
    `https://api.supabase.com/v1/projects/qoalkjijnxhhiqtynbri/db/query`,
    `https://qoalkjijnxhhiqtynbri.supabase.co/db/query`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: "SELECT 1" })
      });
      console.log(`URL ${url}: status = ${res.status}`);
      const text = await res.text();
      console.log(`  Response: ${text.slice(0, 150)}`);
    } catch (e: any) {
      console.log(`URL ${url}: Error = ${e.message}`);
    }
  }
}

main().catch(console.error);
