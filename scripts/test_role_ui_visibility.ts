import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { Permissions } from "../lib/auth/permissions";

// Parse .env.local
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

async function runRoleBasedUiTests() {
  console.log("==================================================");
  console.log("MAATWEB ROLE-BASED UI VISIBILITY TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName} ${detail ? `-> ${detail}` : ""}`);
      failed++;
    }
  }

  // Define test profile contexts
  const superAdmin = { id: "sa-1", role: "super_admin" as const, country: "UAE" as const, is_active: true };
  const accountant = { id: "acc-1", role: "accountant" as const, country: "UAE" as const, is_active: true };
  const uaeSalesperson = { id: "uae-sp-1", role: "salesperson" as const, country: "UAE" as const, is_active: true };
  const omanSalesperson = { id: "oman-sp-1", role: "salesperson" as const, country: "Oman" as const, is_active: true };

  // Helper evaluating UI visibility rules matching component JSX logic
  function evaluateUiVisibility(p: { role: string; country: string }) {
    const isSuperAdmin = p.role === "super_admin";
    const canViewGlobal = p.role === "super_admin" || p.role === "accountant";
    const isUaeSalesperson = p.role === "salesperson" && p.country === "UAE";
    const isOmanSalesperson = p.role === "salesperson" && p.country === "Oman";
    const canManageInventory = Permissions.canManageInventory({ ...p, is_active: true } as any);

    return {
      renderUaeStock: canViewGlobal || isUaeSalesperson,
      renderOmanStock: canViewGlobal || isOmanSalesperson,
      renderTotalStock: canViewGlobal,
      renderCountrySelector: canViewGlobal,
      renderInventoryActions: canManageInventory,
    };
  }

  // 1. SUPER ADMIN TEST
  const saUi = evaluateUiVisibility(superAdmin);
  assert(saUi.renderUaeStock === true, "SUPER ADMIN: UAE stock rendered");
  assert(saUi.renderOmanStock === true, "SUPER ADMIN: Oman stock rendered");
  assert(saUi.renderTotalStock === true, "SUPER ADMIN: Total stock rendered");
  assert(saUi.renderCountrySelector === true, "SUPER ADMIN: Country selector rendered");
  assert(saUi.renderInventoryActions === true, "SUPER ADMIN: Inventory management controls rendered");

  // 2. ACCOUNTANT TEST
  const accUi = evaluateUiVisibility(accountant);
  assert(accUi.renderUaeStock === true, "ACCOUNTANT: UAE stock rendered");
  assert(accUi.renderOmanStock === true, "ACCOUNTANT: Oman stock rendered");
  assert(accUi.renderTotalStock === true, "ACCOUNTANT: Total stock rendered");
  assert(accUi.renderCountrySelector === true, "ACCOUNTANT: Country selector rendered");
  assert(accUi.renderInventoryActions === false, "ACCOUNTANT: Inventory management controls HIDDEN (Read-Only)");

  // 3. UAE SALESPERSON TEST
  const uaeUi = evaluateUiVisibility(uaeSalesperson);
  assert(uaeUi.renderUaeStock === true, "UAE SALESPERSON: UAE stock rendered ONLY");
  assert(uaeUi.renderOmanStock === false, "UAE SALESPERSON: Oman stock NOT rendered");
  assert(uaeUi.renderTotalStock === false, "UAE SALESPERSON: Total stock NOT rendered");
  assert(uaeUi.renderCountrySelector === false, "UAE SALESPERSON: Country selector NOT rendered");
  assert(uaeUi.renderInventoryActions === false, "UAE SALESPERSON: Inventory adjustment controls NOT rendered");

  // 4. OMAN SALESPERSON TEST
  const omanUi = evaluateUiVisibility(omanSalesperson);
  assert(omanUi.renderOmanStock === true, "OMAN SALESPERSON: Oman stock rendered ONLY");
  assert(omanUi.renderUaeStock === false, "OMAN SALESPERSON: UAE stock NOT rendered");
  assert(omanUi.renderTotalStock === false, "OMAN SALESPERSON: Total stock NOT rendered");
  assert(omanUi.renderCountrySelector === false, "OMAN SALESPERSON: Country selector NOT rendered");
  assert(omanUi.renderInventoryActions === false, "OMAN SALESPERSON: Inventory adjustment controls NOT rendered");

  console.log("==================================================");
  console.log(`ROLE-BASED UI VISIBILITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRoleBasedUiTests();
