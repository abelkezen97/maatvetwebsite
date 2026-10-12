import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { isCountryStaff } from "@/lib/auth/permissions";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import {
  CREDIT_NOTE_SELECT,
  applyApprovedCreditNote,
  getReturnableLines,
  mapCreditNoteFromDb,
} from "@/lib/db/creditNotes";
import { CREDIT_NOTE_REASONS } from "@/types";

export const dynamic = "force-dynamic";

async function nameMap(client: any): Promise<Map<string, string>> {
  const { data } = await client.from("profiles").select("id, full_name");
  return new Map((data || []).map((p: any) => [p.id, p.full_name]));
}

/**
 * GET /api/credit-notes[?invoiceId=&status=]
 * Own country; salespeople see the notes for their own invoices or that they requested.
 */
export async function GET(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");
    const status = searchParams.get("status");

    let query = supabase
      .from("credit_notes")
      .select(CREDIT_NOTE_SELECT)
      .eq("country", profile.country)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (profile.role === "salesperson") {
      query = query.or(`salesman_id.eq.${profile.id},requested_by.eq.${profile.id}`);
    }
    if (invoiceId) query = query.eq("invoice_id", invoiceId);
    if (status && ["Pending", "Approved", "Rejected"].includes(status)) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const names = await nameMap(createAdminClient() || supabase);
    return NextResponse.json((data || []).map((row: any) => mapCreditNoteFromDb(row, names)));
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Failed to load credit notes" }, { status: 500 });
  }
}

/**
 * POST /api/credit-notes
 * Body: { invoiceId, reason, notes?, items: [{ invoiceItemId, quantity, restock }] }
 *
 * Salespeople file a Pending request (own invoices / customers only).
 * An admin or accountant creates it already Approved, with stock and balance applied.
 */
export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();
    const body = await request.json().catch(() => ({}));

    const invoiceId = String(body?.invoiceId || "");
    const reason = String(body?.reason || "").trim();
    const notes = String(body?.notes || "").trim();
    const requested: Array<{ invoiceItemId: string; quantity: number; restock: boolean }> = Array.isArray(body?.items)
      ? body.items
          .map((i: any) => ({
            invoiceItemId: String(i?.invoiceItemId || ""),
            quantity: Math.floor(Number(i?.quantity) || 0),
            restock: i?.restock !== false,
          }))
          .filter((i: any) => i.invoiceItemId && i.quantity > 0)
      : [];

    if (!invoiceId) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    if (!reason || !(CREDIT_NOTE_REASONS as readonly string[]).includes(reason)) {
      return NextResponse.json({ error: `Choose a reason: ${CREDIT_NOTE_REASONS.join(", ")}` }, { status: 400 });
    }
    if (requested.length === 0) {
      return NextResponse.json({ error: "Enter a quantity for at least one item." }, { status: 400 });
    }

    const admin = createAdminClient() || supabase;

    // The invoice must be in the caller's country; a salesperson only their own.
    const { data: invoice } = await admin
      .from("invoices")
      .select("id, invoice_number, customer_id, salesman_id, country, status, is_deleted, billing_series, customers(assigned_salesman_id)")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!invoice || invoice.is_deleted || invoice.country !== profile.country) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "Cancelled") {
      return NextResponse.json({ error: "This invoice is cancelled." }, { status: 400 });
    }
    const customerRow = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    if (
      profile.role === "salesperson" &&
      invoice.salesman_id !== profile.id &&
      customerRow?.assigned_salesman_id !== profile.id
    ) {
      return NextResponse.json({ error: "Forbidden: not your invoice" }, { status: 403 });
    }

    // Quantities cannot exceed what is still returnable on each line.
    const lines = await getReturnableLines(admin, invoiceId);
    const itemRows: Array<{ invoice_item_id: string; product_id: string; quantity: number; unit_price: number; line_total: number; restock: boolean }> = [];
    for (const req of requested) {
      const line = lines.find((l) => l.invoiceItemId === req.invoiceItemId);
      if (!line) return NextResponse.json({ error: "An item does not belong to this invoice." }, { status: 400 });
      if (req.quantity > line.returnableQuantity) {
        return NextResponse.json(
          { error: `${line.productName}: only ${line.returnableQuantity} of ${line.invoicedQuantity} can still be credited.` },
          { status: 400 }
        );
      }
      itemRows.push({
        invoice_item_id: line.invoiceItemId,
        product_id: line.productId,
        quantity: req.quantity,
        unit_price: line.unitPrice,
        line_total: Math.round(line.unitPrice * req.quantity * 1000) / 1000,
        restock: req.restock,
      });
    }
    const total = Math.round(itemRows.reduce((s, r) => s + r.line_total, 0) * 1000) / 1000;
    if (total <= 0) return NextResponse.json({ error: "The credit note total must be above zero." }, { status: 400 });

    const staff = isCountryStaff(profile);
    const now = new Date().toISOString();

    let created: any = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      // Oman-registered invoices (UAE) get their own credit note series.
      const cnPrefix = invoice.billing_series === "oman_reg" ? "CNM" : "CN";
      const number = await generateNextDocumentNumber(admin, "credit_notes", "credit_note_number", cnPrefix, 6);
      const { data, error } = await supabase
        .from("credit_notes")
        .insert([{
          credit_note_number: number,
          invoice_id: invoiceId,
          customer_id: invoice.customer_id,
          salesman_id: invoice.salesman_id,
          country: profile.country,
          reason,
          notes: notes || null,
          total,
          status: staff ? "Approved" : "Pending",
          requested_by: profile.id,
          approved_by: staff ? profile.id : null,
          approved_at: staff ? now : null,
        }])
        .select("id, credit_note_number, customer_id, country")
        .single();
      if (error) {
        if (error.code === "23505") continue; // number taken, retry
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      created = data;
    }
    if (!created) return NextResponse.json({ error: "Could not allocate a credit note number." }, { status: 500 });

    const { error: itemsErr } = await admin
      .from("credit_note_items")
      .insert(itemRows.map((r) => ({ ...r, credit_note_id: created.id })));
    if (itemsErr) {
      await admin.from("credit_notes").delete().eq("id", created.id);
      return NextResponse.json({ error: `Credit note not saved: ${itemsErr.message}` }, { status: 500 });
    }

    if (staff) {
      await applyApprovedCreditNote(
        admin,
        { id: created.id, creditNoteNumber: created.credit_note_number, customerId: created.customer_id, country: profile.country },
        itemRows.map((r) => ({ productId: r.product_id, quantity: r.quantity, restock: r.restock })),
        profile.id
      );
    }

    const { data: full } = await admin.from("credit_notes").select(CREDIT_NOTE_SELECT).eq("id", created.id).single();
    return NextResponse.json({ success: true, creditNote: mapCreditNoteFromDb(full) }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Credit note creation failed:", error);
    return NextResponse.json({ error: error.message || "Failed to create credit note" }, { status: 500 });
  }
}
