import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { lotKey } from "@/lib/db/lots";

export const dynamic = "force-dynamic";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/lots/:id  { expiryDate?, qtyRemaining? }  (admin / accountant)
 * Correct the expiry date (also confirms it) or the quantity left at it.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) return NextResponse.json({ error: "Only the office can change expiry stock." }, { status: 403 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const { data: lot } = await supabase.from("batch_stock").select("*").eq("id", id).maybeSingle();
    if (!lot || lot.country !== profile.country) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const patch: Record<string, any> = { updated_by: profile.id, updated_at: new Date().toISOString() };
    if (body.expiryDate !== undefined) {
      if (!DAY_RE.test(String(body.expiryDate))) return NextResponse.json({ error: "Enter a valid expiry date." }, { status: 400 });
      const key = lotKey(String(body.expiryDate));
      const { data: clash } = await supabase
        .from("product_batches")
        .select("id")
        .eq("product_id", lot.product_id)
        .eq("country", lot.country)
        .eq("batch_no", key)
        .neq("id", id)
        .maybeSingle();
      if (clash) return NextResponse.json({ error: "This product already has stock with that expiry date. Change that one's quantity instead." }, { status: 409 });
      patch.expiry_date = body.expiryDate;
      patch.batch_no = key;
      patch.needs_check = false;
      patch.notes = null;
    }
    if (body.qtyRemaining !== undefined) {
      const left = Number(body.qtyRemaining);
      if (!(left >= 0)) return NextResponse.json({ error: "Quantity can't be negative." }, { status: 400 });
      patch.qty_received = Number(lot.qty_sold) + left;
    }
    if (body.confirm === true) patch.needs_check = false;

    const { error } = await supabase.from("product_batches").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Could not update" }, { status: 500 });
  }
}
