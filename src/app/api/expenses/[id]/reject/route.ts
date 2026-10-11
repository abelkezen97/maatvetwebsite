import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapExpenseFromDb } from "@/lib/db/mappers";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canApproveExpense(profile)) {
      return NextResponse.json({ error: "Forbidden: Only Accountant or Super Admin can reject expenses" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rejectionReason = body.rejectionReason || body.reason || "";
    const now = new Date().toISOString();

    const updatePayload = {
      status: "Rejected",
      rejected_by: profile.id,
      rejected_at: now,
      rejection_reason: rejectionReason,
      updated_by: profile.id,
      updated_at: now,
    };

    const adminClient = createAdminClient() || supabase;
    let { data, error } = await adminClient
      .from("expenses")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error && error.message.includes("rejected_by")) {
      const fallbackPayload = {
        status: "Rejected",
        updated_at: now,
      };
      const retry = await adminClient
        .from("expenses")
        .update(fallbackPayload)
        .eq("id", id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: `Failed to reject expense: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(mapExpenseFromDb(data));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to reject expense" }, { status: 500 });
  }
}
