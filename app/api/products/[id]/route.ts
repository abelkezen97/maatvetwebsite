import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { mapProductFromDb, mapProductToDb } from "@/lib/db/mappers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Role-based field-level authorization check
    if (profile.role === "salesperson") {
      return NextResponse.json({ error: "Forbidden: Salesperson cannot edit products" }, { status: 403 });
    }

    const body = await request.json();

    // Restricted fields that accountants cannot edit
    const nonPriceFields = [
      "name",
      "productCode",
      "product_code",
      "sku",
      "barcode",
      "categoryId",
      "category_id",
      "category",
      "unit",
      "brand",
      "manufacturer",
      "description",
      "isAvailable",
      "isActive",
      "is_active",
      "costPrice",
      "cost_price",
    ];

    if (profile.role === "accountant") {
      const hasNonPriceEdits = nonPriceFields.some((field) => body[field] !== undefined);
      if (hasNonPriceEdits) {
        return NextResponse.json(
          { error: "Forbidden: Accountant is allowed to edit product prices only" },
          { status: 403 }
        );
      }
    }

    if (profile.role !== "super_admin" && profile.role !== "accountant") {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    // Filter update payload according to role
    let updatePayload: Record<string, any> = {};

    if (profile.role === "accountant") {
      // Accountant may ONLY update prices
      if (body.price !== undefined || body.sellingPrice !== undefined || body.selling_price !== undefined) {
        updatePayload.selling_price = Number(body.price ?? body.sellingPrice ?? body.selling_price) || 0;
      }
      if (body.price10 !== undefined || body.price_10 !== undefined) {
        updatePayload.price_10 = body.price10 ?? body.price_10;
      }
      if (body.price50 !== undefined || body.price_50 !== undefined) {
        updatePayload.price_50 = body.price50 ?? body.price_50;
      }
      if (body.price100 !== undefined || body.price_100 !== undefined) {
        updatePayload.price_100 = body.price100 ?? body.price_100;
      }
    } else {
      // Super Admin may update all fields
      updatePayload = mapProductToDb(body);
    }

    updatePayload.updated_by = profile.id;
    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", id)
      .select("*, product_categories!left(id, name)")
      .single();

    if (error) {
      console.error("Supabase product update error:", error);
      return NextResponse.json({ error: error.message || "Failed to update product" }, { status: 500 });
    }

    const updatedProduct = mapProductFromDb(data);
    return NextResponse.json({ success: true, product: updatedProduct });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating product:", error);
    return NextResponse.json({ error: error.message || "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only super_admin can deactivate products" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Soft deactivation: set is_active = false
    const { error } = await supabase
      .from("products")
      .update({ is_active: false, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Supabase product delete error:", error);
      return NextResponse.json({ error: error.message || "Failed to deactivate product" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Product deactivated successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting product:", error);
    return NextResponse.json({ error: error.message || "Failed to deactivate product" }, { status: 500 });
  }
}
