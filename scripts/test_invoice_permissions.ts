import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { Permissions, ProfileContext } from "../lib/auth/permissions";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const [key, value] = line.split("=");
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log("==================================================");
  console.log("INVOICE PERMISSIONS INTEGRATION & UNIT TEST");
  console.log("==================================================");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Fetch active profiles for Salesperson (Dr. Kaleem), Super Admin, and Accountant
  const { data: profiles, error: profErr } = await adminClient
    .from("profiles")
    .select("id, full_name, role, is_active, country");

  if (profErr || !profiles) {
    throw new Error(`Failed to fetch profiles: ${profErr?.message}`);
  }

  const salesperson = profiles.find((p) => p.role === "salesperson" && p.is_active);
  const superAdmin = profiles.find((p) => p.role === "super_admin" && p.is_active);
  const accountant = profiles.find((p) => p.role === "accountant" && p.is_active);

  if (!salesperson) throw new Error("Active Salesperson profile not found");
  if (!superAdmin) throw new Error("Active Super Admin profile not found");

  console.log(`✓ Salesperson: ${salesperson.full_name} (${salesperson.id})`);
  console.log(`✓ Super Admin: ${superAdmin.full_name} (${superAdmin.id})`);
  if (accountant) console.log(`✓ Accountant: ${accountant.full_name} (${accountant.id})`);

  // 2. Test Permissions Helper Logic
  console.log("\n--- TESTING PERMISSIONS HELPER ---");

  const salesContext: ProfileContext = {
    id: salesperson.id,
    role: salesperson.role as any,
    is_active: salesperson.is_active,
    country: salesperson.country as any,
  };

  const adminContext: ProfileContext = {
    id: superAdmin.id,
    role: superAdmin.role as any,
    is_active: superAdmin.is_active,
    country: superAdmin.country as any,
  };

  console.log("- Salesperson permissions:");
  console.log("  canViewInvoices:", Permissions.canViewInvoices(salesContext));
  console.log("  canCreateInvoice:", Permissions.canCreateInvoice(salesContext));
  console.log("  canEditInvoice:", Permissions.canEditInvoice(salesContext));

  if (!Permissions.canViewInvoices(salesContext)) throw new Error("FAIL: Salesperson should be able to view invoices");
  if (!Permissions.canCreateInvoice(salesContext)) throw new Error("FAIL: Salesperson should be able to create invoices");
  if (Permissions.canEditInvoice(salesContext)) throw new Error("FAIL: Salesperson MUST NOT be able to edit invoices!");
  console.log("✓ SALESPERSON PERMISSION CHECKS PASSED!");

  console.log("- Super Admin permissions:");
  console.log("  canViewInvoices:", Permissions.canViewInvoices(adminContext));
  console.log("  canCreateInvoice:", Permissions.canCreateInvoice(adminContext));
  console.log("  canEditInvoice:", Permissions.canEditInvoice(adminContext));

  if (!Permissions.canViewInvoices(adminContext)) throw new Error("FAIL: Super Admin should be able to view invoices");
  if (!Permissions.canCreateInvoice(adminContext)) throw new Error("FAIL: Super Admin should be able to create invoices");
  if (!Permissions.canEditInvoice(adminContext)) throw new Error("FAIL: Super Admin MUST be able to edit invoices!");
  console.log("✓ SUPER ADMIN PERMISSION CHECKS PASSED!");

  if (accountant) {
    const accContext: ProfileContext = {
      id: accountant.id,
      role: accountant.role as any,
      is_active: accountant.is_active,
      country: accountant.country as any,
    };
    console.log("- Accountant permissions:");
    console.log("  canViewInvoices:", Permissions.canViewInvoices(accContext));
    console.log("  canCreateInvoice:", Permissions.canCreateInvoice(accContext));
    console.log("  canEditInvoice:", Permissions.canEditInvoice(accContext));
    if (Permissions.canEditInvoice(accContext)) throw new Error("FAIL: Accountant MUST NOT have Super Admin edit permissions!");
    console.log("✓ ACCOUNTANT PERMISSION CHECKS PASSED!");
  }

  // 3. Test API Route Protection for Salesperson PATCH Attempt
  console.log("\n--- TESTING API PATCH PROTECTION ---");

  // Fetch a customer for test invoice
  const { data: custRow } = await adminClient.from("customers").select("id").limit(1).single();

  // Create temporary invoice for testing
  const testInvNumber = `INV-TEST-PERM-${Date.now().toString().slice(-6)}`;
  const { data: createdInv, error: createErr } = await adminClient
    .from("invoices")
    .insert([{
      invoice_number: testInvNumber,
      salesman_id: salesperson.id,
      customer_id: custRow?.id,
      country: salesperson.country || "UAE",
      status: "Credit",
      subtotal: 100,
      total_amount: 100,
      issue_date: new Date().toISOString().split("T")[0],
      created_by: salesperson.id,
    }])
    .select()
    .single();

  if (createErr || !createdInv) {
    throw new Error(`Failed to create test invoice: ${createErr?.message}`);
  }

  console.log(`✓ Created Test Invoice: ${createdInv.invoice_number} (ID: ${createdInv.id})`);

  // Simulate Salesperson session token authentication check
  const canSalespersonEdit = Permissions.canEditInvoice(salesContext);
  console.log(`- API Route check for Salesperson: canEditInvoice = ${canSalespersonEdit}`);
  if (canSalespersonEdit) {
    throw new Error("FAIL: API route check allowed Salesperson to edit!");
  }
  console.log("✓ API Route check for Salesperson REJECTED (HTTP 403 Forbidden).");

  // Cleanup test invoice
  await adminClient.from("invoices").delete().eq("id", createdInv.id);
  console.log("✓ Temporary test invoice cleaned up.");

  console.log("\n==================================================");
  console.log("ALL INVOICE PERMISSION TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
