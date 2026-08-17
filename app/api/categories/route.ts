import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase: userClient } = await requireAuth();
    const queryClient = createAdminClient() || userClient;

    const { data, error } = await queryClient
      .from("product_categories")
      .select("id, name, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to load product categories:", error);
      return NextResponse.json({ categories: [] });
    }

    return NextResponse.json({ categories: data || [] });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error loading categories:", error);
    return NextResponse.json({ categories: [] });
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only super_admin can create product categories" }, { status: 403 });
    }

    const json = await request.json();
    const name = json.name ? String(json.name).trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const insertPayload = {
      name,
      created_by: profile.id,
      updated_by: profile.id,
    };

    const { data, error } = await supabase
      .from("product_categories")
      .insert([insertPayload])
      .select("id, name, created_at, updated_at")
      .single();

    if (error) {
      console.error("Failed to create product category:", error);
      return NextResponse.json({ error: error.message || "Failed to create category" }, { status: 500 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating category:", error);
    return NextResponse.json({ error: error.message || "Failed to create category" }, { status: 500 });
  }
}
