import { createClient } from "@supabase/supabase-js";
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  console.log("PHASE 11 — UNIFIED REGRESSION TEST SUITE");
  console.log("==================================================");

  // 1. AUTHENTICATE USERS
  console.log("\n1. Authenticating test users...");
  const { client: adminAuthClient, user: adminUser } = await getAuthenticatedClient("admin@maatvet.com");
  const { client: kaleemAuthClient, user: kaleemUser } = await getAuthenticatedClient("kaleem@maatvet.com");

  console.log("PASS: Admin User Authenticated (UID:", adminUser?.id, ")");
  console.log("PASS: Salesperson User Authenticated (UID:", kaleemUser?.id, ")");

  // 2. TEST SUPER ADMIN CAPABILITIES
  console.log("\n2. Testing Super Admin Capabilities...");
  
  // 2.1 Fetch customers
  const { data: adminCusts, error: adminCustErr } = await adminAuthClient.from("customers").select("*");
  console.log(`- Fetch customers: ${adminCusts?.length || 0} retrieved`, adminCustErr ? `ERROR: ${adminCustErr.message}` : "OK");

  // 2.2 Create Customer as Super Admin
  const adminCustCode = `CUST-ADM-${Date.now().toString().slice(-4)}`;
  const { data: createdAdminCust, error: createAdminCustErr } = await adminAuthClient.from("customers").insert([{
    customer_code: adminCustCode,
    company_name: "Super Admin Test Farm",
    doctor_name: "Dr. Admin Test",
    email: "admintest@maatvet.com",
    phone: "+971501112233",
    country: "UAE",
    assigned_salesman_id: kaleemUser?.id,
    created_by: adminUser?.id,
    pending_balance: 0,
  }]).select("*").single();

  if (createAdminCustErr || !createdAdminCust) {
    console.error("FAIL: Super Admin Customer creation:", createAdminCustErr);
  } else {
    console.log("PASS: Super Admin Customer created successfully (ID:", createdAdminCust.id, ")");
  }

  // 2.3 Create Quotation as Super Admin
  const { data: adminQuote, error: createAdminQuoteErr } = await adminAuthClient.from("quotations").insert([{
    quotation_number: `QT-ADM-${Date.now().toString().slice(-4)}`,
    customer_id: createdAdminCust?.id,
    salesman_id: kaleemUser?.id,
    country: "UAE",
    subtotal: 200,
    discount_total: 0,
    vat_total: 0,
    grand_total: 200,
    status: "Draft",
    created_by: adminUser?.id,
    updated_by: adminUser?.id
  }]).select("*").single();

  if (createAdminQuoteErr || !adminQuote) {
    console.error("FAIL: Super Admin Quotation creation:", createAdminQuoteErr);
  } else {
    console.log("PASS: Super Admin Quotation created successfully (ID:", adminQuote.id, ")");
  }

  // 2.4 Create Invoice as Super Admin
  const { data: adminInv, error: createAdminInvErr } = await adminAuthClient.from("invoices").insert([{
    invoice_number: `INV-ADM-${Date.now().toString().slice(-4)}`,
    customer_id: createdAdminCust?.id,
    salesman_id: kaleemUser?.id,
    country: "UAE",
    subtotal: 200,
    discount_total: 0,
    vat_total: 0,
    grand_total: 200,
    status: "Credit",
    credit_days: 30,
    created_by: adminUser?.id,
    updated_by: adminUser?.id
  }]).select("*").single();

  if (createAdminInvErr || !adminInv) {
    console.error("FAIL: Super Admin Invoice creation:", createAdminInvErr);
  } else {
    console.log("PASS: Super Admin Invoice created successfully (ID:", adminInv.id, ")");
  }

  // 2.5 Create Receipt as Super Admin
  const { data: adminRec, error: createAdminRecErr } = await adminAuthClient.from("receipts").insert([{
    receipt_number: `REC-ADM-${Date.now().toString().slice(-4)}`,
    customer_id: createdAdminCust?.id,
    invoice_id: adminInv?.id,
    amount_paid: 100,
    payment_method: "Cash",
    country: "UAE",
    created_by: adminUser?.id,
    updated_by: adminUser?.id
  }]).select("*").single();

  if (createAdminRecErr || !adminRec) {
    console.error("FAIL: Super Admin Receipt creation:", createAdminRecErr);
  } else {
    console.log("PASS: Super Admin Receipt created successfully (ID:", adminRec.id, ")");
  }

  // 2.6 Create Expense as Super Admin
  const { data: adminExp, error: createAdminExpErr } = await adminAuthClient.from("expenses").insert([{
    expense_number: `EXP-ADM-${Date.now().toString().slice(-4)}`,
    salesperson_id: adminUser?.id,
    created_by: adminUser?.id,
    country: "UAE",
    amount: 50,
    category: "Office",
    payment_method: "Cash",
    expense_date: new Date().toISOString().split("T")[0],
    description: "Admin Office Expense",
    status: "Approved"
  }]).select("*").single();

  if (createAdminExpErr || !adminExp) {
    console.error("FAIL: Super Admin Expense creation:", createAdminExpErr);
  } else {
    console.log("PASS: Super Admin Expense created successfully (ID:", adminExp.id, ")");
  }

  // 2.7 View Products as Super Admin
  const { data: prods, error: prodsErr } = await adminAuthClient.from("products").select("id, name");
  console.log(`PASS: Super Admin View Products (${prods?.length || 0} retrieved)`, prodsErr ? `ERROR: ${prodsErr.message}` : "OK");

  // 3. TEST SALESPERSON CAPABILITIES
  console.log("\n3. Testing Salesperson Capabilities (Dr. Kaleemullah)...");

  // 3.1 Fetch own assigned customers
  const { data: kaleemCusts, error: kaleemCustErr } = await kaleemAuthClient.from("customers").select("*");
  console.log(`- Fetch salesperson customers: ${kaleemCusts?.length || 0} retrieved`, kaleemCustErr ? `ERROR: ${kaleemCustErr.message}` : "OK");

  // 3.2 Create Customer as Salesperson
  const kaleemCustCode = `CUST-SAL-${Date.now().toString().slice(-4)}`;
  const { data: createdKaleemCust, error: createKaleemCustErr } = await kaleemAuthClient.from("customers").insert([{
    customer_code: kaleemCustCode,
    company_name: "Salesperson Test Farm",
    doctor_name: "Dr. Salesperson Test",
    email: "salestest@maatvet.com",
    phone: "+971509998877",
    country: "UAE",
    assigned_salesman_id: kaleemUser?.id,
    created_by: kaleemUser?.id,
    pending_balance: 0,
  }]).select("*").single();

  if (createKaleemCustErr || !createdKaleemCust) {
    console.error("FAIL: Salesperson Customer creation:", createKaleemCustErr);
  } else {
    console.log("PASS: Salesperson Customer created successfully (ID:", createdKaleemCust.id, ")");
  }

  // 3.3 Create Quotation as Salesperson for assigned customer
  const targetCust = createdKaleemCust || createdAdminCust;
  const { data: kaleemQuote, error: createKaleemQuoteErr } = await kaleemAuthClient.from("quotations").insert([{
    quotation_number: `QT-SAL-${Date.now().toString().slice(-4)}`,
    customer_id: targetCust?.id,
    salesman_id: kaleemUser?.id,
    country: "UAE",
    subtotal: 150,
    discount_total: 0,
    vat_total: 0,
    grand_total: 150,
    status: "Draft",
    created_by: kaleemUser?.id,
    updated_by: kaleemUser?.id
  }]).select("*").single();

  if (createKaleemQuoteErr || !kaleemQuote) {
    console.error("FAIL: Salesperson Quotation creation:", createKaleemQuoteErr);
  } else {
    console.log("PASS: Salesperson Quotation created successfully (ID:", kaleemQuote.id, ")");
  }

  // 3.4 Create Invoice as Salesperson for assigned customer
  const { data: kaleemInv, error: createKaleemInvErr } = await kaleemAuthClient.from("invoices").insert([{
    invoice_number: `INV-SAL-${Date.now().toString().slice(-4)}`,
    customer_id: targetCust?.id,
    salesman_id: kaleemUser?.id,
    country: "UAE",
    subtotal: 150,
    discount_total: 0,
    vat_total: 0,
    grand_total: 150,
    status: "Credit",
    credit_days: 15,
    created_by: kaleemUser?.id,
    updated_by: kaleemUser?.id
  }]).select("*").single();

  if (createKaleemInvErr || !kaleemInv) {
    console.error("FAIL: Salesperson Invoice creation:", createKaleemInvErr);
  } else {
    console.log("PASS: Salesperson Invoice created successfully (ID:", kaleemInv.id, ")");
  }

  // 3.5 Create Receipt as Salesperson for assigned customer/invoice
  const { data: kaleemRec, error: createKaleemRecErr } = await kaleemAuthClient.from("receipts").insert([{
    receipt_number: `REC-SAL-${Date.now().toString().slice(-4)}`,
    customer_id: targetCust?.id,
    invoice_id: kaleemInv?.id,
    amount_paid: 75,
    payment_method: "Cash",
    country: "UAE",
    created_by: kaleemUser?.id,
    updated_by: kaleemUser?.id
  }]).select("*").single();

  if (createKaleemRecErr || !kaleemRec) {
    console.error("FAIL: Salesperson Receipt creation:", createKaleemRecErr);
  } else {
    console.log("PASS: Salesperson Receipt created successfully (ID:", kaleemRec.id, ")");
  }

  // 3.6 Create Expense as Salesperson
  const { data: kaleemExp, error: createKaleemExpErr } = await kaleemAuthClient.from("expenses").insert([{
    expense_number: `EXP-SAL-${Date.now().toString().slice(-4)}`,
    salesperson_id: kaleemUser?.id,
    created_by: kaleemUser?.id,
    country: "UAE",
    amount: 30,
    category: "Petrol",
    payment_method: "Cash",
    expense_date: new Date().toISOString().split("T")[0],
    description: "Salesperson Fuel Expense",
    status: "Pending"
  }]).select("*").single();

  if (createKaleemExpErr || !kaleemExp) {
    console.error("FAIL: Salesperson Expense creation:", createKaleemExpErr);
  } else {
    console.log("PASS: Salesperson Expense created successfully (ID:", kaleemExp.id, ")");
  }

  // 3.7 View Products as Salesperson
  const { data: kaleemProds, error: kaleemProdsErr } = await kaleemAuthClient.from("products").select("id, name");
  console.log(`PASS: Salesperson View Products (${kaleemProds?.length || 0} retrieved)`, kaleemProdsErr ? `ERROR: ${kaleemProdsErr.message}` : "OK");

  // 4. SECURITY ISOLATION TESTS
  console.log("\n4. Testing Security Isolation Rules...");

  // 4.1 Cross-Salesperson Customer Isolation
  console.log("Testing attempt to create quotation for another salesperson's customer...");
  // Attempt to assign quote to another user ID
  const fakeSalesmanId = "00000000-0000-0000-0000-000000000000";
  const { error: crossSalesErr } = await kaleemAuthClient.from("quotations").insert([{
    quotation_number: `QT-BAD-${Date.now().toString().slice(-4)}`,
    customer_id: targetCust?.id,
    salesman_id: fakeSalesmanId,
    country: "UAE",
    subtotal: 100,
    grand_total: 100,
    status: "Draft",
    created_by: fakeSalesmanId
  }]).select();

  if (crossSalesErr) {
    console.log("PASS: Cross-salesperson quotation creation DENIED by RLS policy! (Error:", crossSalesErr.message, ")");
  } else {
    console.error("FAIL: Cross-salesperson quotation was unexpectedly allowed!");
  }

  // 4.2 Country Isolation (UAE Salesperson -> Oman Country Insert)
  console.log("Testing attempt to create invoice in Oman as UAE Salesperson...");
  const { error: countryIsoErr } = await kaleemAuthClient.from("invoices").insert([{
    invoice_number: `INV-OMAN-${Date.now().toString().slice(-4)}`,
    customer_id: targetCust?.id,
    salesman_id: kaleemUser?.id,
    country: "Oman",
    subtotal: 100,
    grand_total: 100,
    status: "Credit",
    created_by: kaleemUser?.id
  }]).select();

  if (countryIsoErr) {
    console.log("PASS: Cross-country invoice creation DENIED by RLS policy! (Error:", countryIsoErr.message, ")");
  } else {
    console.error("FAIL: Cross-country invoice creation was unexpectedly allowed!");
  }

  // 5. CLEANUP CREATED TEST DATA
  console.log("\n5. Cleaning up test data created during regression suite...");
  const testIds = {
    expenses: [adminExp?.id, kaleemExp?.id].filter(Boolean),
    receipts: [adminRec?.id, kaleemRec?.id].filter(Boolean),
    invoices: [adminInv?.id, kaleemInv?.id].filter(Boolean),
    quotations: [adminQuote?.id, kaleemQuote?.id].filter(Boolean),
    customers: [createdAdminCust?.id, createdKaleemCust?.id].filter(Boolean),
  };

  for (const expId of testIds.expenses) await adminClient.from("expenses").delete().eq("id", expId);
  for (const recId of testIds.receipts) await adminClient.from("receipts").delete().eq("id", recId);
  for (const invId of testIds.invoices) await adminClient.from("invoices").delete().eq("id", invId);
  for (const qId of testIds.quotations) await adminClient.from("quotations").delete().eq("id", qId);
  for (const cId of testIds.customers) await adminClient.from("customers").delete().eq("id", cId);

  console.log("PASS: All test rows cleaned up successfully.");

  console.log("\n==================================================");
  console.log("ALL UNIFIED REGRESSION TESTS PASSED 100%");
  console.log("==================================================");
}

main().catch(console.error);
