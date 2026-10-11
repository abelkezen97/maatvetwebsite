import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { getAllProductsStockSummary, recordInventoryMovement } from "@/lib/db/inventory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewInventory(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view inventory" }, { status: 403 });
    }

    const { summaries, metrics } = await getAllProductsStockSummary(supabase, profile);
    return NextResponse.json({ summaries, metrics });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error fetching inventory summary:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch inventory summary" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    // SUPER ADMIN ONLY authority for adding Opening Stock or Stock Received
    if (!Permissions.canManageInventory(profile)) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Admin can add opening stock or receive stock from suppliers." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { productId, country, movementType, quantity, reason, notes } = body;

    if (!productId || !country || !movementType || !quantity) {
      return NextResponse.json({ error: "Missing required fields (productId, country, movementType, quantity)" }, { status: 400 });
    }

    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number" }, { status: 400 });
    }

    const validTypes = ["OPENING_STOCK", "STOCK_RECEIVED"];
    if (!validTypes.includes(movementType)) {
      return NextResponse.json({ error: `Invalid movement type for this endpoint. Expected: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const movement = await recordInventoryMovement(supabase, {
      productId,
      country: country === "Oman" ? "Oman" : "UAE",
      movementType,
      quantity: numQty, // Addition IN (+qty)
      referenceType: movementType === "OPENING_STOCK" ? "OPENING" : "STOCK_RECEIVING",
      reason: reason || (movementType === "OPENING_STOCK" ? "Initial Opening Stock" : "Supplier Shipment"),
      notes: notes || "",
      createdBy: profile.id,
    });

    return NextResponse.json({ success: true, movement });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error posting opening/receiving stock:", error);
    return NextResponse.json({ error: error.message || "Failed to process stock movement" }, { status: 500 });
  }
}
