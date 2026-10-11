import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateTemporaryPassword, validatePassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/:id/reset-password  (Super Admin only)
 *
 * Body: { password?: string }
 *  - password given  -> sets exactly that password
 *  - password absent -> generates a random temporary password and returns it once
 *
 * The password itself is never written to logs or the audit table.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile: adminProfile, supabase } = await requireAuth(["super_admin"]);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const supplied = typeof body?.password === "string" ? body.password.trim() : "";
    const generated = supplied === "";
    const newPassword = generated ? generateTemporaryPassword() : supplied;

    const invalid = validatePassword(newPassword);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("id, full_name, email, is_active, country")
      .eq("id", id)
      .maybeSingle();

    // Admins reset passwords only for users of their own country.
    if (!target || target.country !== adminProfile.country) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required to reset passwords." },
        { status: 500 }
      );
    }

    const { error: resetError } = await adminClient.auth.admin.updateUserById(id, {
      password: newPassword,
    });

    if (resetError) {
      console.error("Password reset failed:", resetError.message);
      return NextResponse.json(
        { error: resetError.message || "Password reset failed" },
        { status: 400 }
      );
    }

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: adminProfile.id,
        performed_at: new Date().toISOString(),
        action: "RESET_PASSWORD",
        target_user: id,
        details: { method: generated ? "generated" : "admin_set", target_email: target.email },
      }]);
    } catch {
      // Audit logging must not block the reset
    }

    return NextResponse.json({
      success: true,
      user: { id: target.id, full_name: target.full_name, email: target.email, is_active: target.is_active },
      // Returned only when generated, so the admin can pass it on. Shown once in the UI.
      temporaryPassword: generated ? newPassword : undefined,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error resetting password:", error?.message);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
