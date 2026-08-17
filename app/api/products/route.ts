import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapProductFromDb, mapProductToDb } from "@/lib/db/mappers";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile, supabase: userClient } = await requireAuth();

    if (!Permissions.canViewProducts(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view products" }, { status: 403 });
    }

    const queryClient = createAdminClient() || userClient;

    const [prodRes, catRes] = await Promise.all([
      queryClient
        .from("products")
        .select("*, product_categories!left(id, name)")
        .order("created_at", { ascending: false }),
      queryClient.from("product_categories").select("id, name"),
    ]);

    const data = prodRes.data;
    const error = prodRes.error;

    if (error) {
      console.error("Failed to load Supabase products:", error);
      return NextResponse.json({ products: [], source: "error", error: error.message }, { status: 500 });
    }

    const categoryMap = new Map<string, string>();
    (catRes.data || []).forEach((c: any) => {
      if (c.id && c.name) categoryMap.set(c.id, c.name);
    });

    const products = (data || []).map((row: any) => mapProductFromDb(row, categoryMap));
    return NextResponse.json({ products, source: "supabase" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load products from Supabase:", error);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canManageProducts(profile)) {
      return NextResponse.json({ error: "Forbidden: Only super_admin can manage products" }, { status: 403 });
    }

    let name = "";
    let sku = "";
    let barcode = "";
    let categoryName = "General";
    let categoryId: string | null = null;
    let unit = "Item";
    let brand = "";
    let manufacturer = "";
    let description = "";
    let costPriceStr: string | null = null;
    let priceStr = "0";
    let price10Str: string | null = null;
    let price50Str: string | null = null;
    let price100Str: string | null = null;
    let isActive = true;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await request.json();
      name = json.name || "";
      sku = json.sku || "";
      barcode = json.barcode || "";
      categoryName = json.category || "General";
      categoryId = json.categoryId || json.category_id || null;
      unit = json.unit || "Item";
      brand = json.brand || "";
      manufacturer = json.manufacturer || "";
      description = json.description || "";
      priceStr = String(json.sellingPrice ?? json.price ?? 0);
      if (json.costPrice !== undefined && json.costPrice !== null && json.costPrice !== "") costPriceStr = String(json.costPrice);
      if (json.price10 !== undefined && json.price10 !== null && json.price10 !== "") price10Str = String(json.price10);
      if (json.price50 !== undefined && json.price50 !== null && json.price50 !== "") price50Str = String(json.price50);
      if (json.price100 !== undefined && json.price100 !== null && json.price100 !== "") price100Str = String(json.price100);
      if (json.isAvailable !== undefined) isActive = Boolean(json.isAvailable);
      if (json.isActive !== undefined) isActive = Boolean(json.isActive);
    } else {
      const formData = await request.formData();
      name = (formData.get("name") as string) || "";
      sku = (formData.get("sku") as string) || "";
      barcode = (formData.get("barcode") as string) || "";
      categoryName = (formData.get("category") as string) || "General";
      categoryId = (formData.get("categoryId") as string) || (formData.get("category_id") as string) || null;
      unit = (formData.get("unit") as string) || "Item";
      brand = (formData.get("brand") as string) || "";
      manufacturer = (formData.get("manufacturer") as string) || "";
      description = (formData.get("description") as string) || "";
      priceStr = (formData.get("sellingPrice") as string) || (formData.get("price") as string) || "0";
      costPriceStr = formData.get("costPrice") as string | null;
      price10Str = formData.get("price10") as string | null;
      price50Str = formData.get("price50") as string | null;
      price100Str = formData.get("price100") as string | null;
      const isActiveRaw = formData.get("isActive") ?? formData.get("isAvailable");
      if (isActiveRaw !== null) isActive = isActiveRaw === "true" || isActiveRaw === "1";
    }

    if (!name.trim()) {
      return NextResponse.json({ error: "Product Name is required" }, { status: 400 });
    }

    const price = parseFloat(priceStr) || 0.0;
    const costPrice = costPriceStr ? parseFloat(costPriceStr) : undefined;
    const price10 = price10Str ? parseFloat(price10Str) : undefined;
    const price50 = price50Str ? parseFloat(price50Str) : undefined;
    const price100 = price100Str ? parseFloat(price100Str) : undefined;

    if (!categoryId && categoryName) {
      const { data: catData } = await supabase
        .from("product_categories")
        .select("id")
        .eq("name", categoryName.trim())
        .maybeSingle();

      if (catData?.id) {
        categoryId = catData.id;
      }
    }

    const finalSku = sku.trim() || `SKU-${Date.now().toString().slice(-6)}`;

    const insertPayload = mapProductToDb({
      name: name.trim(),
      sku: finalSku,
      barcode: barcode.trim(),
      categoryId: categoryId || undefined,
      price: price,
      costPrice: costPrice,
      price10: price10,
      price50: price50,
      price100: price100,
      unit: unit.trim(),
      brand: brand.trim(),
      manufacturer: manufacturer.trim(),
      description: description.trim(),
      isAvailable: isActive,
    });

    insertPayload.created_by = profile.id;
    insertPayload.updated_by = profile.id;

    const { data, error } = await supabase
      .from("products")
      .insert([insertPayload])
      .select("*, product_categories!left(id, name)")
      .single();

    if (error) {
      console.error("Supabase product insert error:", error);
      return NextResponse.json({ error: error.message || "Failed to insert product" }, { status: 500 });
    }

    const newProduct = mapProductFromDb(data);
    return NextResponse.json({ success: true, product: newProduct });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating product:", error);
    return NextResponse.json({ error: error.message || "Failed to create product" }, { status: 500 });
  }
}
