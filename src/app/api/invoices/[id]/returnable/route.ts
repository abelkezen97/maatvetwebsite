import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { getReturnableLines } from "@/lib/db/creditNotes";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/:id/returnable
 * The invoice's lines with how many units can still go on a credit note.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    const { id } = await params;
    const admin = createAdminClient() || supabase;

    const { data: invoice } = await admin
      .from("invoices")
      .select("id, invoice_number, customer_id, salesman_id, country, status, is_deleted, grand_total, issue_date, invoice_date, customers(company_name, doctor_name, assigned_salesman_id)")
      .eq("id", id)
      .maybeSingle();

    if (!invoice || invoice.is_deleted || invoice.country !== profile.country) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    if (
      profile.role === "salesperson" &&
      invoice.salesman_id !== profile.id &&
      customer?.assigned_salesman_id !== profile.id
    ) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const lines = await getReturnableLines(admin, id);
    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: invoice.customer_id,
        companyName: customer?.company_name,
        customerName: customer?.doctor_name,
        country: invoice.country,
        status: invoice.status,
        grandTotal: Number(invoice.grand_total) || 0,
        date: invoice.issue_date || invoice.invoice_date,
      },
      lines,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message || "Failed to load invoice lines" }, { status: 500 });
  }
}
