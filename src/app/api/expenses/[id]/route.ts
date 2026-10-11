import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapExpenseFromDb, mapExpenseToDb } from "@/lib/db/mappers";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canViewExpenses(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view expense" }, { status: 403 });
    }

    const { id } = await params;
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Role check
    const spId = data.salesperson_id || data.employee_id || data.created_by;
    if (profile.role === "salesperson" && spId !== profile.id) {
      return NextResponse.json({ error: "Forbidden: Cannot view another salesperson's expense" }, { status: 403 });
    }

    const mapped = mapExpenseFromDb(data);
    return NextResponse.json(mapped);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch expense" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    const { id } = await params;

    const { data: existing, error: fetchErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const spId = existing.salesperson_id || existing.employee_id || existing.created_by;
    const isOwner = spId === profile.id;
    const isPending = (existing.status || "Pending") === "Pending";

    if (profile.role === "salesperson") {
      if (!isOwner || !isPending) {
        return NextResponse.json({ error: "Forbidden: You can only edit your own pending expenses" }, { status: 403 });
      }
    } else if (!Permissions.canApproveExpense(profile)) {
      return NextResponse.json({ error: "Forbidden: Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const updatePayload = mapExpenseToDb({
      ...body,
      updatedBy: profile.id,
    });

    const adminClient = createAdminClient() || supabase;
    const { data: updated, error: updateErr } = await adminClient
      .from("expenses")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json(mapExpenseFromDb(updated));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canSoftDeleteExpense(profile)) {
      return NextResponse.json({ error: "Forbidden: Only Accountant or Super Admin can soft-delete expenses" }, { status: 403 });
    }

    const { id } = await params;
    const deletePayload = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const adminClient = createAdminClient() || supabase;
    let { error } = await adminClient
      .from("expenses")
      .update(deletePayload)
      .eq("id", id);

    if (error && error.message.includes("is_deleted")) {
      const fallback = await adminClient.from("expenses").delete().eq("id", id);
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Expense soft-deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
