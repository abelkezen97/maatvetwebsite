import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only super_admin can edit product categories" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const json = await request.json();
    const name = json.name ? String(json.name).trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const updatePayload = {
      name,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("product_categories")
      .update(updatePayload)
      .eq("id", id)
      .select("id, name, created_at, updated_at")
      .single();

    if (error) {
      console.error("Failed to update category:", error);
      return NextResponse.json({ error: error.message || "Failed to update category" }, { status: 500 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating category:", error);
    return NextResponse.json({ error: error.message || "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only super_admin can delete product categories" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    // Safely reassign referencing products to NULL before deleting category to prevent orphans
    const { error: unassignError } = await supabase
      .from("products")
      .update({ category_id: null, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("category_id", id);

    if (unassignError) {
      console.error("Failed to unassign products before category deletion:", unassignError);
      return NextResponse.json({ error: "Failed to update referencing products" }, { status: 500 });
    }

    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete product category:", error);
      return NextResponse.json({ error: error.message || "Failed to delete category" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Category deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: error.message || "Failed to delete category" }, { status: 500 });
  }
}
