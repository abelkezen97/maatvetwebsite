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
  console.log("=== FETCHING POSTGREST OPENAPI SPEC ===");
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`
    }
  });

  const spec = await res.json();
  console.log("Title:", spec.info?.title);
  console.log("Paths available:");
  const paths = Object.keys(spec.paths || {});
  paths.forEach((p) => {
    if (p.startsWith("/rpc/")) {
      console.log(`- RPC: ${p}`);
    }
  });
}

main().catch(console.error);
