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

async function executeDataReset() {
  console.log("=== PHASE 3: EXECUTING COMPLETE BUSINESS DATA RESET ===");

  // Exact dependency-safe deletion sequence
  const deletionSequence = [
    "quotation_items",
    "invoice_items",
    "receipts",
    "invoices",
    "quotations",
    "expenses",
    "cash_handovers",
    "salesperson_opening_balances",
    "activity_logs",
    "inventory_transactions",
    "customers",
  ];

  for (const table of deletionSequence) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      console.error(`Error deleting from ${table}:`, error.message);
    } else {
      console.log(`✓ '${table}': deleted ${count || 0} rows`);
    }
  }

  console.log("\n=== PHASE 4: POST-RESET TRANSACTIONAL VERIFICATION ===");

  const verificationResults: { [table: string]: number } = {};
  let allBusinessTablesZero = true;

  for (const table of deletionSequence) {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    const c = count || 0;
    verificationResults[table] = c;
    console.log(`- ${table}: ${c} rows remaining`);
    if (c > 0) {
      allBusinessTablesZero = false;
    }
  }

  console.log("\n=== PHASE 5: AUTH USER & PROFILE VERIFICATION ===");

  const { data: usersData } = await supabase.auth.admin.listUsers();
  const users = usersData?.users || [];
  console.log(`- auth.users count: ${users.length}`);

  const adminUser = users.find((u) => u.email === "admin@maatvet.com");
  const kaleemUser = users.find((u) => u.email === "kaleem@maatvet.com");

  console.log(`  admin@maatvet.com: ${adminUser ? "PRESERVED" : "MISSING"} (ID: ${adminUser?.id})`);
  console.log(`  kaleem@maatvet.com: ${kaleemUser ? "PRESERVED" : "MISSING"} (ID: ${kaleemUser?.id})`);

  const { data: profiles } = await supabase.from("profiles").select("*");
  console.log(`- public.profiles count: ${profiles?.length || 0}`);
  profiles?.forEach((p) => {
    console.log(`  Profile: ${p.full_name} (${p.email}) - Role: ${p.role}, Country: ${p.country}`);
  });

  console.log("\n=== PHASE 6: PRODUCT CATALOG VERIFICATION ===");

  const { count: productCount, data: productsData, error: prodErr } = await supabase
    .from("products")
    .select("*", { count: "exact" });

  console.log(`- public.products count: ${productCount} (Data length: ${productsData?.length || 0})`);
  if (prodErr) {
    console.error("Products error:", prodErr);
  }
  if (productsData && productsData.length > 0) {
    console.log(`  Sample product intact: [${productsData[0].code || "N/A"}] ${productsData[0].name} (${productsData[0].category})`);
  }

  console.log("\n=== FINAL VERIFICATION SUMMARY ===");
  console.log(`USERS PRESERVED: ${users.length === 2 && adminUser && kaleemUser ? "PASS" : "FAIL"}`);
  console.log(`PROFILES PRESERVED: ${profiles?.length === 2 ? "PASS" : "FAIL"}`);
  console.log(`PRODUCTS PRESERVED: ${(productCount || productsData?.length) === 86 ? "PASS" : "FAIL"}`);
  console.log(`ALL BUSINESS DATA RESET TO 0: ${allBusinessTablesZero ? "PASS" : "FAIL"}`);
}

executeDataReset();
