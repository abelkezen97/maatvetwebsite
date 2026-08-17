import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { UserRole, UserCountry } from "@/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile: adminProfile, supabase } = await requireAuth(["super_admin"]);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { full_name, phone, role, country, is_active, password } = body;

    // 1. SELF-LOCKOUT PREVENTION
    if (id === adminProfile.id) {
      if (is_active === false) {
        return NextResponse.json(
          { error: "Self-lockout prevented: You cannot deactivate your own account." },
          { status: 400 }
        );
      }
      if (role && role !== "super_admin") {
        return NextResponse.json(
          { error: "Self-lockout prevented: You cannot remove your own Super Admin role." },
          { status: 400 }
        );
      }
    }

    // 2. ACTIVE SUPER ADMIN GUARANTEE (If modifying a super_admin)
    if (is_active === false || (role && role !== "super_admin")) {
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();

      if (targetProfile?.role === "super_admin") {
        const { data: activeAdmins } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "super_admin")
          .eq("is_active", true);

        if (!activeAdmins || activeAdmins.length <= 1) {
          return NextResponse.json(
            { error: "Governance Error: System must maintain at least one active Super Admin user." },
            { status: 400 }
          );
        }
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) updatePayload.full_name = String(full_name).trim();
    if (phone !== undefined) updatePayload.phone = String(phone).trim();
    if (role !== undefined && ["super_admin", "accountant", "salesperson"].includes(role)) {
      updatePayload.role = role as UserRole;
    }
    if (country !== undefined && ["UAE", "Oman"].includes(country)) {
      updatePayload.country = country as UserCountry;
    }
    if (is_active !== undefined) {
      updatePayload.is_active = Boolean(is_active);
    }

    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (profileError) {
      console.error("Error updating user profile:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Optional Password Reset via Admin API
    let passwordResetPerformed = false;
    if (password && String(password).trim().length >= 6) {
      try {
        const adminClient = createAdminClient();
        if (adminClient) {
          const { error: pwdError } = await adminClient.auth.admin.updateUserById(id, {
            password: String(password).trim(),
          });
          if (!pwdError) passwordResetPerformed = true;
        }
      } catch {
        // Admin API catch
      }
    }

    // 3. ADMINISTRATIVE AUDIT LOGGING
    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: adminProfile.id,
        performed_at: new Date().toISOString(),
        action: passwordResetPerformed ? "UPDATE_USER_AND_RESET_PASSWORD" : "UPDATE_USER",
        target_user: id,
        details: updatePayload,
      }]);
    } catch {
      // Non-blocking log catch
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating user:", error);
    return NextResponse.json({ error: error.message || "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile: adminProfile, supabase } = await requireAuth(["super_admin"]);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // SELF-LOCKOUT PREVENTION
    if (id === adminProfile.id) {
      return NextResponse.json(
        { error: "Self-lockout prevented: You cannot deactivate your own account." },
        { status: 400 }
      );
    }

    // ACTIVE SUPER ADMIN GUARANTEE
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", id)
      .maybeSingle();

    if (targetProfile?.role === "super_admin") {
      const { data: activeAdmins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "super_admin")
        .eq("is_active", true);

      if (!activeAdmins || activeAdmins.length <= 1) {
        return NextResponse.json(
          { error: "Governance Error: System must maintain at least one active Super Admin user." },
          { status: 400 }
        );
      }
    }

    // NEVER PHYSICALLY DELETE USERS - SET is_active = false
    const { data, error } = await supabase
      .from("profiles")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Error deactivating user:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ADMINISTRATIVE AUDIT LOGGING
    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: adminProfile.id,
        performed_at: new Date().toISOString(),
        action: "DEACTIVATE_USER",
        target_user: id,
        details: { target_user_role: targetProfile?.role },
      }]);
    } catch {
      // Non-blocking log catch
    }

    return NextResponse.json({ success: true, message: "User deactivated successfully", profile: data });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deactivating user:", error);
    return NextResponse.json({ error: error.message || "Failed to deactivate user" }, { status: 500 });
  }
}
