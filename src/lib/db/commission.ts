import { SupabaseClient } from "@supabase/supabase-js";
import { UserCountry } from "@/types";
import { isCountryStaff } from "@/lib/auth/permissions";

/**
 * SALESMAN COMMISSION (UAE)
 *
 * - Only money collected against an invoice within COMMISSION_WINDOW_DAYS of
 *   the invoice date counts ("eligible"). Later collections earn nothing.
 * - "Collected on": payment date; for a cheque, the day it cleared. Pending or
 *   bounced cheques don't count.
 * - Each salesman's eligible collections are totalled per calendar quarter and
 *   paid in bands, each band at its own rate (commission_bands).
 */

export const COMMISSION_WINDOW_DAYS = 100;
export const COMMISSION_COUNTRIES: UserCountry[] = ["UAE"];

export interface CommissionBand {
  from: number;
  to: number | null;
  rate: number; // percent
}

export interface BandPart extends CommissionBand {
  amount: number;
  commission: number;
}

export interface CommissionLine {
  receiptId: string;
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  companyName?: string;
  invoiceDate: string;
  collectedOn: string;
  days: number;
  amount: number;
  eligible: boolean;
}

export interface CommissionPayout {
  id: string;
  eligibleAmount: number;
  commissionAmount: number;
  paidAt: string;
  paidByName?: string;
  notes?: string;
}

export interface SalesmanCommission {
  salesmanId: string;
  salesmanName: string;
  eligibleTotal: number;
  lateTotal: number;
  commission: number;
  breakdown: BandPart[];
  nextBand: { from: number; rate: number; remaining: number } | null;
  lines: CommissionLine[];
  payout: CommissionPayout | null;
}

export interface WatchItem {
  invoiceId: string;
  invoiceNumber: string;
  salesmanId: string;
  salesmanName: string;
  companyName?: string;
  invoiceDate: string;
  outstanding: number;
  daysSince: number;
  daysLeft: number;
}

export interface CommissionReport {
  country: UserCountry;
  year: number;
  quarter: number;
  start: string;
  end: string;
  windowDays: number;
  bands: CommissionBand[];
  salesmen: SalesmanCommission[];
  watchlist: WatchItem[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function quarterOf(date: Date): { year: number; quarter: number } {
  return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
}

/** First and last day of a calendar quarter as YYYY-MM-DD. */
export function quarterRange(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, startMonth + 3, 0)).getUTCDate();
  return {
    start: `${year}-${pad(startMonth + 1)}-01`,
    end: `${year}-${pad(startMonth + 3)}-${pad(lastDay)}`,
  };
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}

