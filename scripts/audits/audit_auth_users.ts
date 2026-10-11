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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== STARTING AUTH & PROFILES IDENTITY AUDIT ===");

  // 1. Fetch all Auth users
  const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers();
  if (authErr) {
    console.error("Error listing auth users:", authErr);
    process.exit(1);
  }
  const authUsers = authData?.users || [];

  // 2. Fetch all Profiles
  const { data: profileRows, error: profErr } = await adminClient
    .from("profiles")
    .select("*");
  if (profErr) {
    console.error("Error fetching profiles:", profErr);
    process.exit(1);
  }
  const profiles = profileRows || [];

  console.log(`Found ${authUsers.length} Auth Users and ${profiles.length} Profiles.`);

  const authUserMap = new Map<string, any>();
  const authUserByEmail = new Map<string, any>();
  authUsers.forEach(u => {
    authUserMap.set(u.id, u);
    if (u.email) authUserByEmail.set(u.email.toLowerCase(), u);
  });

  const profileMap = new Map<string, any>();
  const profileByEmail = new Map<string, any>();
  profiles.forEach(p => {
    profileMap.set(p.id, p);
    if (p.email) profileByEmail.set(p.email.toLowerCase(), p);
  });

  // Track Statistics
  let orphanAuthCount = 0;
  let orphanProfileCount = 0;
  let uidMismatchCount = 0;
  let duplicateCount = 0;

  const tableRows: string[] = [];

  // Union of all UIDs and emails
  const allUids = new Set([...authUserMap.keys(), ...profileMap.keys()]);

  for (const uid of allUids) {
    const authUser = authUserMap.get(uid);
    const profile = profileMap.get(uid);

    let status = "MATCHED";

    if (authUser && !profile) {
      // Check if profile exists under different UID with same email
      const matchedByEmail = authUser.email ? profileByEmail.get(authUser.email.toLowerCase()) : null;
      if (matchedByEmail) {
        status = `UID MISMATCH (Profile UID: ${matchedByEmail.id})`;
        uidMismatchCount++;
      } else {
        status = "ORPHAN AUTH (No Profile)";
        orphanAuthCount++;
      }
    } else if (!authUser && profile) {
      // Check if auth user exists under different UID with same email
      const matchedByEmail = profile.email ? authUserByEmail.get(profile.email.toLowerCase()) : null;
      if (matchedByEmail) {
        status = `UID MISMATCH (Auth UID: ${matchedByEmail.id})`;
        uidMismatchCount++;
      } else {
        status = "ORPHAN PROFILE (No Auth User)";
        orphanProfileCount++;
      }
    } else if (authUser && profile) {
      if (authUser.email?.toLowerCase() !== profile.email?.toLowerCase()) {
        status = `EMAIL MISMATCH (Auth: ${authUser.email}, Profile: ${profile.email})`;
      } else {
        status = "MATCHED & OK";
      }
    }

    tableRows.push(
      `| ${authUser ? authUser.id : "NONE"} | ${authUser ? authUser.email : "NONE"} | ${profile ? profile.id : "NONE"} | ${profile ? profile.email : "NONE"} | ${profile ? profile.role : "N/A"} | ${profile ? profile.country : "N/A"} | ${profile ? profile.is_active : "N/A"} | ${status} |`
    );
  }

  console.log("\n--- USER IDENTITY TABLE ---");
  console.log("| Auth UID | Auth Email | Profile UID | Profile Email | Role | Country | Active | Status |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  tableRows.forEach(row => console.log(row));

  // Check specific user Dr. Kaleemullah
  console.log("\n--- AUDIT SPECIFIC USER: Dr. Kaleemullah (kaleem@maatvet.com) ---");
  const kaleemAuth = authUsers.find(u => u.email?.toLowerCase() === "kaleem@maatvet.com");
  const kaleemProfile = profiles.find(p => p.email?.toLowerCase() === "kaleem@maatvet.com");

  console.log("Kaleem Auth User:", kaleemAuth ? { id: kaleemAuth.id, email: kaleemAuth.email } : "NOT FOUND");
  console.log("Kaleem Profile:", kaleemProfile ? {
    id: kaleemProfile.id,
    email: kaleemProfile.email,
    full_name: kaleemProfile.full_name,
    role: kaleemProfile.role,
    country: kaleemProfile.country,
    is_active: kaleemProfile.is_active,
  } : "NOT FOUND");

  console.log("\n--- SUMMARY STATS ---");
  console.log(`Orphan Auth Users: ${orphanAuthCount}`);
  console.log(`Orphan Profiles: ${orphanProfileCount}`);
  console.log(`UID Mismatches: ${uidMismatchCount}`);
  console.log(`Duplicate Users: ${duplicateCount}`);
}

main().catch(err => {
  console.error("Execution error:", err);
  process.exit(1);
});
