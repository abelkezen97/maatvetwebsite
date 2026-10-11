import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envConfig = fs.readFileSync(".env.local", "utf-8");
envConfig.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["\']|["\']$/g, "");
});

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function check() {
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, customer_code, company_name, doctor_name, pending_balance, country");

  console.log("=== CURRENT CUSTOMER BALANCES IN DB ===");
  if (error) {
    console.error("Error:", error);
    return;
  }
  customers?.forEach((c) => {
    console.log(`- ${c.customer_code} | ${c.company_name} (${c.doctor_name || "N/A"}): pending_balance = ${c.pending_balance}`);
  });
}

check();
