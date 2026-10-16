import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { lotKey, mapLot } from "@/lib/db/lots";

export const dynamic = "force-dynamic";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/lots?productId=&all=1
 * Stock by expiry date in the user's country, earliest expiry first.
 * Without all=1 only lots with stock left are returned.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    const sp = req.nextUrl.searchParams;
    let q = supabase
      .from("batch_stock")
      .select("*")
      .eq("country", profile.country)
      .eq("is_active", true)
      .order("expiry_date", { ascending: true, nullsFirst: false });
    const productId = sp.get("productId");
    if (productId) q = q.eq("product_id", productId);
    if (sp.get("all") !== "1") q = q.gt("qty_remaining", 0);
    const { data, error } = await q.limit(5000);
    if (error) throw new Error(error.message);
    return NextResponse.json({ lots: (data || []).map(mapLot) });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Could not load expiry dates" }, { status: 500 });
  }
}

/**
 * POST /api/lots  { productId, expiryDate, qty }  (admin / accountant)
 * Stock received with this expiry date: adds to the lot, creating it if new.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) return NextResponse.json({ error: "Only the office can record stock by expiry." }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const productId = String(body.productId || "");
    const expiry = body.expiryDate && DAY_RE.test(String(body.expiryDate)) ? String(body.expiryDate) : null;
    const qty = Number(body.qty);
    if (!productId || !expiry || !(qty > 0)) {
      return NextResponse.json({ error: "Product, expiry date and a quantity above 0 are needed." }, { status: 400 });
    }
    const key = lotKey(expiry);
    const { data: existing } = await supabase
      .from("product_batches")
      .select("id, qty_received")
      .eq("product_id", productId)
      .eq("country", profile.country)
      .eq("batch_no", key)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("product_batches")
        .update({ qty_received: Number(existing.qty_received) + qty, is_active: true, updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, id: existing.id });
    }
    const { data, error } = await supabase
      .from("product_batches")
      .insert({
        product_id: productId,
        country: profile.country,
        batch_no: key,
        expiry_date: expiry,
        qty_received: qty,
        source: "Stock received",
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Could not save the expiry stock" }, { status: 500 });
  }
}
