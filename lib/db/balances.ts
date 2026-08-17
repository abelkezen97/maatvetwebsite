/**
 * CENTRALIZED CUSTOMER BALANCE ENGINE
 * Canonical calculation:
 * Outstanding Balance = SUM(active Credit invoices grand_total) - SUM(active receipts amount_paid)
 *
 * Rules:
 * - Active Invoice: customer_id = customerId, is_deleted = false, status = 'Credit' (not 'Cancelled', 'Paid', or deleted)
 * - Active Receipt: customer_id = customerId, is_deleted = false
 */

export async function recalculateCustomerBalance(
  supabase: any,
  customerId: string,
  updatedByProfileId?: string
): Promise<{ customerId: string; pendingBalance: number }> {
  if (!customerId) {
    throw new Error("recalculateCustomerBalance requires a valid customerId");
  }

  // 1. Fetch active credit invoices total
  let invQuery = supabase
    .from("invoices")
    .select("id, grand_total, status, credit_days, is_deleted")
    .eq("customer_id", customerId);

  let { data: invRows, error: invErr } = await invQuery;

  // Fallback if is_deleted column does not exist yet
  if (invErr && invErr.message.includes("is_deleted")) {
    const fallback = await supabase
      .from("invoices")
      .select("id, grand_total, status, credit_days")
      .eq("customer_id", customerId);
    invRows = fallback.data;
    invErr = fallback.error;
  }

  if (invErr) {
    console.error(`Error querying invoices for customer ${customerId}:`, invErr);
    throw new Error(`Failed to calculate customer invoice totals: ${invErr.message}`);
  }

  // Track Paid invoice IDs to exclude their automatic receipts
  const paidInvoiceIds = new Set<string>();
  (invRows || []).forEach((inv: any) => {
    if (!inv.is_deleted && inv.status === "Paid") {
      paidInvoiceIds.add(inv.id);
    }
  });

  const creditInvoicesSum = (invRows || [])
    .filter((inv: any) => {
      if (inv.is_deleted) return false;
      if (inv.status === "Cancelled" || inv.status === "Paid") return false;
      return inv.status === "Credit" || (inv.credit_days && Number(inv.credit_days) > 0);
    })
    .reduce((sum: number, inv: any) => sum + (Number(inv.grand_total) || 0), 0);

  // 2. Fetch active receipts total
  let recQuery = supabase
    .from("receipts")
    .select("invoice_id, amount_paid, is_deleted")
    .eq("customer_id", customerId);

  let { data: recRows, error: recErr } = await recQuery;

  if (recErr && recErr.message.includes("is_deleted")) {
    const fallback = await supabase
      .from("receipts")
      .select("invoice_id, amount_paid")
      .eq("customer_id", customerId);
    recRows = fallback.data;
    recErr = fallback.error;
  }

  if (recErr) {
    console.error(`Error querying receipts for customer ${customerId}:`, recErr);
    throw new Error(`Failed to calculate customer receipt totals: ${recErr.message}`);
  }

  const receiptsSum = (recRows || [])
    .filter((rec: any) => {
      if (rec.is_deleted) return false;
      if (rec.invoice_id && paidInvoiceIds.has(rec.invoice_id)) return false;
      return true;
    })
    .reduce((sum: number, rec: any) => sum + (Number(rec.amount_paid) || 0), 0);

  const pendingBalance = Math.max(0, creditInvoicesSum - receiptsSum);

  // 3. Persist recalculated balance on public.customers
  const updatePayload: Record<string, any> = {
    pending_balance: pendingBalance,
    updated_at: new Date().toISOString(),
  };

  if (updatedByProfileId) {
    updatePayload.updated_by = updatedByProfileId;
  }

  let { error: updateErr } = await supabase
    .from("customers")
    .update(updatePayload)
    .eq("id", customerId);

  if (updateErr && updateErr.message.includes("updated_by")) {
    delete updatePayload.updated_by;
    const retry = await supabase
      .from("customers")
      .update(updatePayload)
      .eq("id", customerId);
    updateErr = retry.error;
  }

  if (updateErr) {
    console.error(`Failed to update pending_balance for customer ${customerId}:`, updateErr);
    throw new Error(`Failed to update customer balance: ${updateErr.message}`);
  }

  return { customerId, pendingBalance };
}

/**
 * Bulk recalculate and sync balances for multiple customer IDs (or all accessible customers)
 */
export async function syncAllCustomerBalances(
  supabase: any,
  customers: any[]
): Promise<Map<string, number>> {
  const balanceMap = new Map<string, number>();
  if (!customers || customers.length === 0) return balanceMap;

  const customerIds = customers.map((c) => c.id).filter(Boolean);
  if (customerIds.length === 0) return balanceMap;

  // Fetch all active invoices for these customers
  const { data: invRows } = await supabase
    .from("invoices")
    .select("id, customer_id, grand_total, status, credit_days, is_deleted")
    .in("customer_id", customerIds);

  // Fetch all active receipts for these customers
  const { data: recRows } = await supabase
    .from("receipts")
    .select("customer_id, invoice_id, amount_paid, is_deleted")
    .in("customer_id", customerIds);

  const paidInvoiceIds = new Set<string>();
  (invRows || []).forEach((inv: any) => {
    if (!inv.is_deleted && inv.status === "Paid") {
      paidInvoiceIds.add(inv.id);
    }
  });

  const creditInvByCust: Record<string, number> = {};
  (invRows || []).forEach((inv: any) => {
    const isCredit = !inv.is_deleted && inv.status !== "Cancelled" && inv.status !== "Paid" && (inv.status === "Credit" || (inv.credit_days && Number(inv.credit_days) > 0));
    if (isCredit && inv.customer_id) {
      creditInvByCust[inv.customer_id] = (creditInvByCust[inv.customer_id] || 0) + (Number(inv.grand_total) || 0);
    }
  });

  const receiptsByCust: Record<string, number> = {};
  (recRows || []).forEach((rec: any) => {
    if (!rec.is_deleted && rec.customer_id) {
      if (rec.invoice_id && paidInvoiceIds.has(rec.invoice_id)) {
        return;
      }
      receiptsByCust[rec.customer_id] = (receiptsByCust[rec.customer_id] || 0) + (Number(rec.amount_paid) || 0);
    }
  });

  const updatesToPersist: Array<{ id: string; pending_balance: number }> = [];

  customerIds.forEach((id) => {
    const creditTotal = creditInvByCust[id] || 0;
    const recTotal = receiptsByCust[id] || 0;
    const calculated = Math.max(0, creditTotal - recTotal);
    balanceMap.set(id, calculated);

    const custObj = customers.find((c) => c.id === id);
    if (custObj && Number(custObj.pending_balance ?? custObj.pendingBillwiseAmount) !== calculated) {
      updatesToPersist.push({ id, pending_balance: calculated });
    }
  });

  if (updatesToPersist.length > 0) {
    Promise.allSettled(
      updatesToPersist.map((u) =>
        supabase
          .from("customers")
          .update({ pending_balance: u.pending_balance, updated_at: new Date().toISOString() })
          .eq("id", u.id)
      )
    ).catch((err) => console.error("Error persisting updated customer balances:", err));
  }

  return balanceMap;
}
