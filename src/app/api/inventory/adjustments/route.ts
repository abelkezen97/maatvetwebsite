import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { recordInventoryMovement, getProductStock } from "@/lib/db/inventory";
import { InventoryMovementType, UserCountry } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    // SUPER ADMIN ONLY authority for manual stock adjustments
    if (!Permissions.canManageInventory(profile)) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Admin has authority to perform manual stock adjustments." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { productId, country, adjustmentAction, quantity, reason, notes } = body;

    if (!productId || !country || !adjustmentAction || !quantity) {
      return NextResponse.json(
        { error: "Missing required fields (productId, country, adjustmentAction, quantity)" },
        { status: 400 }
      );
    }

    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number" }, { status: 400 });
    }

    const targetCountry: UserCountry = country === "Oman" ? "Oman" : "UAE";

    let movementType: InventoryMovementType = "ADJUSTMENT_IN";
    let finalQty = numQty;

    // Evaluate action
    if (adjustmentAction === "ADD" || adjustmentAction === "ADJUSTMENT_IN") {
      movementType = "ADJUSTMENT_IN";
      finalQty = numQty; // Addition IN (+qty)
    } else if (adjustmentAction === "DEDUCT" || adjustmentAction === "ADJUSTMENT_OUT") {
      movementType = "ADJUSTMENT_OUT";
      finalQty = -numQty; // Deduction OUT (-qty)
    } else if (adjustmentAction === "DAMAGE") {
      movementType = "DAMAGE";
      finalQty = -numQty; // Deduction OUT (-qty)
    } else if (adjustmentAction === "EXPIRY") {
      movementType = "EXPIRY";
      finalQty = -numQty; // Deduction OUT (-qty)
    } else if (adjustmentAction === "SALE_RETURN") {
      movementType = "SALE_RETURN";
      finalQty = numQty; // Return IN (+qty)
    } else {
      return NextResponse.json({ error: "Invalid adjustmentAction" }, { status: 400 });
    }

    // Protect against negative stock if deducting
    if (finalQty < 0) {
      const currentAvailable = await getProductStock(supabase, productId, targetCountry);
      const deductionAmount = Math.abs(finalQty);
      if (currentAvailable < deductionAmount) {
        return NextResponse.json(
          { error: `Insufficient stock to perform deduction. Available quantity: ${currentAvailable}.` },
          { status: 400 }
        );
      }
    }

    const movement = await recordInventoryMovement(supabase, {
      productId,
      country: targetCountry,
      movementType,
      quantity: finalQty,
      referenceType: "MANUAL_ADJUSTMENT",
      reason: reason || "Manual Super Admin Adjustment",
      notes: notes || "",
      createdBy: profile.id,
    });

    return NextResponse.json({ success: true, movement });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error processing stock adjustment:", error);
    return NextResponse.json({ error: error.message || "Failed to process stock adjustment" }, { status: 500 });
  }
}
