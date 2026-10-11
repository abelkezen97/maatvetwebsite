import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCustomerBalanceSummary } from "@/lib/db/balances";
import { mapInvoiceBalanceFromDb } from "@/lib/db/mappers";

export const dynamic = "force-dynamic";

/**
 * GET /api/customers/:id/open-invoices
 *
 * The customer's invoices that still have money open (oldest first), plus the
 * balance summary. Used by the receipt screen to allocate a payment.
 * Access follows the customer: if the caller can see the customer (RLS), they
 * see all of that customer's open invoices.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, supabase } = await requireAuth();
    const { id } = await params;

    const { data: customer } = await supabase
      .from("customers")
      .select("id, country, company_name, cash_only, cash_only_reason")
      .eq("id", id)
      .maybeSingle();

    if (!customer || customer.country !== profile.country) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const client = createAdminClient() || supabase;
    const { data: rows, error } = await client
      .from("invoice_balances")
      .select("*")
      .eq("customer_id", id)
      .eq("country", profile.country)
      .gt("outstanding", 0)
      .order("invoice_date", { ascending: true })
      .order("invoice_number", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = await getCustomerBalanceSummary(supabase, id);

    return NextResponse.json({
      customer: {
        id: customer.id,
        companyName: customer.company_name,
        cashOnly: Boolean(customer.cash_only),
        cashOnlyReason: customer.cash_only_reason || undefined,
      },
      summary,
      invoices: (rows || []).map(mapInvoiceBalanceFromDb),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load open invoices:", error);
    return NextResponse.json({ error: "Failed to load open invoices" }, { status: 500 });
  }
}
