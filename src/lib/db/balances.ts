import { createAdminClient } from "@/utils/supabase/admin";

/**
 * CUSTOMER BALANCE ENGINE
 *
 * The balance is calculated in the database by the `customer_balances` view
 * (migration 20261011040000_payments_and_cheques):
 *
 *   balance = opening_balance
 *           + open amount of every active invoice   (invoice_balances.outstanding)
 *           - payments not applied to any invoice   (advances, payments on the opening balance)
 *
 * A cheque counts as paid only once it is Cleared; pending cheques are reported
 * separately (cheques_pending) and bounced cheques count for nothing.
 *
 * `customers.pending_balance` keeps a copy (never below zero) for list screens.
 * A negative `balance` means the customer has an advance (credit) with us.
 *
 * The view is read with the service-role client so the figure is complete even
 * when the caller (e.g. a salesperson) cannot see every receipt of the customer.
 */

export interface CustomerBalanceSummary {
  customerId: string;
  openingBalance: number;
  invoicesOutstanding: number;
  unappliedPayments: number;
  chequesPending: number;
  /** Signed: negative = advance held for the customer. */
  balance: number;
  cashOnly: boolean;
}

function mapSummary(row: any): CustomerBalanceSummary {
  return {
    customerId: row.customer_id,
    openingBalance: Number(row.opening_balance) || 0,
    invoicesOutstanding: Number(row.invoices_outstanding) || 0,
    unappliedPayments: Number(row.unapplied_payments) || 0,
    chequesPending: Number(row.cheques_pending) || 0,
    balance: Number(row.balance) || 0,
    cashOnly: Boolean(row.cash_only),
  };
}

export async function getCustomerBalanceSummary(
  supabase: any,
  customerId: string
): Promise<CustomerBalanceSummary | null> {
  const client = createAdminClient() || supabase;
  const { data, error } = await client
    .from("customer_balances")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read customer balance: ${error.message}`);
  }
  return data ? mapSummary(data) : null;
}

export async function recalculateCustomerBalance(
  supabase: any,
  customerId: string,
  updatedByProfileId?: string
): Promise<{ customerId: string; pendingBalance: number }> {
  if (!customerId) {
    throw new Error("recalculateCustomerBalance requires a valid customerId");
  }

  const summary = await getCustomerBalanceSummary(supabase, customerId);
  const pendingBalance = Math.max(0, summary?.balance ?? 0);

  const client = createAdminClient() || supabase;
  const updatePayload: Record<string, any> = {
    pending_balance: pendingBalance,
    updated_at: new Date().toISOString(),
  };
  if (updatedByProfileId) updatePayload.updated_by = updatedByProfileId;

  const { error: updateErr } = await client
    .from("customers")
    .update(updatePayload)
    .eq("id", customerId);

  if (updateErr) {
    console.error(`Failed to update pending_balance for customer ${customerId}:`, updateErr);
    throw new Error(`Failed to update customer balance: ${updateErr.message}`);
  }

  return { customerId, pendingBalance };
}

/**
 * Balances for many customers at once (customer list screens).
 * Returns customerId -> pending balance (never below zero) and refreshes the
 * stored copy where it has drifted.
 */
export async function syncAllCustomerBalances(
  supabase: any,
  customers: any[]
): Promise<Map<string, number>> {
  const balanceMap = new Map<string, number>();
  const customerIds = (customers || []).map((c) => c.id).filter(Boolean);
  if (customerIds.length === 0) return balanceMap;

  const client = createAdminClient() || supabase;
  const { data: rows, error } = await client
    .from("customer_balances")
    .select("customer_id, balance")
    .in("customer_id", customerIds);

  if (error) {
    console.error("Error reading customer balances:", error);
    return balanceMap;
  }

  const updates: Array<{ id: string; pending_balance: number }> = [];
  (rows || []).forEach((row: any) => {
    const value = Math.max(0, Number(row.balance) || 0);
    balanceMap.set(row.customer_id, value);
    const existing = customers.find((c) => c.id === row.customer_id);
    const stored = Number(existing?.pending_balance ?? existing?.pendingBillwiseAmount);
    if (existing && stored !== value) {
      updates.push({ id: row.customer_id, pending_balance: value });
    }
  });

  if (updates.length > 0) {
    Promise.allSettled(
      updates.map((u) =>
        client
          .from("customers")
          .update({ pending_balance: u.pending_balance, updated_at: new Date().toISOString() })
          .eq("id", u.id)
      )
    ).catch((err) => console.error("Error persisting customer balances:", err));
  }

  return balanceMap;
}
