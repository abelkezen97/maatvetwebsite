import { SupabaseClient } from "@supabase/supabase-js";

/**
 * STOCK BY EXPIRY DATE
 *
 * Each product's stock is kept in lots by expiry date (table product_batches,
 * view batch_stock). Invoice lines record the lot they were sold from.
 *
 * Salesmen may set any price, including below list or free (FOC). The admin is
 * warned about it on the dashboard instead. Expired stock still can't be sold
 * by a salesman.
 */

export const NEAR_EXPIRY_MONTHS = 6;

/** The last expiry date that counts as "within 6 months" of `today`. */
export function nearExpiryLimit(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + NEAR_EXPIRY_MONTHS);
  return d.toISOString().slice(0, 10);
}

export type ExpiryState = "expired" | "near" | "ok" | "unknown";

export function expiryState(expiry: string | null | undefined, today: string): ExpiryState {
  if (!expiry) return "unknown";
  const e = String(expiry).slice(0, 10);
  if (e < today) return "expired";
  if (e <= nearExpiryLimit(today)) return "near";
  return "ok";
}

export interface LineForRule {
  productId: string | null;
  productName: string;
  quantity: number;
  /** Price per unit actually charged. */
  rate: number;
  batchId: string | null;
}

/** Lowest price allowed without a discount: the quantity tier price, else the list price. */
export function minimumPrice(p: any, qty: number, omr: boolean): number {
  const n = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
  const list = n(omr ? p.selling_price_omr : p.selling_price) ?? 0;
  const t100 = n(omr ? p.price_100_omr : p.price_100);
  const t50 = n(omr ? p.price_50_omr : p.price_50);
  const t10 = n(omr ? p.price_10_omr : p.price_10);
  if (qty >= 100 && t100) return t100;
  if (qty >= 50 && t50) return t50;
  if (qty >= 10 && t10) return t10;
  return list;
}

/**
 * Checks the lines of a sale. Returns an error message, or null when fine.
 * - every lot given must belong to the product and the country;
 * - salesman: no expired lots (any price is allowed).
 */
export async function checkExpiryRules(
  client: SupabaseClient,
  opts: { country: string; isSalesman: boolean; today: string; lines: LineForRule[] }
): Promise<string | null> {
  const lines = opts.lines.filter((l) => l.productId && l.quantity > 0);
  if (lines.length === 0) return null;

  const batchIds = Array.from(new Set(lines.map((l) => l.batchId).filter(Boolean))) as string[];
  const lots = new Map<string, any>();
  if (batchIds.length > 0) {
    const { data, error } = await client
      .from("product_batches")
      .select("id, product_id, country, expiry_date, is_active")
      .in("id", batchIds);
    if (error) throw new Error(`Could not read expiry dates: ${error.message}`);
    (data || []).forEach((b: any) => lots.set(b.id, b));
  }
  for (const l of lines) {
    if (!l.batchId) continue;
    const b = lots.get(l.batchId);
    if (!b || b.product_id !== l.productId || b.country !== opts.country) {
      return `${l.productName}: the chosen expiry date does not belong to this product.`;
    }
  }

  if (!opts.isSalesman) return null;

  for (const l of lines) {
    const lot = l.batchId ? lots.get(l.batchId) : null;
    if (expiryState(lot?.expiry_date, opts.today) === "expired") {
      return `${l.productName}: this stock expired on ${String(lot.expiry_date).slice(0, 10)} and can't be sold. Ask the office.`;
    }
  }
  return null;
}
