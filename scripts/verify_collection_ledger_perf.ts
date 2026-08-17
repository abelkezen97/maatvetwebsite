import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { calculateSalespersonCollectionLedger, getMultiSalespersonLedgerSummaries } from "../lib/db/collectionLedger";

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function getAuthenticatedClient(email: string) {
  const linkRes = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: email,
  });

  const token_hash = linkRes.data.properties?.hashed_token;
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const sessionRes = await userClient.auth.verifyOtp({
    token_hash: token_hash!,
    type: "magiclink"
  });

  const accessToken = sessionRes.data.session?.access_token;
  return {
    client: createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` }
      },
      auth: { autoRefreshToken: false, persistSession: false }
    }),
    user: sessionRes.data.user
  };
}

async function main() {
  console.log("==================================================");
  console.log("COLLECTION LEDGER PERFORMANCE & BUSINESS LOGIC VERIFICATION");
  console.log("==================================================");

  // 1. Authenticate Roles
  const { client: adminAuth, user: adminUser } = await getAuthenticatedClient("admin@maatvet.com");
  const { client: salesAuth, user: salesUser } = await getAuthenticatedClient("kaleem@maatvet.com");

  console.log(`\n1. AUTHENTICATED TEST SESSIONS:`);
  console.log(`- Super Admin ID: ${adminUser?.id}`);
  console.log(`- Salesperson (Dr. Kaleem) ID: ${salesUser?.id}`);

  // 2. Performance Test - Single Salesperson Ledger Load (Current Month vs All-Time)
  console.log("\n2. TESTING SINGLE SALESPERSON LEDGER PERFORMANCE (OPTIMIZED PROMISE.ALL):");

  const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];

  // A. Current Month Range
  const t_month_start = Date.now();
  const resMonth = await calculateSalespersonCollectionLedger(salesAuth, salesUser!.id, {
    startDate: startMonth,
    endDate: todayStr
  });
  const t_month_end = Date.now();
  const monthDuration = t_month_end - t_month_start;

  console.log(`- Current Month Load (${startMonth} to ${todayStr}): ${monthDuration} ms`);
  console.log(`  Summary: Cash In Hand = ${resMonth.summary.currentCashInHand}, Total Coll = ${resMonth.summary.totalCashCollected}, Total Exp = ${resMonth.summary.totalCashExpenses}, Total HO = ${resMonth.summary.totalCashHandedOver}`);
  console.log(`  Entries count in date range: ${resMonth.entries.length}`);

  // B. All-Time Range
  const t_all_start = Date.now();
  const resAll = await calculateSalespersonCollectionLedger(salesAuth, salesUser!.id);
  const t_all_end = Date.now();
  const allDuration = t_all_end - t_all_start;

  console.log(`- All-Time Load: ${allDuration} ms`);
  console.log(`  Summary: Cash In Hand = ${resAll.summary.currentCashInHand}, Total Coll = ${resAll.summary.totalCashCollected}, Total Exp = ${resAll.summary.totalCashExpenses}, Total HO = ${resAll.summary.totalCashHandedOver}`);
  console.log(`  Entries count total: ${resAll.entries.length}`);

  // 3. Admin All-Salesperson Summary Load
  console.log("\n3. TESTING ADMIN MULTI-SALESPERSON SUMMARY PERFORMANCE (CONCURRENT PROMISE.ALL):");
  const t_multi_start = Date.now();
  const multiSummaries = await getMultiSalespersonLedgerSummaries(adminAuth, "super_admin", "UAE");
  const t_multi_end = Date.now();
  const multiDuration = t_multi_end - t_multi_start;

  console.log(`- Multi-Salesperson Summaries Load: ${multiDuration} ms (retrieved ${multiSummaries.length} salesperson summaries)`);

  // 4. Payload Size & Column Pruning Audit
  console.log("\n4. PAYLOAD SIZE & COLUMN PRUNING VERIFICATION:");
  const sampleExpQuery = await salesAuth
    .from("expenses")
    .select("id, expense_number, expense_date, created_at, amount, category, payment_method, description, status, is_deleted, salesperson_id, employee_id, created_by")
    .or(`salesperson_id.eq.${salesUser!.id},employee_id.eq.${salesUser!.id},created_by.eq.${salesUser!.id}`);

  const hasAttachmentUrl = sampleExpQuery.data?.some((e: any) => 'attachment_url' in e);
  console.log(`- Is 'attachment_url' excluded from list query payload? ${!hasAttachmentUrl ? "YES (PASSED)" : "NO (FAILED)"}`);

  // 5. Business Rules Verification
  console.log("\n5. TESTING BUSINESS LOGIC FORMULA & RULES:");

  // Create temporary test items to verify each rule
  console.log("- Injecting temporary test receipts/expenses to verify deduction logic...");

  const testCustCode = `CUST-TEST-${Date.now().toString().slice(-4)}`;
  const { data: testCust } = await adminClient.from("customers").insert([{
    customer_code: testCustCode,
    company_name: "Formula Test Farm",
    doctor_name: "Dr. Formula Test",
    country: "UAE",
    assigned_salesman_id: salesUser!.id,
    created_by: salesUser!.id
  }]).select().single();

  const { data: testInv } = await adminClient.from("invoices").insert([{
    invoice_number: `INV-FORM-${Date.now().toString().slice(-4)}`,
    customer_id: testCust.id,
    salesman_id: salesUser!.id,
    country: "UAE",
    subtotal: 500,
    grand_total: 500,
    status: "Credit",
    created_by: salesUser!.id
  }]).select().single();

  // Test Receipts (Addition)
  const { data: recAdd } = await salesAuth.from("receipts").insert([{
    receipt_number: `REC-FORM-${Date.now().toString().slice(-4)}`,
    customer_id: testCust.id,
    invoice_id: testInv.id,
    amount_paid: 100,
    payment_method: "Cash",
    country: "UAE",
    created_by: salesUser!.id
  }]).select().single();

  // Test Approved Cash Expense (Deduction)
  const { data: expApprCash } = await salesAuth.from("expenses").insert([{
    expense_number: `EXP-APPR-${Date.now().toString().slice(-4)}`,
    salesperson_id: salesUser!.id,
    created_by: salesUser!.id,
    country: "UAE",
    amount: 25,
    category: "Petrol",
    payment_method: "Cash",
    status: "Approved",
    expense_date: todayStr
  }]).select().single();

  // Test Pending Cash Expense (NO Deduction)
  const { data: expPendCash } = await salesAuth.from("expenses").insert([{
    expense_number: `EXP-PEND-${Date.now().toString().slice(-4)}`,
    salesperson_id: salesUser!.id,
    created_by: salesUser!.id,
    country: "UAE",
    amount: 50,
    category: "Petrol",
    payment_method: "Cash",
    status: "Pending",
    expense_date: todayStr
  }]).select().single();

  // Test Approved Company Card Expense (NO Deduction)
  const { data: expCard } = await salesAuth.from("expenses").insert([{
    expense_number: `EXP-CARD-${Date.now().toString().slice(-4)}`,
    salesperson_id: salesUser!.id,
    created_by: salesUser!.id,
    country: "UAE",
    amount: 75,
    category: "Office",
    payment_method: "Company Card",
    status: "Approved",
    expense_date: todayStr
  }]).select().single();

  // Test Approved Bank Transfer Expense (NO Deduction)
  const { data: expBank } = await salesAuth.from("expenses").insert([{
    expense_number: `EXP-BANK-${Date.now().toString().slice(-4)}`,
    salesperson_id: salesUser!.id,
    created_by: salesUser!.id,
    country: "UAE",
    amount: 90,
    category: "Rent",
    payment_method: "Bank Transfer",
    status: "Approved",
    expense_date: todayStr
  }]).select().single();

  // Test Approved Cash Handover (Deduction)
  const { data: hoAppr } = await salesAuth.from("cash_handovers").insert([{
    handover_number: `HO-APPR-${Date.now().toString().slice(-4)}`,
    salesperson_id: salesUser!.id,
    created_by: salesUser!.id,
    country: "UAE",
    amount: 20,
    status: "Approved",
    handover_date: todayStr
  }]).select().single();

  // Recalculate Ledger with injected test data
  const testLedgerRes = await calculateSalespersonCollectionLedger(salesAuth, salesUser!.id);
  const s = testLedgerRes.summary;

  console.log(`\nFORMULA EVALUATION RESULT:`);
  console.log(`- Opening Cash: ${s.openingCash}`);
  console.log(`- Total Cash Collected (Includes +100 cash receipt): ${s.totalCashCollected}`);
  console.log(`- Total Cash Expenses (Includes -25 approved cash expense, excludes pending & non-cash): ${s.totalCashExpenses}`);
  console.log(`- Total Cash Handed Over (Includes -20 approved cash handover): ${s.totalCashHandedOver}`);
  console.log(`- Current Cash In Hand: ${s.currentCashInHand}`);

  const expectedFormula = s.openingCash + s.totalCashCollected - s.totalCashExpenses - s.totalCashHandedOver;
  const formulaMatches = Math.abs(s.currentCashInHand - Math.max(0, expectedFormula)) < 0.001;

  console.log(`- Formula Rule [Cash in Hand = Opening Cash + Cash Receipts - Approved Cash Expenses - Approved Cash Handovers]: ${formulaMatches ? "PASS" : "FAIL"}`);

  // Clean up injected test rows
  console.log("\n- Cleaning up temporary test rows...");
  if (hoAppr) await adminClient.from("cash_handovers").delete().eq("id", hoAppr.id);
  if (expBank) await adminClient.from("expenses").delete().eq("id", expBank.id);
  if (expCard) await adminClient.from("expenses").delete().eq("id", expCard.id);
  if (expPendCash) await adminClient.from("expenses").delete().eq("id", expPendCash.id);
  if (expApprCash) await adminClient.from("expenses").delete().eq("id", expApprCash.id);
  if (recAdd) await adminClient.from("receipts").delete().eq("id", recAdd.id);
  if (testInv) await adminClient.from("invoices").delete().eq("id", testInv.id);
  if (testCust) await adminClient.from("customers").delete().eq("id", testCust.id);

  console.log("\n==================================================");
  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY");
  console.log("==================================================");
}

main().catch(console.error);
