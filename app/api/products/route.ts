import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { cookies } from "next/headers";
import { Product } from "@/types";

export const dynamic = "force-dynamic";

async function getSupabase() {
  try {
    const cookieStore = await cookies();
    return createServerClient(cookieStore);
  } catch {
    return createBrowserClient();
  }
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select("*, product_categories(name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load Supabase products:", error);
      return NextResponse.json({ 
        products: [], 
        source: "error", 
        error: error.message 
      });
    }

    const products: Product[] = (data || []).map((row: any) => ({
      id: row.id ? String(row.id) : `prod-${Date.now()}`,
      sku: row.sku || "",
      name: row.name || "",
      category: row.product_categories?.name || "General",
      price: typeof row.selling_price === "number" ? row.selling_price : parseFloat(row.selling_price) || 0,
      price10: row.price_10 !== null && row.price_10 !== undefined ? Number(row.price_10) : undefined,
      price50: row.price_50 !== null && row.price_50 !== undefined ? Number(row.price_50) : undefined,
      price100: row.price_100 !== null && row.price_100 !== undefined ? Number(row.price_100) : undefined,
      unit: row.unit || "Item",
      description: row.description || "",
      isAvailable: row.is_active !== false,
    }));

    return NextResponse.json({ 
      products, 
      source: "supabase" 
    });
  } catch (error) {
    console.error("Failed to load products from Supabase:", error);
    return NextResponse.json({ 
      products: [], 
      source: "error", 
      error: "Failed to load Supabase products" 
    });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = (formData.get("name") as string) || "";
    const priceStr = (formData.get("price") as string) || "0";
    const categoryName = (formData.get("category") as string) || "General";
    const sku = (formData.get("sku") as string) || "";
    const unit = (formData.get("unit") as string) || "Item";
    const description = (formData.get("description") as string) || "Added directly from Sales Portal.";
    const price10Str = formData.get("price10") as string | null;
    const price50Str = formData.get("price50") as string | null;
    const price100Str = formData.get("price100") as string | null;

    if (!name.trim()) {
      return NextResponse.json({ error: "Product Name is required" }, { status: 400 });
    }

    const price = parseFloat(priceStr) || 0.0;
    const price10 = price10Str ? parseFloat(price10Str) : undefined;
    const price50 = price50Str ? parseFloat(price50Str) : undefined;
    const price100 = price100Str ? parseFloat(price100Str) : undefined;

    const supabase = await getSupabase();

    let categoryId: string | null = null;
    if (categoryName) {
      const { data: catData } = await supabase
        .from("product_categories")
        .select("id")
        .eq("name", categoryName.trim())
        .maybeSingle();

      if (catData?.id) {
        categoryId = catData.id;
      }
    }

    const insertPayload: Record<string, any> = {
      name: name.trim(),
      selling_price: price,
      unit: unit,
      description: description,
      is_active: true,
    };

    if (categoryId) {
      insertPayload.category_id = categoryId;
    }
    if (sku) {
      insertPayload.sku = sku;
    }
    if (price10 !== undefined && !isNaN(price10)) {
      insertPayload.price_10 = price10;
    }
    if (price50 !== undefined && !isNaN(price50)) {
      insertPayload.price_50 = price50;
    }
    if (price100 !== undefined && !isNaN(price100)) {
      insertPayload.price_100 = price100;
    }

    const { data, error } = await supabase
      .from("products")
      .insert([insertPayload])
      .select("*, product_categories(name)")
      .single();

    if (error) {
      console.error("Supabase product insert error:", error);
    }

    const newProduct: Product = {
      id: data?.id ? String(data.id) : `prod-${Date.now()}`,
      sku: data?.sku || sku || "",
      name: data?.name || name.trim(),
      category: data?.product_categories?.name || categoryName || "General",
      price: data?.selling_price !== undefined ? Number(data.selling_price) : price,
      price10: data?.price_10 !== undefined && data?.price_10 !== null ? Number(data.price_10) : price10,
      price50: data?.price_50 !== undefined && data?.price_50 !== null ? Number(data.price_50) : price50,
      price100: data?.price_100 !== undefined && data?.price_100 !== null ? Number(data.price_100) : price100,
      unit: data?.unit || unit || "Item",
      description: data?.description || description,
      isAvailable: data?.is_active !== false,
    };

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
