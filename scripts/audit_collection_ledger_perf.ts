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
  console.log("=== COLLECTION LEDGER PERFORMANCE AUDIT ===");

  // 1. Check Row Counts in DB
  console.log("\n1. DATABASE ROW COUNTS (Admin)");
  const tables = ['profiles', 'salesperson_opening_balances', 'receipts', 'expenses', 'cash_handovers', 'invoices', 'customers'];
  for (const t of tables) {
    const { count, error } = await adminClient.from(t).select('*', { count: 'exact', head: true });
    console.log(`- ${t}: ${count} rows`);
  }

  // 2. Authenticate as Admin and Salesperson
  const { client: adminAuth, user: adminUser } = await getAuthenticatedClient("admin@maatvet.com");
  const { client: kaleemAuth, user: kaleemUser } = await getAuthenticatedClient("kaleem@maatvet.com");

  console.log(`\n2. AUDITING WITH AUTHENTICATED USERS:`);
  console.log(`Admin UID: ${adminUser?.id}`);
  console.log(`Salesperson UID: ${kaleemUser?.id}`);

  // Test as Admin querying Salesperson Kaleem
  const clientToUse = adminAuth;
  const spId = kaleemUser!.id;

  console.log(`\n3. SEQUENTIAL QUERY EXECUTION AUDIT (as executed in calculateSalespersonCollectionLedger):`);

  // Query 1: Salesperson Profile
  const t1_start = Date.now();
  const q1 = await clientToUse
    .from("profiles")
    .select("id, full_name, country")
    .eq("id", spId)
    .single();
  const t1_end = Date.now();
  console.log(`[Q1] profiles.select: ${t1_end - t1_start} ms | rows: 1 | data: ${JSON.stringify(q1.data)} | err: ${q1.error?.message || 'none'}`);

  // Query 2: Opening Cash Balance
  const t2_start = Date.now();
  const q2 = await clientToUse
    .from("salesperson_opening_balances")
    .select("opening_cash, effective_date")
    .eq("salesperson_id", spId)
    .order("effective_date", { ascending: false })
    .limit(1);
  const t2_end = Date.now();
  console.log(`[Q2] salesperson_opening_balances.select: ${t2_end - t2_start} ms | rows: ${q2.data?.length || 0} | data: ${JSON.stringify(q2.data)} | err: ${q2.error?.message || 'none'}`);

  // Query 3: Receipts (Cash Only) with joins
  const t3_start = Date.now();
  const q3 = await clientToUse
    .from("receipts")
    .select("*, customers(doctor_name, company_name), invoices(salesman_id)")
    .or(`created_by.eq.${spId}`)
    .eq("payment_method", "Cash");
  const t3_end = Date.now();
  console.log(`[Q3] receipts.select (*, customers, invoices): ${t3_end - t3_start} ms | rows: ${q3.data?.length || 0} | err: ${q3.error?.message || 'none'}`);

  // Query 4: Expenses (OR condition)
  const t4_start = Date.now();
  const q4 = await clientToUse
    .from("expenses")
    .select("*")
    .or(`salesperson_id.eq.${spId},employee_id.eq.${spId},created_by.eq.${spId}`);
  const t4_end = Date.now();
  console.log(`[Q4] expenses.select (*): ${t4_end - t4_start} ms | rows: ${q4.data?.length || 0} | err: ${q4.error?.message || 'none'}`);

  // Query 5: Cash Handovers (OR condition)
  const t5_start = Date.now();
  const q5 = await clientToUse
    .from("cash_handovers")
    .select("*")
    .or(`salesperson_id.eq.${spId},created_by.eq.${spId}`);
  const t5_end = Date.now();
  console.log(`[Q5] cash_handovers.select (*): ${t5_end - t5_start} ms | rows: ${q5.data?.length || 0} | err: ${q5.error?.message || 'none'}`);

  // Query 6: API Salespeople list (called from useEffect in page.tsx)
  const t6_start = Date.now();
  const q6 = await clientToUse
    .from("profiles")
    .select("id, full_name, email, role, country, is_active")
    .eq("role", "salesperson")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  const t6_end = Date.now();
  console.log(`[Q6] /api/salespeople (profiles.select list): ${t6_end - t6_start} ms | rows: ${q6.data?.length || 0} | err: ${q6.error?.message || 'none'}`);

  const totalSeqTime = (t1_end - t1_start) + (t2_end - t2_start) + (t3_end - t3_start) + (t4_end - t4_start) + (t5_end - t5_start);
  console.log(`\nTOTAL SEQUENTIAL DB EXECUTION TIME IN FUNCTION: ${totalSeqTime} ms`);

  // 4. TEST PARALLEL EXECUTION TIME
  const p_start = Date.now();
  await Promise.all([
    clientToUse.from("profiles").select("id, full_name, country").eq("id", spId).single(),
    clientToUse.from("salesperson_opening_balances").select("opening_cash, effective_date").eq("salesperson_id", spId).order("effective_date", { ascending: false }).limit(1),
    clientToUse.from("receipts").select("*, customers(doctor_name, company_name), invoices(salesman_id)").or(`created_by.eq.${spId}`).eq("payment_method", "Cash"),
    clientToUse.from("expenses").select("*").or(`salesperson_id.eq.${spId},employee_id.eq.${spId},created_by.eq.${spId}`),
    clientToUse.from("cash_handovers").select("*").or(`salesperson_id.eq.${spId},created_by.eq.${spId}`)
  ]);
  const p_end = Date.now();
  console.log(`\nPARALLEL (Promise.all) EXECUTION TIME FOR ALL 5 QUERIES: ${p_end - p_start} ms`);
}

main().catch(console.error);
