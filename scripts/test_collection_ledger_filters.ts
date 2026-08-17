import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { getNormalizedDateRange } from "../lib/dateUtils";

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

async function runTests() {
  console.log("=== COLLECTION LEDGER AUTOMATED TEST SUITE ===");

  // 1. Test Date Normalization Helper
  console.log("\n1. Testing Date Normalization Helper:");
  const periods = ["today", "week", "month", "last_month", "quarter", "year", "last_year", "custom"] as const;

  for (const p of periods) {
    const range = getNormalizedDateRange({
      period: p,
      year: 2026,
      month: 8,
      customStart: "2026-08-01",
      customEnd: "2026-08-17",
    });
    console.log(`- Period '${p}':`, range);
  }

  // 2. Query Active Profiles
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, country, is_active")
    .eq("is_active", true);

  if (pErr || !profiles) {
    console.error("Failed to query profiles:", pErr);
    process.exit(1);
  }

  const superAdmin = profiles.find((p) => p.role === "super_admin");
  const salesperson = profiles.find((p) => p.role === "salesperson");

  console.log(`\nFound Super Admin: ${superAdmin?.full_name} (${superAdmin?.id})`);
  console.log(`Found Salesperson: ${salesperson?.full_name} (${salesperson?.id})`);

  // 3. Test Database Queries with Date Filters
  if (salesperson) {
    console.log(`\n2. Testing DB Date Filtering for Salesperson (${salesperson.full_name}):`);

    const dateRange = getNormalizedDateRange({ period: "month", year: 2026, month: 8 });

    // Receipts query
    const { data: recs } = await supabase
      .from("receipts")
      .select("id, receipt_number, payment_date, amount_paid, payment_method")
      .or(`created_by.eq.${salesperson.id}`)
      .eq("payment_method", "Cash")
      .gte("payment_date", dateRange.startDate)
      .lte("payment_date", dateRange.endDate);

    // Expenses query
    const { data: exps } = await supabase
      .from("expenses")
      .select("id, expense_number, expense_date, amount, status, payment_method")
      .or(`salesperson_id.eq.${salesperson.id},employee_id.eq.${salesperson.id},created_by.eq.${salesperson.id}`)
      .gte("expense_date", dateRange.startDate)
      .lte("expense_date", dateRange.endDate);

    // Handovers query
    const { data: hos } = await supabase
      .from("cash_handovers")
      .select("id, handover_number, handover_date, amount, status")
      .or(`salesperson_id.eq.${salesperson.id},created_by.eq.${salesperson.id}`)
      .gte("handover_date", dateRange.startDate)
      .lte("handover_date", dateRange.endDate);

    console.log(`- Date Range: ${dateRange.startDate} to ${dateRange.endDate}`);
    console.log(`- Receipts in period: ${recs?.length || 0}`);
    console.log(`- Expenses in period: ${exps?.length || 0}`);
    console.log(`- Handovers in period: ${hos?.length || 0}`);
  }

  console.log("\n=== TEST SUITE COMPLETED SUCCESSFULLY ===");
}

runTests();
