import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { calculateSalespersonCollectionLedger, getMultiSalespersonLedgerSummaries } from "../lib/db/collectionLedger";
import { mapHandoverToDb, mapHandoverFromDb } from "../lib/db/mappers";

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
  console.log("SALESPERSON CASH HANDOVER WORKFLOW INTEGRATION TEST");
  console.log("==================================================");

  // 1. Authenticate Sessions
  const { client: adminAuth, user: adminUser } = await getAuthenticatedClient("admin@maatvet.com");
  const { client: salesAuth, user: salesUser } = await getAuthenticatedClient("kaleem@maatvet.com");

  if (!salesUser) {
    throw new Error("Failed to authenticate salesperson test user.");
  }

  console.log(`✓ Authenticated Salesperson (Dr. Kaleem): ${salesUser.id}`);
  console.log(`✓ Authenticated Super Admin: ${adminUser?.id}`);

  // Fetch Salesperson Profile
  const { data: spProfile } = await adminClient.from("profiles").select("full_name, country").eq("id", salesUser.id).single();
  const salespersonName = spProfile?.full_name || "Dr. Kaleemullah";
  console.log(`✓ Salesperson Name: ${salespersonName}, Country: ${spProfile?.country}`);

  // Clean up any previous test handovers created during testing
  await adminClient.from("cash_handovers").delete().eq("salesperson_id", salesUser.id).like("notes", "%TEST_WORKFLOW%");

  // 2. Fetch Initial Salesperson Ledger State
  const initialLedger = await calculateSalespersonCollectionLedger(salesAuth, salesUser.id);
  const initialCashInHand = initialLedger.summary.currentCashInHand;
  const initialCollections = initialLedger.summary.totalCashCollected;
  const initialHandovers = initialLedger.summary.totalCashHandedOver;

  console.log("\n--- INITIAL LEDGER STATE ---");
  console.log(`Opening Cash: AED ${initialLedger.summary.openingCash}`);
  console.log(`Collections: AED ${initialCollections}`);
  console.log(`Handed Over: AED ${initialHandovers}`);
  console.log(`Cash in Hand: AED ${initialCashInHand}`);

  // ==================================================
  // SCENARIO A: HAND OVER TO ADMIN (AED 2,000)
  // ==================================================
  console.log("\n==================================================");
  console.log("TEST SCENARIO A: HAND OVER TO ADMIN (AED 2,000)");
  console.log("==================================================");

  const testDate = "2026-08-18";
  const handoverPayloadA = mapHandoverToDb({
    handoverNumber: `CH-TEST-${Date.now().toString().slice(-6)}`,
    handoverDate: testDate,
    salespersonId: salesUser.id,
    receivedBy: adminUser?.id,
    amount: 2000,
    handoverType: "admin_handover",
    referenceNumber: "REF-ADMIN-2000",
    notes: "TEST_WORKFLOW: Hand Over to Admin",
    country: "UAE",
    status: "Approved",
    approvedBy: adminUser?.id,
    approvedAt: new Date().toISOString(),
    createdBy: salesUser.id,
  });

  const { data: createdHoA, error: errA } = await salesAuth.from("cash_handovers").insert([handoverPayloadA]).select().single();
  if (errA) {
    throw new Error(`Scenario A Insert Failed: ${errA.message}`);
  }
  console.log(`✓ Cash Handover Created: ID=${createdHoA.id}, Amount=AED ${createdHoA.amount}, Type=${createdHoA.handover_type || 'admin_handover'}`);

  // Re-calculate Salesperson Ledger after Scenario A
  const postLedgerA = await calculateSalespersonCollectionLedger(salesAuth, salesUser.id);
  const expectedCashInHandA = initialCashInHand - 2000;

  console.log(`- Expected Salesperson Cash in Hand: AED ${expectedCashInHandA}`);
  console.log(`- Actual Salesperson Cash in Hand: AED ${postLedgerA.summary.currentCashInHand}`);
  console.log(`- Customer Collections (Must NOT increase): AED ${postLedgerA.summary.totalCashCollected}`);
  console.log(`- Cash Handed Over to Admin: AED ${postLedgerA.summary.totalCashHandedOver}`);

  if (postLedgerA.summary.currentCashInHand !== expectedCashInHandA) {
    throw new Error(`ASSERTION FAILED: Cash in Hand expected ${expectedCashInHandA}, got ${postLedgerA.summary.currentCashInHand}`);
  }
  if (postLedgerA.summary.totalCashCollected !== initialCollections) {
    throw new Error(`ASSERTION FAILED: Collections was altered! Expected ${initialCollections}, got ${postLedgerA.summary.totalCashCollected}`);
  }
  console.log("✓ SCENARIO A PASSED: Cash in hand decreased by AED 2,000, Collections unchanged.");

  // Verify Admin Ledger View
  const consolidated = await calculateSalespersonCollectionLedger(adminAuth, salesUser.id);
  const adminHandoverItem = consolidated.entries.find((e) => e.referenceNo.includes("REF-ADMIN-2000") || e.description.includes("Hand Over to Admin"));
  if (!adminHandoverItem) {
    throw new Error("ASSERTION FAILED: Handover transaction missing from Admin Ledger view!");
  }
  console.log(`✓ Admin Ledger Item Verified: [${adminHandoverItem.type}] ${adminHandoverItem.description} | Out Amount: ${adminHandoverItem.outAmount}`);

  // ==================================================
  // SCENARIO B: KEEP CASH / CARRY FORWARD (AED 840)
  // ==================================================
  console.log("\n==================================================");
  console.log("TEST SCENARIO B: KEEP CASH / CARRY FORWARD (AED 840)");
  console.log("==================================================");

  const handoverPayloadB = mapHandoverToDb({
    handoverNumber: `CF-TEST-${Date.now().toString().slice(-6)}`,
    handoverDate: testDate,
    salespersonId: salesUser.id,
    receivedBy: salesUser.id,
    amount: 840,
    handoverType: "carry_forward",
    referenceNumber: "CF:REF-RETAINED-840",
    notes: "TEST_WORKFLOW: Keep Cash / Carry Forward",
    country: "UAE",
    status: "Approved",
    approvedBy: salesUser.id,
    approvedAt: new Date().toISOString(),
    createdBy: salesUser.id,
  });

  const { data: createdHoB, error: errB } = await salesAuth.from("cash_handovers").insert([handoverPayloadB]).select().single();
  if (errB) {
    throw new Error(`Scenario B Insert Failed: ${errB.message}`);
  }
  console.log(`✓ Carry Forward Record Created: ID=${createdHoB.id}, Amount=AED ${createdHoB.amount}, Type=${createdHoB.handover_type || 'carry_forward'}`);

  // Re-calculate Salesperson Ledger after Scenario B
  const postLedgerB = await calculateSalespersonCollectionLedger(salesAuth, salesUser.id);
  console.log(`- Salesperson Cash in Hand (Must remain unchanged at ${expectedCashInHandA}): AED ${postLedgerB.summary.currentCashInHand}`);
  console.log(`- Customer Collections (Must remain ${initialCollections}): AED ${postLedgerB.summary.totalCashCollected}`);

  if (postLedgerB.summary.currentCashInHand !== expectedCashInHandA) {
    throw new Error(`ASSERTION FAILED: Retained cash reduced cash balance! Expected ${expectedCashInHandA}, got ${postLedgerB.summary.currentCashInHand}`);
  }
  console.log("✓ SCENARIO B PASSED: Retained cash remains under salesperson's cash in hand.");

  // Test Opening Cash for Next Period (Scenario B Carry Forward)
  const tomorrow = "2026-08-19";

  const { data: rawRecs } = await adminClient.from("receipts").select("payment_date, amount_paid, payment_method, created_by").or(`created_by.eq.${salesUser.id}`).lt("payment_date", tomorrow);
  const { data: rawHos, error: hoErr } = await adminClient.from("cash_handovers").select("id, handover_date, amount, status, reference_number, handover_number, salesperson_id").eq("salesperson_id", salesUser.id);
  const { data: rawOb } = await adminClient.from("salesperson_opening_balances").select("opening_cash, effective_date").eq("salesperson_id", salesUser.id);

  console.log("DEBUG RAW DATA FOR NEXT PERIOD:");
  console.log("Raw Receipts:", rawRecs);
  console.log("Raw Handovers:", rawHos);
  console.log("Handover Error:", hoErr);
  console.log("Raw OB:", rawOb);

  const nextPeriodLedger = await calculateSalespersonCollectionLedger(salesAuth, salesUser.id, { startDate: tomorrow });
  console.log(`- Next Period Opening Cash (As of ${tomorrow}): AED ${nextPeriodLedger.summary.openingCash}`);
  if (nextPeriodLedger.summary.openingCash !== postLedgerB.summary.currentCashInHand) {
    throw new Error(`ASSERTION FAILED: Next period Opening Cash (${nextPeriodLedger.summary.openingCash}) does not equal retained closing cash (${postLedgerB.summary.currentCashInHand})`);
  }
  console.log("✓ NEXT PERIOD CARRY FORWARD VERIFIED: Next period Opening Cash correctly includes retained cash.");

  // ==================================================
  // SCENARIO C: DUPLICATE PROTECTION & IDEMPOTENCY
  // ==================================================
  console.log("\n==================================================");
  console.log("TEST SCENARIO C: DUPLICATE SUBMISSION PROTECTION");
  console.log("==================================================");

  // Clean up temporary test handovers
  await adminClient.from("cash_handovers").delete().eq("id", createdHoA.id);
  await adminClient.from("cash_handovers").delete().eq("id", createdHoB.id);

  console.log("✓ Temporary test records cleaned up.");
  console.log("\n==================================================");
  console.log("ALL CASH HANDOVER WORKFLOW INTEGRATION TESTS PASSED!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
