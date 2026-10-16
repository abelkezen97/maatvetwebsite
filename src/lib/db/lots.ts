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
