import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { CREDIT_NOTE_SELECT, applyApprovedCreditNote, mapCreditNoteFromDb } from "@/lib/db/creditNotes";

export const dynamic = "force-dynamic";

/**
 * POST /api/credit-notes/:id   { action: "approve" | "reject", reason?: string }
 * Admin or Accountant of the note's country. Only Pending notes can change.
 * Approval puts restocked goods back and lowers the invoice / customer balance.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) {
      return NextResponse.json({ error: "Forbidden: Only an Admin or Accountant can approve credit notes." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    }

    const admin = createAdminClient() || supabase;
    const now = new Date().toISOString();
    const update =
      action === "approve"
        ? { status: "Approved", approved_by: profile.id, approved_at: now, updated_at: now }
        : { status: "Rejected", rejected_by: profile.id, rejected_at: now, rejection_reason: reason || null, updated_at: now };

    // Only a Pending note of the caller's country moves (guards double clicks).
    const { data: updated, error } = await admin
      .from("credit_notes")
      .update(update)
      .eq("id", id)
      .eq("country", profile.country)
      .eq("status", "Pending")
      .eq("is_deleted", false)
      .select(CREDIT_NOTE_SELECT)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) {
      return NextResponse.json({ error: "Credit note not found, or it was already approved or rejected." }, { status: 409 });
    }

    const note = mapCreditNoteFromDb(updated);
    if (action === "approve") {
      await applyApprovedCreditNote(
        admin,
        { id: note.id, creditNoteNumber: note.creditNoteNumber, customerId: note.customerId, country: note.country },
        (note.items || []).map((i) => ({ productId: i.productId, quantity: i.quantity, restock: i.restock })),
        profile.id
      );
    }

    try {
      await supabase.from("admin_audit_logs").insert([{
        performed_by: profile.id,
        action: action === "approve" ? "CREDIT_NOTE_APPROVED" : "CREDIT_NOTE_REJECTED",
        details: { credit_note_id: id, number: note.creditNoteNumber, total: note.total, reason: reason || undefined },
      }]);
    } catch {
      // audit logging must not block the action
    }

    return NextResponse.json({ success: true, creditNote: note });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Credit note approval failed:", error);
    return NextResponse.json({ error: error.message || "Failed to update credit note" }, { status: 500 });
  }
}
