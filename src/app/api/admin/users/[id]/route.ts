import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { UserRole } from "@/types";
import { managesUser, normalizeCountries } from "@/lib/auth/permissions";

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
    const { full_name, phone, role, country, countries, is_active, password } = body;

    // Admins manage users who work in their country (a shared accountant counts
    // for both), and cannot move anyone to another country.
    const { data: targetUser } = await supabase
      .from("profiles")
      .select("id, country, countries, role")
      .eq("id", id)
      .maybeSingle();
    if (!targetUser || !managesUser(adminProfile, targetUser)) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (country !== undefined && country !== targetUser.country) {
      return NextResponse.json({ error: "Users cannot be moved to another country." }, { status: 400 });
    }

    // Passwords are reset through POST /api/admin/users/:id/reset-password,
    // which reports failures instead of silently ignoring them.
    if (password !== undefined && password !== "") {
      return NextResponse.json(
        { error: "Use the Reset password action to change a user's password." },
        { status: 400 }
      );
    }

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
          { error: "Self-lockout prevented: You cannot remove your own Admin role." },
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
          .eq("country", adminProfile.country)
          .eq("is_active", true);

        if (!activeAdmins || activeAdmins.length <= 1) {
          return NextResponse.json(
            { error: "Each country must keep at least one active Admin." },
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
    if (is_active !== undefined) {
      updatePayload.is_active = Boolean(is_active);
    }

    // Countries an accountant covers (ticked on the Users page). Always keeps
    // this admin's country; other roles work in one country only.
    const finalRole = (updatePayload.role || targetUser.role) as string;
    if (countries !== undefined || updatePayload.role !== undefined) {
      const requested = countries !== undefined ? countries : targetUser.countries || [];
      const list = normalizeCountries(finalRole, adminProfile.country, requested);
      updatePayload.countries = list;
      // Their open country must stay one they cover.
      if (list.length === 0 && targetUser.country !== adminProfile.country) {
        updatePayload.country = adminProfile.country;
      }
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

    // 3. ADMINISTRATIVE AUDIT LOGGING
    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: adminProfile.id,
        performed_at: new Date().toISOString(),
        action: "UPDATE_USER",
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

    // ACTIVE ADMIN GUARANTEE (per country)
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("role, country, countries")
      .eq("id", id)
      .maybeSingle();

    if (!targetProfile || !managesUser(adminProfile, targetProfile)) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetProfile?.role === "super_admin") {
      const { data: activeAdmins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "super_admin")
        .eq("country", adminProfile.country)
        .eq("is_active", true);

      if (!activeAdmins || activeAdmins.length <= 1) {
        return NextResponse.json(
          { error: "Each country must keep at least one active Admin." },
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
