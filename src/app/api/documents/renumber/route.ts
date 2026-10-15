import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { advanceSeriesPast, cleanDocumentNumber, seriesOfNumber } from "@/lib/db/documentSeries";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/documents/renumber  { docType: "invoice" | "receipt", id, number }
 * Admin / accountant only. Changes the number of an existing invoice or
 * receipt in their country. The new number must be unused; if it belongs to
 * the salesman's series, the series carries on after it (never backwards).
 */
export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!isCountryStaff(profile)) {
      return NextResponse.json({ error: "Only the admin or accountant can change document numbers." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const docType = body.docType === "receipt" ? "receipt" : body.docType === "invoice" ? "invoice" : null;
    const id = String(body.id || "");
    const number = cleanDocumentNumber(body.number);
    if (!docType || !id) return NextResponse.json({ error: "Document and number are required." }, { status: 400 });
    if (!number) return NextResponse.json({ error: "A number can only have letters, digits and - / ." }, { status: 400 });

    const admin = createAdminClient() || supabase;

    if (docType === "invoice") {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_number, salesman_id, billing_series, country, is_deleted")
        .eq("id", id)
        .maybeSingle();
      if (!inv || inv.is_deleted) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
      if (inv.country !== profile.country) return NextResponse.json({ error: "This invoice is in another country." }, { status: 403 });
      if (inv.invoice_number === number) return NextResponse.json({ success: true, number });

      const { data: taken } = await admin.from("invoices").select("id").eq("invoice_number", number).neq("id", id).limit(1);
      if (taken && taken.length > 0) return NextResponse.json({ error: `Invoice number ${number} is already used.` }, { status: 409 });

      const { error } = await admin
        .from("invoices")
        .update({ invoice_number: number, updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        const dup = error.code === "23505";
        return NextResponse.json({ error: dup ? `Invoice number ${number} is already used.` : error.message }, { status: dup ? 409 : 500 });
      }

      // Keep the automatic receipt's wording in step with the new number.
      const { data: autoReceipts } = await admin
        .from("receipts")
        .select("id, reference_number, notes")
        .eq("invoice_id", id);
      for (const r of autoReceipts || []) {
        const patch: Record<string, string> = {};
        const oldRef = `Auto-generated for Invoice ${inv.invoice_number}`;
        const oldNote = `Automatic payment receipt for Invoice ${inv.invoice_number}`;
        if (r.reference_number === oldRef) patch.reference_number = `Auto-generated for Invoice ${number}`;
        if (r.notes === oldNote) patch.notes = `Automatic payment receipt for Invoice ${number}`;
        if (Object.keys(patch).length > 0) await admin.from("receipts").update(patch).eq("id", r.id);
      }

      const series = inv.billing_series === "oman_reg" ? "oman_reg" : "standard";
      await advanceSeriesPast(admin, inv.salesman_id, "invoice", series, number, profile.id);
      return NextResponse.json({ success: true, number, previous: inv.invoice_number });
    }

    // Receipt
    const { data: rec } = await supabase
      .from("receipts")
      .select("id, receipt_number, created_by, billing_series, country, is_deleted, customers!left(assigned_salesman_id)")
      .eq("id", id)
      .maybeSingle();
    if (!rec || rec.is_deleted) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    if (rec.country !== profile.country) return NextResponse.json({ error: "This receipt is in another country." }, { status: 403 });
    if (rec.receipt_number === number) return NextResponse.json({ success: true, number });

    const { data: takenR } = await admin.from("receipts").select("id").eq("receipt_number", number).neq("id", id).limit(1);
    if (takenR && takenR.length > 0) return NextResponse.json({ error: `Receipt number ${number} is already used.` }, { status: 409 });

    const { error: recErr } = await admin
      .from("receipts")
      .update({ receipt_number: number, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (recErr) {
      const dup = recErr.code === "23505";
      return NextResponse.json({ error: dup ? `Receipt number ${number} is already used.` : recErr.message }, { status: dup ? 409 : 500 });
    }

    // The series it belongs to: the collector's, else the customer's salesman's.
    const owners = [rec.created_by, (rec as any).customers?.assigned_salesman_id].filter(Boolean) as string[];
    for (const owner of owners) {
      const series = await seriesOfNumber(admin, owner, "receipt", number);
      if (series) {
        await advanceSeriesPast(admin, owner, "receipt", series, number, profile.id);
        break;
      }
    }
    return NextResponse.json({ success: true, number, previous: rec.receipt_number });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error changing document number:", error);
    return NextResponse.json({ error: error.message || "Could not change the number" }, { status: 500 });
  }
}
