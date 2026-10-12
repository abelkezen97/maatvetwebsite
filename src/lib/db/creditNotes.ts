import { SupabaseClient } from "@supabase/supabase-js";
import { CreditNote, CreditNoteItem, UserCountry } from "@/types";
import { recordInventoryMovement } from "@/lib/db/inventory";
import { recalculateCustomerBalance } from "@/lib/db/balances";

/**
 * CREDIT NOTES
 *
 * A credit note is built from an invoice's lines: which items and how many
 * come back, at the price the customer actually paid per unit
 * (line_total / quantity, so line discounts are respected).
 *
 * Pending notes reserve their quantities (you cannot request the same units
 * twice) but change nothing else. On approval:
 *  - lines marked restock go back into the invoice country's stock (SALE_RETURN);
 *    written-off lines (damaged / expired) do not;
 *  - the invoice's open amount drops by the note's total (invoice_balances view),
 *    and anything beyond what was open stays with the customer as credit.
 */

export const CREDIT_NOTE_SELECT =
  "*, invoices!credit_notes_invoice_id_fkey(invoice_number), customers!credit_notes_customer_id_fkey(company_name, doctor_name), credit_note_items(*, products(name))";

export function mapCreditNoteFromDb(row: any, nameMap?: Map<string, string>): CreditNote {
  return {
    id: row.id,
    creditNoteNumber: row.credit_note_number,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoices?.invoice_number,
    customerId: row.customer_id,
    companyName: row.customers?.company_name,
    customerName: row.customers?.doctor_name,
    salesmanId: row.salesman_id || undefined,
    country: row.country === "Oman" ? "Oman" : "UAE",
    creditDate: row.credit_date,
    reason: row.reason,
    notes: row.notes || undefined,
    total: Number(row.total) || 0,
    status: row.status,
    requestedBy: row.requested_by || undefined,
    requestedByName: (row.requested_by && nameMap?.get(row.requested_by)) || undefined,
    requestedAt: row.requested_at || undefined,
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    rejectedAt: row.rejected_at || undefined,
    rejectionReason: row.rejection_reason || undefined,
    items: Array.isArray(row.credit_note_items)
      ? row.credit_note_items.map(
          (it: any): CreditNoteItem => ({
            id: it.id,
            invoiceItemId: it.invoice_item_id,
            productId: it.product_id,
            productName: it.products?.name,
            quantity: Number(it.quantity) || 0,
            unitPrice: Number(it.unit_price) || 0,
            lineTotal: Number(it.line_total) || 0,
            restock: Boolean(it.restock),
          })
        )
      : undefined,
  };
}

export interface ReturnableLine {
  invoiceItemId: string;
  productId: string;
  productName: string;
  invoicedQuantity: number;
  /** Already on Pending or Approved credit notes. */
  returnedQuantity: number;
  returnableQuantity: number;
  /** Price paid per unit after line discount. */
  unitPrice: number;
}

/** The invoice's lines with how many units can still be credited. */
export async function getReturnableLines(
  client: SupabaseClient,
  invoiceId: string
): Promise<ReturnableLine[]> {
  const { data: items, error } = await client
    .from("invoice_items")
    .select("id, product_id, quantity, unit_price, line_total, total_price, products(name)")
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(`Could not read invoice lines: ${error.message}`);

  const { data: used } = await client
    .from("credit_note_items")
    .select("invoice_item_id, quantity, credit_notes!inner(status, is_deleted, invoice_id)")
    .eq("credit_notes.invoice_id", invoiceId)
    .in("credit_notes.status", ["Pending", "Approved"])
    .eq("credit_notes.is_deleted", false);

  const returned = new Map<string, number>();
  (used || []).forEach((u: any) => {
    returned.set(u.invoice_item_id, (returned.get(u.invoice_item_id) || 0) + (Number(u.quantity) || 0));
  });

  return (items || []).map((it: any) => {
    const qty = Number(it.quantity) || 0;
    const lineTotal = Number(it.line_total ?? it.total_price) || 0;
    const unitPrice = qty > 0 ? Math.round((lineTotal / qty) * 1000) / 1000 : Number(it.unit_price) || 0;
    const back = returned.get(it.id) || 0;
    const product = Array.isArray(it.products) ? it.products[0] : it.products;
    return {
      invoiceItemId: it.id,
      productId: it.product_id,
      productName: product?.name || "Product",
      invoicedQuantity: qty,
      returnedQuantity: back,
      returnableQuantity: Math.max(0, qty - back),
      unitPrice,
    };
  });
}

/** Stock and balance effects of an approved credit note. */
export async function applyApprovedCreditNote(
  client: SupabaseClient,
  note: { id: string; creditNoteNumber: string; customerId: string; country: UserCountry },
  items: Array<{ productId: string; quantity: number; restock: boolean }>,
  actorId: string
): Promise<void> {
  for (const it of items) {
    if (!it.restock || it.quantity <= 0) continue;
    await recordInventoryMovement(client, {
      productId: it.productId,
      country: note.country,
      movementType: "SALE_RETURN",
      quantity: it.quantity,
      referenceType: "CREDIT_NOTE",
      referenceId: note.id,
      reason: `Return on credit note ${note.creditNoteNumber}`,
      createdBy: actorId,
    });
  }
  await recalculateCustomerBalance(client, note.customerId, actorId);
}
