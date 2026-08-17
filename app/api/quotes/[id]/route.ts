import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapQuoteFromDb, mapQuoteToDb } from "@/lib/db/mappers";
import { QuoteItem } from "@/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase: userClient } = await requireAuth();

    if (!Permissions.canViewQuotations(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view quotation" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Quotation ID is required" }, { status: 400 });
    }

    const queryClient = createAdminClient() || userClient;

    let query = queryClient
      .from("quotations")
      .select("*, quotation_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
      .eq("id", id);

    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country).eq("salesman_id", profile.id);
    } else if (profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    let { data, error } = await query.eq("is_deleted", false).maybeSingle();

    if (error && (error.message.includes("is_deleted") || error.message.includes("country"))) {
      const res = await queryClient
        .from("quotations")
        .select("*, quotation_items(*, products(name, unit, sku)), customers!left(company_name, doctor_name)")
        .eq("id", id)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (error || !data) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    // Additional server-side ownership check for salesperson
    if (profile.role === "salesperson") {
      if (data.country !== profile.country || data.salesman_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden: Cannot view another salesperson's quotation" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && data.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot view quotation in another country" }, { status: 403 });
    }

    const quote = mapQuoteFromDb(data);
    return NextResponse.json({ quote });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message || "Failed to fetch quotation" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canEditQuotation(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot edit quotation" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Quotation ID is required" }, { status: 400 });
    }

    // Verify existing quotation
    let { data: existing, error: fetchErr } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing || existing.is_deleted) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    if (profile.role === "salesperson") {
      if (existing.country !== profile.country || existing.salesman_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden: Cannot edit another salesperson's quotation" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && existing.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot edit quotation in another country" }, { status: 403 });
    }

    const payload = await request.json();

    // If items are provided in payload, perform server-side recalculation of totals
    if (payload.items && Array.isArray(payload.items)) {
      const items: QuoteItem[] = payload.items;
      let computedSubtotal = 0;
      let computedDiscountTotal = 0;

      for (const item of items) {
        const qty = Math.max(0, Number(item.quantity) || 0);
        const unitPrice = Math.max(0, Number(item.price) || 0);

        let effectiveUnitPrice = unitPrice;
        const rawDiscPrice = item.discountPrice ?? item.manualDiscount;
        if (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "") {
          effectiveUnitPrice = Math.min(unitPrice, Math.max(0, Number(rawDiscPrice)));
        } else if (item.discount !== undefined && item.discount !== null && Number(item.discount) > 0) {
          const discVal = Number(item.discount);
          if (discVal < unitPrice) {
            effectiveUnitPrice = Math.max(0, unitPrice - discVal);
          } else {
            effectiveUnitPrice = Math.min(unitPrice, Math.max(0, discVal));
          }
        }

        const discountPerUnit = Math.max(0, unitPrice - effectiveUnitPrice);
        computedSubtotal += qty * unitPrice;
        computedDiscountTotal += qty * discountPerUnit;
      }

      const targetCountry = existing.country === "Oman" ? "Oman" : "UAE";
      const vatTotal = targetCountry === "UAE" ? 0 : Number(payload.taxTotal ?? payload.vat_total ?? 0);
      const grandTotal = Math.max(0, computedSubtotal - computedDiscountTotal + vatTotal);

      payload.subtotal = computedSubtotal;
      payload.discountTotal = computedDiscountTotal;
      payload.taxTotal = vatTotal;
      payload.grandTotal = grandTotal;
    } else if (existing.country === "UAE") {
      payload.taxTotal = 0;
      payload.vat_total = 0;
    }

    // Generate update payload using canonical mapper
    const headerPayload = mapQuoteToDb(payload);

    // IMMUTABLE / READ-ONLY FIELDS MUST NEVER BE SENT IN UPDATE/PATCH PAYLOAD
    delete headerPayload.id;
    delete headerPayload.quotation_number;
    delete headerPayload.created_by;
    delete headerPayload.created_at;
    delete headerPayload.country;
    delete headerPayload.is_deleted;
    delete headerPayload.deleted_at;
    delete headerPayload.deleted_by;

    headerPayload.updated_at = new Date().toISOString();

    let { error: headerErr } = await supabase
      .from("quotations")
      .update(headerPayload)
      .eq("id", id);

    // Fallback if updated_by column is missing in live database table
    if (headerErr && headerErr.message.includes("updated_by")) {
      delete headerPayload.updated_by;
      const retryRes = await supabase
        .from("quotations")
        .update(headerPayload)
        .eq("id", id);
      headerErr = retryRes.error;
    }

    if (headerErr) {
      console.error("Supabase update quotation error:", headerErr);
      return NextResponse.json({ error: headerErr.message }, { status: 500 });
    }

    if (payload.items && Array.isArray(payload.items)) {
      await supabase.from("quotation_items").delete().eq("quotation_id", id);

      const items: QuoteItem[] = payload.items;
      if (items.length > 0) {
        const lineItemsPayload = items.map((item) => {
          const qty = Math.max(0, Number(item.quantity) || 0);
          const unitPrice = Math.max(0, Number(item.price) || 0);

          let effectiveUnitPrice = unitPrice;
          const rawDiscPrice = item.discountPrice ?? item.manualDiscount;
          if (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "") {
            effectiveUnitPrice = Math.min(unitPrice, Math.max(0, Number(rawDiscPrice)));
          } else if (item.discount !== undefined && item.discount !== null && Number(item.discount) > 0) {
            const discVal = Number(item.discount);
            if (discVal < unitPrice) {
              effectiveUnitPrice = Math.max(0, unitPrice - discVal);
            } else {
              effectiveUnitPrice = Math.min(unitPrice, Math.max(0, discVal));
            }
          }

          const discountPerUnit = Math.max(0, unitPrice - effectiveUnitPrice);
          const lineTotal = Math.max(0, qty * effectiveUnitPrice);

          return {
            quotation_id: id,
            product_id: item.productId || null,
            quantity: qty,
            unit_price: unitPrice,
            discount: discountPerUnit,
            line_total: lineTotal,
          };
        });

        const { error: itemsErr } = await supabase.from("quotation_items").insert(lineItemsPayload);
        if (itemsErr) {
          console.error("Supabase quotation items insert error:", itemsErr);
        }
      }
    }

    return NextResponse.json({ success: true, quotationId: id });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message || "Failed to update quotation" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canSoftDeleteQuotation(profile)) {
      return NextResponse.json({ error: "Forbidden: Only super_admin can soft-delete quotations" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Quotation ID is required" }, { status: 400 });
    }

    // Perform soft-delete (or hard delete fallback if soft-delete columns not present yet)
    let { error } = await supabase
      .from("quotations")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: profile.id,
        updated_by: profile.id,
      })
      .eq("id", id);

    if (error && (error.message.includes("is_deleted") || error.message.includes("deleted_by"))) {
      const deleteRes = await supabase.from("quotations").delete().eq("id", id);
      error = deleteRes.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Quotation deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message || "Failed to delete quotation" }, { status: 500 });
  }
}
