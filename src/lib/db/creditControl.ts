import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Credit control. A customer whose oldest unpaid invoice is more than
 * `blockAfterDays` past its due date is blocked from NEW CREDIT invoices when a
 * salesman enters them. Admin and accountant are never blocked and can release
 * a customer so salesmen can sell on credit again.
 *
 * Due date = invoice date + the invoice's credit days; an invoice with no
 * credit days uses `defaultCreditDays` (set in Settings, 90 by default).
 */

export interface CreditPolicy {
  blockEnabled: boolean;
  blockAfterDays: number;
  defaultCreditDays: number;
}

export const DEFAULT_POLICY: CreditPolicy = { blockEnabled: true, blockAfterDays: 100, defaultCreditDays: 90 };

export async function loadCreditPolicy(client: any, country: string): Promise<CreditPolicy> {
  try {
    const c = createAdminClient() || client;
    const { data } = await c.from("credit_policy").select("*").eq("country", country).maybeSingle();
    if (!data) return DEFAULT_POLICY;
    return {
      blockEnabled: data.block_enabled !== false,
      blockAfterDays: Number(data.block_after_days) || DEFAULT_POLICY.blockAfterDays,
      defaultCreditDays: Number.isFinite(Number(data.default_credit_days)) ? Number(data.default_credit_days) : DEFAULT_POLICY.defaultCreditDays,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

export interface CreditStatusRow {
  customerId: string;
  openAmount: number;
  notDue: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90Plus: number;
  overdueAmount: number;
  maxDaysOverdue: number;
}

export function mapCreditStatus(r: any): CreditStatusRow {
  const n = (v: any) => Number(v) || 0;
  return {
    customerId: r.customer_id,
    openAmount: n(r.open_amount),
    notDue: n(r.not_due),
    d1_30: n(r.d1_30),
    d31_60: n(r.d31_60),
    d61_90: n(r.d61_90),
    d90Plus: n(r.d90_plus),
    overdueAmount: n(r.overdue_amount),
    maxDaysOverdue: n(r.max_days_overdue),
  };
}

export type CreditState = "ok" | "watch" | "blocked" | "released";

export function creditState(maxDaysOverdue: number, policy: CreditPolicy, released: boolean): CreditState {
  if (maxDaysOverdue >= policy.blockAfterDays) return released || !policy.blockEnabled ? "released" : "blocked";
  if (maxDaysOverdue > 60) return "watch";
  return "ok";
}

/** For a salesman entering a credit invoice: is this customer blocked? */
export async function creditBlockFor(client: any, customerId: string, country: string, released: boolean) {
  const policy = await loadCreditPolicy(client, country);
  if (!policy.blockEnabled || released) return { blocked: false as const, policy };
  try {
    const c = createAdminClient() || client;
    const { data } = await c.from("customer_credit_status").select("*").eq("customer_id", customerId).maybeSingle();
    if (!data) return { blocked: false as const, policy };
    const s = mapCreditStatus(data);
    if (s.maxDaysOverdue >= policy.blockAfterDays) return { blocked: true as const, policy, status: s };
    return { blocked: false as const, policy };
  } catch {
    return { blocked: false as const, policy };
  }
}
