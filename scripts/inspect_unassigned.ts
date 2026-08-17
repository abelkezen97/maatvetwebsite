import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectCustomer() {
  console.log("=== INSPECT CUSTOMER UNASSIGNED ISSUE ===");

  const { data: customers, error } = await supabase
    .from("customers")
    .select("*");

  console.log("FETCHED CUSTOMERS ALL:", JSON.stringify(customers, null, 2));
  console.log("ERROR IF ANY:", error);

  const { data: allProfiles } = await supabase.from("profiles").select("*");
  console.log("ALL PROFILES IN DB:", JSON.stringify(allProfiles, null, 2));
}

inspectCustomer();
