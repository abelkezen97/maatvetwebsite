import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapInventoryMovementFromDb, normalizeTransactionTypeToDb } from "@/lib/db/mappers";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewInventoryMovements(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view inventory movement history" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const country = searchParams.get("country");
    const movementType = searchParams.get("movementType") || searchParams.get("transactionType");
    const limit = searchParams.get("limit");

    const queryClient = createAdminClient() || supabase;

    let query = queryClient
      .from("inventory_transactions")
      .select("*, products(name, sku), profiles!created_by(full_name)")
      .order("created_at", { ascending: false });

    // Salesperson MUST BE filtered strictly by assigned country. Server is source of truth!
    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country);
    } else if (country && (country === "UAE" || country === "Oman")) {
      query = query.eq("country", country);
    }

    if (productId) {
      query = query.eq("product_id", productId);
    }

    if (movementType && movementType !== "ALL") {
      const dbTxType = normalizeTransactionTypeToDb(movementType);
      query = query.or(`transaction_type.eq.${dbTxType},transaction_type.ilike.${movementType}`);
    }

    if (limit && !isNaN(Number(limit))) {
      query = query.limit(Number(limit));
    } else {
      query = query.limit(200); // Default pagination cap
    }

    const { data, error } = await query;

    if (error) {
      if (error.message.includes("does not exist")) {
        return NextResponse.json([]);
      }
      console.error("Error loading inventory transactions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Load creator profiles lookup map for robust name display
    const { data: profileRows } = await queryClient.from("profiles").select("id, full_name");
    const userMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) userMap.set(p.id, p.full_name);
    });

    const movements = (data || []).map((row: any) => mapInventoryMovementFromDb(row, userMap));
    return NextResponse.json(movements);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error fetching inventory movements history:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch movement history" }, { status: 500 });
  }
}
