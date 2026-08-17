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
      const value = match[2].trim().replace(/^["']|["']$/g, "");
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

async function inspectSchema() {
  console.log("=== PHASE 1: DATABASE INSPECTION ===");

  // List of known public tables in MAATWEB schema
  const knownTables = [
    "profiles",
    "products",
    "categories",
    "customers",
    "quotations",
    "quotation_items",
    "invoices",
    "invoice_items",
    "receipts",
    "expenses",
    "cash_handovers",
    "salesperson_opening_balances",
    "inventory_transactions",
    "customer_activity_logs",
    "activity_logs"
  ];

  console.log("\n1. Row Counts across all public tables:");
  const tableCounts: { [table: string]: number } = {};

  for (const table of knownTables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`- ${table}: Error (${error.message}) - table might not exist`);
    } else {
      tableCounts[table] = count || 0;
      console.log(`- ${table}: ${count || 0} rows`);
    }
  }

  // Inspect auth users count
  const { data: usersData, error: uErr } = await supabase.auth.admin.listUsers();
  console.log(`\n- auth.users: ${usersData?.users?.length || 0} users`);
  if (usersData?.users) {
    console.log("  Users found:");
    usersData.users.forEach((u) => {
      console.log(`    - ${u.email} (ID: ${u.id})`);
    });
  }

  // Print raw summary
  console.log("\nInspection Complete.");
}

inspectSchema();
