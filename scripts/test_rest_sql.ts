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
  console.log("Testing REST SQL endpoints...");
  
  // Test 1: Management API
  const res1 = await fetch("https://api.supabase.com/v1/projects/qoalkjijnxhhiqtynbri/database/query", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT 1" })
  });
  console.log("Endpoint 1 (api.supabase.com):", res1.status, await res1.text());

  // Test 2: Project Rest SQL
  const res2 = await fetch(`${supabaseUrl}/rest/v1/sql`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT 1" })
  });
  console.log("Endpoint 2 (project/rest/v1/sql):", res2.status, await res2.text());
}

main().catch(console.error);
