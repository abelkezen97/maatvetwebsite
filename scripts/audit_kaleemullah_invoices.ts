import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load .env.local
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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function auditKaleemullah() {
  console.log("==================================================");
  console.log("AUDITING DR. KALEEMULLAH PROFILE & INVOICES");
  console.log("==================================================\n");

  // 1. Find Dr. Kaleemullah Profile
  const { data: profiles, error: pErr } = await adminClient
    .from("profiles")
    .select("id, full_name, email, role, country")
    .or("full_name.ilike.%Kaleem%,email.ilike.%kaleem%");

  console.log("Kaleemullah Profiles:", profiles, pErr?.message);

  const kaleemIds = (profiles || []).map((p) => p.id);

  // 2. Find All Existing Invoices for Dr. Kaleemullah
  let kaleemInvoices: any[] = [];
  if (kaleemIds.length > 0) {
    const { data: invs } = await adminClient
      .from("invoices")
      .select("id, invoice_number, salesman_id, status, created_at")
      .in("salesman_id", kaleemIds)
      .order("created_at", { ascending: false });
    kaleemInvoices = invs || [];
  }
  console.log("Dr. Kaleemullah Invoices:", kaleemInvoices);

  // 3. Find All Invoices matching D-prefix pattern (D0001, D0349, D0353, etc.)
  const { data: dInvoices } = await adminClient
    .from("invoices")
    .select("id, invoice_number, salesman_id, status, created_at")
    .ilike("invoice_number", "D%")
    .order("created_at", { ascending: false });

  console.log("All D-prefix Invoices in DB:", dInvoices);

  // 4. Check specifically if D0353 exists
  const { data: d353 } = await adminClient
    .from("invoices")
    .select("id, invoice_number")
    .eq("invoice_number", "D0353")
    .maybeSingle();

  console.log("\nDoes D0353 exist in invoices?:", d353 ? "YES" : "NO (Available)");
}

auditKaleemullah().catch(console.error);
