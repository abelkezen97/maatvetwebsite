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
      return NextResponse.json({ error: "Forbidden: Only Accountant or Super Admin can confirm cash handovers" }, { status: 403 });
    }

    const { id } = await params;
    const now = new Date().toISOString();

    const updatePayload = {
      status: "Approved",
      received_by: profile.id,
      approved_by: profile.id,
      approved_at: now,
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
      return NextResponse.json({ error: `Failed to confirm cash handover: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(mapHandoverFromDb(data));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to confirm cash handover" }, { status: 500 });
  }
}
