import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { getProductStock, recordInventoryMovement } from "@/lib/db/inventory";
import { moveExpiryStock } from "@/lib/db/lots";
import { todayInDubai } from "@/lib/db/commission";
import { createAdminClient } from "@/utils/supabase/admin";
import { InventoryMovementType } from "@/types";

export const dynamic = "force-dynamic";

const PRICE_COLS = {
  UAE: { list: "selling_price", cost: "cost_price", p10: "price_10", p50: "price_50", p100: "price_100" },
  Oman: { list: "selling_price_omr", cost: "cost_price_omr", p10: "price_10_omr", p50: "price_50_omr", p100: "price_100_omr" },
} as const;

type Reason = "received" | "correction" | "damage" | "expired" | "return";

interface Change {
  productId: string;
  name?: string;
  prices?: { list?: number | null; cost?: number | null; p10?: number | null; p50?: number | null; p100?: number | null };
  stock?: { delta: number; reason: Reason; expiryDate?: string | null; note?: string };
}

/**
 * POST /api/products/bulk  { changes: Change[] }   (admin / accountant)
 * Saves price and stock changes for many products at once, in the user's
 * country. Stock changes are recorded as inventory movements and keep the
 * stock-by-expiry figures in step. Each product is saved on its own; the
 * reply lists what was saved and what failed.
 */
export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) {
      return NextResponse.json({ error: "Only the admin or accountant can update stock and prices." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const changes: Change[] = Array.isArray(body.changes) ? body.changes.slice(0, 500) : [];
    if (changes.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

    const country = profile.country === "Oman" ? "Oman" : "UAE";
    const cols = PRICE_COLS[country];
    const admin = createAdminClient() || supabase;
    const today = todayInDubai();
    const saved: string[] = [];
    const failed: { productId: string; name: string; error: string }[] = [];

    for (const c of changes) {
      const name = c.name || "Product";
      try {
        if (!c.productId) throw new Error("Missing product");

        // Prices
        if (c.prices && Object.keys(c.prices).length > 0) {
          const patch: Record<string, any> = {};
          const put = (key: keyof typeof cols, v: any, required = false) => {
            if (v === undefined) return;
            if (v === null || v === "") {
              if (required) throw new Error("List price can't be empty");
              patch[cols[key]] = null;
              return;
            }
            const n = Number(v);
            if (!isFinite(n) || n < 0) throw new Error("Prices must be 0 or more");
            patch[cols[key]] = n;
          };
          put("list", c.prices.list, true);
          put("cost", c.prices.cost);
          put("p10", c.prices.p10);
          put("p50", c.prices.p50);
          put("p100", c.prices.p100);
          if (Object.keys(patch).length > 0) {
            patch.updated_at = new Date().toISOString();
            const { error } = await supabase.from("products").update(patch).eq("id", c.productId);
            if (error) throw new Error(error.message);
          }
        }

        // Stock
        if (c.stock && Number(c.stock.delta)) {
          const delta = Math.trunc(Number(c.stock.delta));
          if (delta < 0) {
            const available = await getProductStock(supabase, c.productId, country);
            if (available < -delta) throw new Error(`Only ${available} in stock; can't take off ${-delta}`);
          }
          const reason = c.stock.reason;
          const type: InventoryMovementType =
            delta > 0
              ? reason === "return"
                ? "SALE_RETURN"
                : "ADJUSTMENT_IN"
              : reason === "damage"
                ? "DAMAGE"
                : reason === "expired"
                  ? "EXPIRY"
                  : "ADJUSTMENT_OUT";
          const label =
            reason === "received" ? "Stock received" : reason === "damage" ? "Damaged" : reason === "expired" ? "Expired, removed" : reason === "return" ? "Returned" : "Stock count correction";
          await recordInventoryMovement(supabase, {
            productId: c.productId,
            country,
            movementType: type,
            quantity: delta,
            referenceType: "MANUAL_ADJUSTMENT",
            reason: `${label} (Stock & prices)`,
            notes: c.stock.note || "",
            createdBy: profile.id,
          });
          const expiry = c.stock.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(c.stock.expiryDate) ? c.stock.expiryDate : null;
          await moveExpiryStock(admin, {
            productId: c.productId,
            country,
            delta,
            expiryDate: expiry,
            expiredFirst: reason === "expired",
            userId: profile.id,
            today,
          });
        }
        saved.push(c.productId);
      } catch (e: any) {
        failed.push({ productId: c.productId, name, error: e.message || "Not saved" });
      }
    }

    return NextResponse.json({ saved: saved.length, failed }, { status: failed.length && !saved.length ? 400 : 200 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Bulk product update failed:", error);
    return NextResponse.json({ error: error.message || "Could not save" }, { status: 500 });
  }
}