/** Today in Dubai as YYYY-MM-DD. */
export function todayInDubai(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Each band at its own rate: 40,000 → 0% of 25k + 3% of 10k + 4% of 5k = 500. */
export function commissionFor(total: number, bands: CommissionBand[]) {
  const sorted = [...bands].sort((x, y) => x.from - y.from);
  const breakdown: BandPart[] = [];
  let commission = 0;
  for (const band of sorted) {
    const top = band.to ?? Infinity;
    const amount = Math.max(0, Math.min(total, top) - band.from);
    const part = round((amount * band.rate) / 100);
    commission += part;
    breakdown.push({ ...band, amount: round(amount), commission: part });
  }
  // The next band with a higher rate than the one the total is in.
  const current = sorted.filter((b) => total >= b.from).pop();
  const next = sorted.find((b) => b.from > total && b.rate > (current?.rate ?? 0));
  return {
    commission: round(commission),
    breakdown,
    nextBand: next ? { from: next.from, rate: next.rate, remaining: round(next.from - total) } : null,
  };
}

export async function loadCommissionBands(client: SupabaseClient, country: UserCountry): Promise<CommissionBand[]> {
  const { data, error } = await client
    .from("commission_bands")
    .select("from_amount, to_amount, rate")
    .eq("country", country)
    .order("from_amount", { ascending: true });
  if (error) throw new Error(`Could not read commission bands: ${error.message}`);
  return (data || []).map((b: any) => ({
    from: Number(b.from_amount) || 0,
    to: b.to_amount === null || b.to_amount === undefined ? null : Number(b.to_amount),
    rate: Number(b.rate) || 0,
  }));
}

/**
 * Commission for the given salesmen in one quarter, plus the open invoices that
 * still have time left in their 100-day window (soonest deadline first).
 */
export async function buildCommissionReport(
  client: SupabaseClient,
  country: UserCountry,
  salesmen: Array<{ id: string; name: string }>,
  year: number,
  quarter: number
): Promise<CommissionReport> {
  const { start, end } = quarterRange(year, quarter);
  const bands = await loadCommissionBands(client, country);
  const ids = salesmen.map((s) => s.id);
  const names = new Map(salesmen.map((s) => [s.id, s.name]));

  const linesBySalesman = new Map<string, CommissionLine[]>();
  ids.forEach((id) => linesBySalesman.set(id, []));

  if (ids.length > 0) {
    const { data, error } = await client
      .from("commission_collections")
      .select("*")
      .eq("country", country)
      .in("salesman_id", ids)
      .gte("collected_on", start)
      .lte("collected_on", end)
      .order("collected_on", { ascending: true });
    if (error) throw new Error(`Could not read collections: ${error.message}`);

    (data || []).forEach((row: any) => {
      const invoiceDate = String(row.invoice_date || "").slice(0, 10);
      const collectedOn = String(row.collected_on || "").slice(0, 10);
      const days = invoiceDate && collectedOn ? daysBetween(invoiceDate, collectedOn) : 0;
      linesBySalesman.get(row.salesman_id)?.push({
        receiptId: row.receipt_id,
        receiptNumber: row.receipt_number,
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        companyName: row.company_name || undefined,
        invoiceDate,
        collectedOn,
        days,
        amount: Number(row.amount) || 0,
        eligible: days <= COMMISSION_WINDOW_DAYS,
      });
    });
  }

  // Payouts already recorded for this quarter.
  const payouts = new Map<string, CommissionPayout>();
  if (ids.length > 0) {
    const { data } = await client
      .from("commission_payouts")
      .select("*")
      .eq("year", year)
      .eq("quarter", quarter)
      .in("salesman_id", ids);
    const { data: people } = await client.from("profiles").select("id, full_name");
    const peopleNames = new Map((people || []).map((p: any) => [p.id, p.full_name]));
    (data || []).forEach((p: any) =>
      payouts.set(p.salesman_id, {
        id: p.id,
        eligibleAmount: Number(p.eligible_amount) || 0,
        commissionAmount: Number(p.commission_amount) || 0,
        paidAt: p.paid_at,
        paidByName: (p.paid_by && peopleNames.get(p.paid_by)) || undefined,
        notes: p.notes || undefined,
      })
    );
  }

  const result: SalesmanCommission[] = ids.map((id) => {
    const lines = linesBySalesman.get(id) || [];
    const eligibleTotal = round(lines.filter((l) => l.eligible).reduce((s, l) => s + l.amount, 0));
    const lateTotal = round(lines.filter((l) => !l.eligible).reduce((s, l) => s + l.amount, 0));
    const calc = commissionFor(eligibleTotal, bands);
    return {
      salesmanId: id,
      salesmanName: names.get(id) || "Salesman",
      eligibleTotal,
      lateTotal,
      commission: calc.commission,
      breakdown: calc.breakdown,
      nextBand: calc.nextBand,
      lines,
      payout: payouts.get(id) || null,
    };
  });

  // Open invoices still inside their window, soonest deadline first.
  const watchlist: WatchItem[] = [];
  if (ids.length > 0) {
    const today = todayInDubai();
    const { data } = await client
      .from("invoice_balances")
      .select("invoice_id, invoice_number, salesman_id, customer_id, invoice_date, outstanding")
      .eq("country", country)
      .in("salesman_id", ids)
      .gt("outstanding", 0);
    const customerIds = Array.from(new Set((data || []).map((r: any) => r.customer_id).filter(Boolean)));
    const customerNames = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: custs } = await client.from("customers").select("id, company_name").in("id", customerIds);
      (custs || []).forEach((c: any) => customerNames.set(c.id, c.company_name));
    }
    (data || []).forEach((r: any) => {
      const invoiceDate = String(r.invoice_date || "").slice(0, 10);
      if (!invoiceDate) return;
      const daysSince = daysBetween(invoiceDate, today);
      const daysLeft = COMMISSION_WINDOW_DAYS - daysSince;
      if (daysLeft < 0) return;
      watchlist.push({
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        salesmanId: r.salesman_id,
        salesmanName: names.get(r.salesman_id) || "Salesman",
        companyName: customerNames.get(r.customer_id),
        invoiceDate,
        outstanding: Number(r.outstanding) || 0,
        daysSince,
        daysLeft,
      });
    });
    watchlist.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  return { country, year, quarter, start, end, windowDays: COMMISSION_WINDOW_DAYS, bands, salesmen: result, watchlist };
}

/** The salesmen a user may see commission for: staff see their country's, a salesman himself. */
export async function commissionSalesmenFor(client: SupabaseClient, profile: any): Promise<Array<{ id: string; name: string }>> {
  if (profile.role === "salesperson") return [{ id: profile.id, name: profile.full_name || "Me" }];
  if (!isCountryStaff(profile)) return [];
  const { data } = await client
    .from("profiles")
    .select("id, full_name")
    .eq("role", "salesperson")
    .eq("country", profile.country)
    .order("full_name", { ascending: true });
  return (data || []).map((p: any) => ({ id: p.id, name: p.full_name || "Salesman" }));
}

