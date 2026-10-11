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
      return NextResponse.json({ error: "Forbidden: Only Accountant or Super Admin can approve expenses" }, { status: 403 });
    }

    const { id } = await params;
    const now = new Date().toISOString();

    const updatePayload = {
      status: "Approved",
      approved_by: profile.id,
      approved_at: now,
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

    if (error && error.message.includes("approved_by")) {
      const fallbackPayload = {
        status: "Approved",
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
      return NextResponse.json({ error: `Failed to approve expense: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(mapExpenseFromDb(data));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to approve expense" }, { status: 500 });
  }
}
