import { ExpiryLot } from "@/types";

export function mapLot(r: any): ExpiryLot {
  return {
    id: r.id,
    productId: r.product_id,
    country: r.country,
    expiryDate: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
    qtyReceived: Number(r.qty_received) || 0,
    qtySold: Number(r.qty_sold) || 0,
    qtyRemaining: Number(r.qty_remaining) || 0,
    daysToExpiry: r.days_to_expiry === null || r.days_to_expiry === undefined ? null : Number(r.days_to_expiry),
    needsCheck: Boolean(r.needs_check),
    notes: r.notes || undefined,
  };
}

export const lotKey = (expiry: string | null) => `EXP-${expiry || "NONE"}`;

/**
 * Keeps stock-by-expiry in step with a stock change (server side).
 * - in (delta > 0) with an expiry date: added to that date's lot (created if new);
 *   without a date nothing is recorded by expiry.
 * - out (delta < 0): taken from lots with stock, expired ones first when
 *   `expiredFirst`, otherwise earliest expiry first.
 */
export async function moveExpiryStock(
  client: any,
  opts: { productId: string; country: string; delta: number; expiryDate?: string | null; expiredFirst?: boolean; userId: string; today: string }
): Promise<void> {
  const now = new Date().toISOString();
  if (opts.delta > 0) {
    if (!opts.expiryDate) return;
    const key = lotKey(opts.expiryDate);
    const { data: existing } = await client
      .from("product_batches")
      .select("id, qty_received")
      .eq("product_id", opts.productId)
      .eq("country", opts.country)
      .eq("batch_no", key)
      .maybeSingle();
    if (existing) {
      await client
        .from("product_batches")
        .update({ qty_received: Number(existing.qty_received) + opts.delta, is_active: true, updated_by: opts.userId, updated_at: now })
        .eq("id", existing.id);
    } else {
      await client.from("product_batches").insert({
        product_id: opts.productId,
        country: opts.country,
        batch_no: key,
        expiry_date: opts.expiryDate,
        qty_received: opts.delta,
        source: "Stock received",
        created_by: opts.userId,
        updated_by: opts.userId,
      });
    }
    return;
  }
  let left = -opts.delta;
  if (left <= 0) return;
  const { data: lots } = await client
    .from("batch_stock")
    .select("id, expiry_date, qty_remaining")
    .eq("product_id", opts.productId)
    .eq("country", opts.country)
    .gt("qty_remaining", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  const ordered = (lots || []).slice();
  if (opts.expiredFirst) {
    ordered.sort((a: any, b: any) => {
      const ae = a.expiry_date && String(a.expiry_date) < opts.today ? 0 : 1;
      const be = b.expiry_date && String(b.expiry_date) < opts.today ? 0 : 1;
      return ae - be;
    });
  }
  for (const lot of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, Number(lot.qty_remaining));
    const { data: row } = await client.from("product_batches").select("qty_received").eq("id", lot.id).single();
    await client
      .from("product_batches")
      .update({ qty_received: Number(row.qty_received) - take, updated_by: opts.userId, updated_at: now })
      .eq("id", lot.id);
    left -= take;
  }
}
