import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const env: Record<string, string> = {};
envFile.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length > 0) {
    env[key.trim()] = vals.join("=").trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("=== PHASE 1: INSPECTING LIVE INFORMATION_SCHEMA FOR PUBLIC.EXPENSES ===");

  // 1. Query sample row directly
  const { data: rows, error: rowErr } = await supabase.from("expenses").select("*").limit(1);
  if (rows && rows.length > 0) {
    console.log("Existing columns from sample row:", Object.keys(rows[0]));
  } else {
    console.log("No rows or error:", rowErr);
  }

  // 2. Check if get_auth_profile function exists
  const { data: profFunc, error: profErr } = await supabase.rpc("get_auth_profile" as any);
  console.log("get_auth_profile RPC test:", profErr ? profErr.message : profFunc);
}

run().catch(console.error);
