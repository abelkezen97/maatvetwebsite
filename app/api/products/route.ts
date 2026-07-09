import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { fetchProductsFromGoogleSheet } from "@/services/sheets";
import { Product } from "@/types";

export async function GET() {
  try {
    const sheetProducts = await fetchProductsFromGoogleSheet();
    return NextResponse.json({ 
      products: sheetProducts, 
      source: "google_sheets" 
    });
  } catch (error) {
    console.error("Failed to load products from Google Sheet:", error);
    return NextResponse.json({ 
      products: [], 
      source: "error", 
      error: "Failed to load Google Sheet products" 
    });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const price = parseFloat(formData.get("price") as string) || 0.0;

    if (!name) {
      return NextResponse.json({ error: "Product Name is required" }, { status: 400 });
    }

    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      sku: "",
      name,
      category: "General",
      price,
      unit: "Item",
      description: "Added directly from Sales Portal.",
    };

    // submit via Google Form POST endpoint
    const formId = process.env.GOOGLE_FORM_ID;
    const entryName = process.env.GOOGLE_FORM_ENTRY_NAME;
    const entryPrice = process.env.GOOGLE_FORM_ENTRY_PRICE;

    if (formId && entryName && entryPrice) {
      try {
        const formUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;
        const params = new URLSearchParams();
        params.append(entryName, name);
        params.append(entryPrice, price.toString());

        await fetch(formUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
          mode: "no-cors"
        });
      } catch (formError) {
        console.error("Google Form direct post failed:", formError);
      }
    }

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
