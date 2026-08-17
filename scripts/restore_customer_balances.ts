import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
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

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== RESTORING AUTHORITATIVE IMPORTED OPENING BALANCES ===");

  const balancesToRestore: Record<string, number> = {
    "CUST-KAL-001": 280.00,
    "CUST-KAL-002": 480.00,
    "CUST-KAL-003": 3556.00,
  };

  for (const [code, amount] of Object.entries(balancesToRestore)) {
    // Try updating opening_balance and pending_balance
    const updatePayload: Record<string, any> = {
      pending_balance: amount,
      updated_at: new Date().toISOString(),
    };

    // Check if opening_balance exists in table
    const { error } = await supabase
      .from("customers")
      .update({ ...updatePayload, opening_balance: amount })
      .eq("customer_code", code);

    if (error && error.message.includes("opening_balance")) {
      const { error: retryErr } = await supabase
        .from("customers")
        .update(updatePayload)
        .eq("customer_code", code);

      if (retryErr) {
        console.error(`Failed to restore ${code}:`, retryErr.message);
      } else {
        console.log(`✓ Restored ${code}: pending_balance = ${amount}`);
      }
    } else if (error) {
      console.error(`Failed to restore ${code}:`, error.message);
    } else {
      console.log(`✓ Restored ${code}: opening_balance = ${amount}, pending_balance = ${amount}`);
    }
  }

  // Verify DB state
  const { data: verified } = await supabase
    .from("customers")
    .select("customer_code, company_name, pending_balance")
    .in("customer_code", Object.keys(balancesToRestore));

  console.log("\nVerified DB Rows:");
  verified?.forEach((r) => console.log(`- ${r.customer_code} (${r.company_name}): pending_balance = ${r.pending_balance}`));
}

main().catch(console.error);
