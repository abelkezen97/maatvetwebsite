import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapHandoverFromDb } from "@/lib/db/mappers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canApproveHandover(profile)) {
      return NextResponse.json({ error: "Forbidden: Only Accountant or Super Admin can reject cash handovers" }, { status: 403 });
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

    const { data, error } = await supabase
      .from("cash_handovers")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `Failed to reject cash handover: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(mapHandoverFromDb(data));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to reject cash handover" }, { status: 500 });
  }
}
