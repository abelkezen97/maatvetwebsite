import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateTemporaryPassword, validatePassword } from "@/lib/auth/password";
import { UserRole, UserCountry } from "@/types";
import { normalizeCountries } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // The accountant may see the list (e.g. for number series); only admins change users.
    const { profile: adminProfile, supabase } = await requireAuth(["super_admin", "accountant"]);

    const adminClient = createAdminClient();
    
    if (adminClient) {
      // Users who work in this country, including a shared accountant who has
      // the other country open right now.
      const { data: profiles, error } = await adminClient
        .from("profiles")
        .select("*")
        .or(`country.eq.${adminProfile.country},countries.cs.{${adminProfile.country}}`)
        .order("created_at", { ascending: false });

      if (!error && profiles) {
        return NextResponse.json({ profiles });
      }
    }

    // Try RPC fallback (SECURITY DEFINER)
    const { data: rpcProfiles, error: rpcError } = await supabase.rpc("get_all_profiles_for_admin");
    if (!rpcError && rpcProfiles) {
      return NextResponse.json({ profiles: rpcProfiles });
    }

    // Direct table query fallback
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`country.eq.${adminProfile.country},countries.cs.{${adminProfile.country}}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching profiles:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profiles: profiles || [] });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile: adminProfile, supabase } = await requireAuth(["super_admin"]);

    const body = await request.json();
    const { email, password, full_name, phone, role, country, countries } = body;

    if (!email || !full_name) {
      return NextResponse.json({ error: "Email and full name are required" }, { status: 400 });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(full_name).trim();

    let finalPassword = password ? String(password).trim() : "";
    let temporaryPasswordDisplay: string | undefined = undefined;

    if (!finalPassword) {
      // Option B: Generate a secure temporary password if administrator did not provide one
      finalPassword = generateTemporaryPassword();
      temporaryPasswordDisplay = finalPassword;
    } else {
      const invalid = validatePassword(finalPassword);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
    }

    const validRole: UserRole = ["super_admin", "accountant", "salesperson"].includes(role) ? role : "salesperson";
    // New users always belong to the admin's own country.
    if (country && country !== adminProfile.country) {
      return NextResponse.json({ error: `You can only create users in ${adminProfile.country}.` }, { status: 403 });
    }
    const validCountry: UserCountry = adminProfile.country === "Oman" ? "Oman" : "UAE";
    // An accountant can also cover the other country (ticked on the Users page).
    const validCountries = normalizeCountries(validRole, validCountry, countries);

    // 0. Check if user with this email already exists in profiles
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required to provision auth users." },
        { status: 500 }
      );
    }

    // Primary & Exclusive Path: Use Supabase Server-side Admin Auth API
    const { data: adminData, error: adminErr } = await adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        full_name: trimmedName,
        role: validRole,
        country: validCountry,
      },
    });

    if (adminErr) {
      console.error("Error from admin.createUser:", adminErr);
      if (adminErr.message?.toLowerCase().includes("already") || adminErr.status === 422) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
      }
      return NextResponse.json({ error: adminErr.message || "Failed to create auth user" }, { status: 400 });
    }

    const newUserId = adminData?.user?.id;

    if (!newUserId) {
      return NextResponse.json({ error: "Failed to obtain created user ID" }, { status: 500 });
    }

    // Ensure profile record in `profiles` table
    const profilePayload = {
      id: newUserId,
      full_name: trimmedName,
      email: trimmedEmail,
      phone: phone ? String(phone).trim() : "",
      role: validRole,
      country: validCountry,
      countries: validCountries,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: createdProfile, error: profileError } = await supabase
      .from("profiles")
      .upsert(profilePayload)
      .select("*")
      .single();

    if (profileError) {
      console.error("Error creating profile record, rolling back auth user:", profileError);
      // ROLLBACK: Delete newly created Auth user
      try {
        await adminClient.auth.admin.deleteUser(newUserId);
      } catch (rollbackErr) {
        console.error("Failed to rollback auth user:", rollbackErr);
      }
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Administrative Audit Log
    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: adminProfile.id,
        performed_at: new Date().toISOString(),
        action: "CREATE_USER",
        target_user: newUserId,
        details: { email: trimmedEmail, role: validRole, country: validCountry, countries: validCountries },
      }]);
    } catch {
      // Non-blocking log catch
    }

    return NextResponse.json({
      success: true,
      profile: createdProfile,
      temporaryPassword: temporaryPasswordDisplay,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating user:", error);
    return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
  }
}
