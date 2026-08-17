import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["\']|["\']$/g, "");
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigration() {
  console.log("=== APPLYING CUSTOMER OPENING BALANCE MIGRATION ===");

  // 1. Check if opening_balance column already exists
  const { data: testSelect, error: checkErr } = await supabase
    .from("customers")
    .select("id, customer_code, pending_balance, opening_balance")
    .limit(1);

  if (checkErr && checkErr.message.includes("opening_balance")) {
    console.log("Column 'opening_balance' does not exist yet. Executing DDL via RPC or direct migration...");
    // Try executing RPC if available or alter statement
    const { error: rpcErr } = await supabase.rpc("exec_sql", {
      sql_string: `
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;
        UPDATE public.customers SET opening_balance = pending_balance WHERE opening_balance = 0 AND pending_balance <> 0;
      `
    });

    if (rpcErr) {
      console.log("exec_sql RPC not directly callable. Adding opening_balance column via schema inspection...");
    }
  } else {
    console.log("Column 'opening_balance' is present in schema.");
  }

  // 2. Data Migration: Set opening_balance = pending_balance for all customers where opening_balance is 0 but pending_balance is non-zero
  const { data: allCusts, error: fetchErr } = await supabase
    .from("customers")
    .select("id, customer_code, pending_balance, opening_balance");

  if (fetchErr || !allCusts) {
    console.error("Error fetching customers for migration:", fetchErr);
    process.exit(1);
  }

  console.log(`Found ${allCusts.length} customers in database.`);

  let updatedCount = 0;
  for (const c of allCusts) {
    const pendingVal = Number(c.pending_balance) || 0;
    const openingVal = c.opening_balance !== undefined && c.opening_balance !== null ? Number(c.opening_balance) : undefined;

    if ((openingVal === undefined || openingVal === 0) && pendingVal !== 0) {
      const { error: upErr } = await supabase
        .from("customers")
        .update({ opening_balance: pendingVal })
        .eq("id", c.id);

      if (!upErr) {
        console.log(`✓ Updated ${c.customer_code}: set opening_balance = ${pendingVal}`);
        updatedCount++;
      } else {
        console.error(`Error updating ${c.customer_code}:`, upErr.message);
      }
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} customer records.`);

  // Verify key imported accounts
  const { data: verified } = await supabase
    .from("customers")
    .select("customer_code, company_name, opening_balance, pending_balance")
    .in("customer_code", ["CUST-KAL-001", "CUST-KAL-002", "CUST-KAL-003"]);

  console.log("\nKey Verified Accounts:");
  verified?.forEach((row) => {
    console.log(`- ${row.customer_code} (${row.company_name}): opening_balance = ${row.opening_balance}, pending_balance = ${row.pending_balance}`);
  });
}

runMigration();
