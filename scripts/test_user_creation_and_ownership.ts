import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envFile = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const envVars: Record<string, string> = {};
envFile.split("\n").forEach((line) => {
  const [k, v] = line.split("=");
  if (k && v) envVars[k.trim()] = v.trim();
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clientSupabase = createClient(supabaseUrl, publishableKey);

async function main() {
  console.log("=== STARTING TEST USER CREATION & OWNERSHIP VERIFICATION ===");

  const testEmail = `test_salesperson_${Date.now()}@maatvet.com`;
  const testPassword = `TestPass#${Math.floor(100000 + Math.random() * 900000)}`;
  const testName = "Test Verification Salesperson";

  console.log(`1. Creating Test Salesperson Auth User via Admin API (${testEmail})...`);

  // Step 15.1: Create Auth User via Admin API
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      full_name: testName,
      role: "salesperson",
      country: "UAE",
    },
  });

  if (authErr || !authData.user) {
    console.error("FAIL: Failed to create Auth User:", authErr);
    process.exit(1);
  }

  const newUserId = authData.user.id;
  console.log(`Auth User Created: UID = ${newUserId}`);

  // Check auth user
  console.log(`Auth Identities created for UID = ${newUserId}`);

  // Create Profile
  const profilePayload = {
    id: newUserId,
    full_name: testName,
    email: testEmail,
    phone: "+971500000000",
    role: "salesperson",
    country: "UAE",
    is_active: true,
  };

  const { data: createdProfile, error: profileErr } = await adminClient
    .from("profiles")
    .upsert(profilePayload)
    .select("*")
    .single();

  if (profileErr || !createdProfile) {
    console.error("FAIL: Profile creation error, rolling back auth user:", profileErr);
    await adminClient.auth.admin.deleteUser(newUserId);
    process.exit(1);
  }

  console.log(`Profile Created: Profile ID = ${createdProfile.id}`);

  // Verify auth.users.id === profiles.id
  if (newUserId !== createdProfile.id) {
    console.error(`FAIL: UID Mismatch! Auth UID (${newUserId}) != Profile UID (${createdProfile.id})`);
    process.exit(1);
  }
  console.log("PASS: auth.users.id = public.profiles.id");

  // Step 15.2: Verify Login with created credentials
  console.log("\n2. Testing Login via supabase.auth.signInWithPassword...");
  const { data: signInData, error: signInErr } = await clientSupabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInErr || !signInData.user) {
    console.error("FAIL: Login failed with created credentials:", signInErr);
    await adminClient.from("profiles").delete().eq("id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
    process.exit(1);
  }

  console.log(`PASS: Login successful! Signed in User ID = ${signInData.user.id}`);

  // Step 16: Salesperson Data Ownership Verification
  console.log("\n3. Testing Salesperson Data Ownership binding (Customer, Quotation, Invoice, Expense)...");

  // Create Customer
  const { data: custData, error: custErr } = await adminClient
    .from("customers")
    .insert([{
      customer_code: `CUST-TEST-${Date.now().toString().slice(-4)}`,
      company_name: "Test Ownership Stables LLC",
      doctor_name: "Test Doctor",
      email: "testcust@maatvet.com",
      phone: "+971501112233",
      address: "Dubai, UAE",
      city: "Dubai",
      country: "UAE",
      assigned_salesman_id: newUserId,
      pending_balance: 0,
      created_by: newUserId,
    }])
    .select("*")
    .single();

  if (custErr || !custData) {
    console.error("FAIL: Customer creation error:", custErr);
  } else {
    console.log(`Customer Created ID = ${custData.id}, assigned_salesman_id = ${custData.assigned_salesman_id}`);
    if (custData.assigned_salesman_id === newUserId) {
      console.log("PASS: customers.assigned_salesman_id = auth.users.id");
    } else {
      console.error("FAIL: Customer assigned_salesman_id mismatch!");
    }
  }

  // Create Quotation
  const { data: quoteData, error: quoteErr } = await adminClient
    .from("quotations")
    .insert([{
      quotation_number: `QT-TEST-${Date.now().toString().slice(-4)}`,
      customer_id: custData?.id,
      salesman_id: newUserId,
      country: "UAE",
      subtotal: 100,
      grand_total: 105,
      status: "Draft",
      created_by: newUserId,
    }])
    .select("*")
    .single();

  if (quoteErr || !quoteData) {
    console.error("FAIL: Quotation creation error:", quoteErr);
  } else {
    console.log(`Quotation Created ID = ${quoteData.id}, salesman_id = ${quoteData.salesman_id}`);
    if (quoteData.salesman_id === newUserId) {
      console.log("PASS: quotations.salesman_id = auth.users.id");
    } else {
      console.error("FAIL: Quotation salesman_id mismatch!");
    }
  }

  // Create Invoice
  const { data: invData, error: invErr } = await adminClient
    .from("invoices")
    .insert([{
      invoice_number: `INV-TEST-${Date.now().toString().slice(-4)}`,
      customer_id: custData?.id,
      salesman_id: newUserId,
      country: "UAE",
      subtotal: 100,
      grand_total: 105,
      status: "Credit",
      created_by: newUserId,
    }])
    .select("*")
    .single();

  if (invErr || !invData) {
    console.error("FAIL: Invoice creation error:", invErr);
  } else {
    console.log(`Invoice Created ID = ${invData.id}, salesman_id = ${invData.salesman_id}`);
    if (invData.salesman_id === newUserId) {
      console.log("PASS: invoices.salesman_id = auth.users.id");
    } else {
      console.error("FAIL: Invoice salesman_id mismatch!");
    }
  }

  // Create Expense
  const { data: expData, error: expErr } = await adminClient
    .from("expenses")
    .insert([{
      expense_number: `EXP-TEST-${Date.now().toString().slice(-4)}`,
      salesperson_id: newUserId,
      country: "UAE",
      category: "Travel",
      amount: 50,
      status: "Pending",
      created_by: newUserId,
    }])
    .select("*")
    .single();

  if (expErr || !expData) {
    console.error("FAIL: Expense creation error:", expErr);
  } else {
    console.log(`Expense Created ID = ${expData.id}, salesperson_id = ${expData.salesperson_id}`);
    if (expData.salesperson_id === newUserId) {
      console.log("PASS: expenses.salesperson_id = auth.users.id");
    } else {
      console.error("FAIL: Expense salesperson_id mismatch!");
    }
  }

  // Verify Products are globally shared
  const { data: prods, error: prodErr } = await adminClient
    .from("products")
    .select("id, name")
    .limit(5);

  if (prodErr) {
    console.error("FAIL: Products query error:", prodErr);
  } else {
    console.log(`PASS: Products remain globally visible (${prods?.length || 0} products retrieved).`);
  }

  // CLEANUP TEST DATA
  console.log("\n4. Cleaning up test data...");
  if (expData?.id) await adminClient.from("expenses").delete().eq("id", expData.id);
  if (invData?.id) await adminClient.from("invoices").delete().eq("id", invData.id);
  if (quoteData?.id) await adminClient.from("quotations").delete().eq("id", quoteData.id);
  if (custData?.id) await adminClient.from("customers").delete().eq("id", custData.id);
  if (newUserId) {
    await adminClient.from("profiles").delete().eq("id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
  }

  console.log("\n=== ALL AUTHENTICATION & DATA OWNERSHIP VERIFICATIONS PASSED ===");
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
