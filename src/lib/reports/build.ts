import { SupabaseClient } from "@supabase/supabase-js";
import { Profile } from "@/types";
import { isCountryStaff } from "@/lib/auth/permissions";
import { todayInDubai, COMMISSION_WINDOW_DAYS, daysBetween } from "@/lib/db/commission";
import { ReportColumn, ReportDef, ReportResult } from "./catalog";

/**
 * Builds a report for the user's active country. Salesmen only ever get their
 * own figures (their invoices, their customers' balances, receipts they
 * collected, their expenses), whatever filter they send.
 */

export interface ReportParams {
  from?: string;
  to?: string;
  salesmanId?: string;
  series?: "standard" | "oman_reg" | "";
  method?: string;
  chequeStatus?: string;
  expenseStatus?: string;
  /** Approaching 100 days: days left at most (default 30). */
  within?: number;
  /** Overdue: overdue by at least this many days (default 1). */
  overdueBy?: number;
  /** Expiry: 0 = expired only, n = expired or expiring within n months, -1 = everything. */
  expiryWithin?: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: any) => Number(v) || 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
const KIND_LABEL: Record<string, string> = { standard: "UAE-reg", oman_reg: "Oman-reg" };

/** Supabase returns at most 1000 rows per request; read every page. */
async function fetchAll<T = any>(build: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function defaultPeriod(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export async function buildReport(
  client: SupabaseClient,
  profile: Profile,
  def: ReportDef,
  params: ReportParams
): Promise<ReportResult> {
  const country = profile.country;
  const office = isCountryStaff(profile);
  const today = todayInDubai();

  const period = (() => {
    if (!def.filters.includes("period")) return null;
    const d = defaultPeriod(today);
    const from = params.from && DAY_RE.test(params.from) ? params.from : d.from;
    const to = params.to && DAY_RE.test(params.to) ? params.to : d.to;
    return from <= to ? { from, to } : { from: to, to: from };
  })();

  // Salesmen are always limited to themselves.
  const salesmanId = office ? params.salesmanId || "" : profile.id;
  const series = country === "UAE" && params.series ? params.series : "";

  // Names for display.
  const { data: peopleRows } = await client
    .from("profiles")
    .select("id, full_name, role, country, is_active")
    .order("full_name", { ascending: true });
  const names = new Map<string, string>((peopleRows || []).map((p: any) => [p.id, p.full_name || "—"]));
  const nameOf = (id?: string | null) => (id && names.get(id)) || "—";
  const people = office
    ? (peopleRows || [])
        .filter((p: any) => p.country === country && (p.role === "salesperson" || p.role === "super_admin"))
        .map((p: any) => ({ id: p.id, name: p.full_name || "—" }))
    : undefined;

  const filters: string[] = [];
  if (salesmanId) filters.push(`${office ? "Salesman" : "For"}: ${nameOf(salesmanId)}`);
  if (series) filters.push(`Kind: ${series === "oman_reg" ? "Oman-registered" : "UAE-registered"}`);

  const base = (partial: Omit<ReportResult, "key" | "title" | "country" | "period" | "asOf" | "filters" | "people">): ReportResult => ({
    key: def.key,
    title: def.title,
    country,
    period,
    asOf: today,
    filters,
    people,
    ...partial,
  });

  const withKind = country === "UAE";

  switch (def.key) {
    /* ------------------------------------------------------------ sales */
    case "sales-register": {
      const invoices = await fetchAll(() => {
        let q = client
          .from("invoices")
          .select("id, invoice_number, invoice_date, company_name, customer_name, salesman_id, grand_total, billing_series, is_deleted")
          .eq("country", country)
          .gte("invoice_date", period!.from)
          .lte("invoice_date", period!.to)
          .order("invoice_date", { ascending: true })
          .order("invoice_number", { ascending: true });
        if (salesmanId) q = q.eq("salesman_id", salesmanId);
        if (series) q = q.eq("billing_series", series);
        return q;
      });
      const rows = invoices
        .filter((i: any) => i.is_deleted !== true)
        .map((i: any) => ({
          date: String(i.invoice_date || "").slice(0, 10),
          number: i.invoice_number,
          customer: i.company_name || i.customer_name || "—",
          salesman: nameOf(i.salesman_id),
          ...(withKind ? { kind: KIND_LABEL[i.billing_series || "standard"] } : {}),
          total: round(num(i.grand_total)),
        }));
      const total = round(rows.reduce((s, r) => s + num(r.total), 0));
      const columns: ReportColumn[] = [
        { key: "date", label: "Date", type: "date" },
        { key: "number", label: "Invoice", type: "text" },
        { key: "customer", label: "Customer", type: "text" },
        { key: "salesman", label: "Salesman", type: "text" },
        ...(withKind ? [{ key: "kind", label: "Kind", type: "text" as const }] : []),
        { key: "total", label: "Total", type: "money" },
      ];
      return base({
        summary: [
          { label: "Invoices", value: rows.length, type: "number" },
          { label: "Total sales", value: total, type: "money" },
          { label: "Average invoice", value: rows.length ? round(total / rows.length) : 0, type: "money" },
        ],
        columns,
        rows,
        totals: { total },
      });
    }

    case "sales-by-product": {
      const invoices = await fetchAll(() => {
        let q = client
          .from("invoices")
          .select("id, is_deleted")
          .eq("country", country)
          .gte("invoice_date", period!.from)
          .lte("invoice_date", period!.to);
        if (salesmanId) q = q.eq("salesman_id", salesmanId);
        if (series) q = q.eq("billing_series", series);
        return q;
      });
      const ids = invoices.filter((i: any) => i.is_deleted !== true).map((i: any) => i.id);
      const items: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        items.push(
          ...(await fetchAll(() =>
            client.from("invoice_items").select("invoice_id, product_id, quantity, line_total").in("invoice_id", chunk)
          ))
        );
      }
      const productIds = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean)));
      const productNames = new Map<string, string>();
      for (let i = 0; i < productIds.length; i += 200) {
        const { data } = await client.from("products").select("id, name").in("id", productIds.slice(i, i + 200));
        (data || []).forEach((p: any) => productNames.set(p.id, p.name));
      }
      const byProduct = new Map<string, { qty: number; value: number; free: number; invoices: Set<string> }>();
      items.forEach((it) => {
        const key = it.product_id || "unknown";
        const p = byProduct.get(key) || { qty: 0, value: 0, free: 0, invoices: new Set<string>() };
        const qty = num(it.quantity);
        const value = num(it.line_total);
        p.qty += qty;
        p.value += value;
        if (value === 0) p.free += qty;
        p.invoices.add(it.invoice_id);
        byProduct.set(key, p);
      });
      const rows = Array.from(byProduct.entries())
        .map(([id, p]) => ({
          product: productNames.get(id) || "Unknown product",
          qty: p.qty,
          free: p.free,
          invoices: p.invoices.size,
          avgPrice: p.qty - p.free > 0 ? round(p.value / (p.qty - p.free)) : 0,
          value: round(p.value),
        }))
        .sort((a, b) => b.value - a.value);
      const totals = {
        qty: rows.reduce((s, r) => s + r.qty, 0),
        free: rows.reduce((s, r) => s + r.free, 0),
        value: round(rows.reduce((s, r) => s + r.value, 0)),
      };
      return base({
        summary: [
          { label: "Products sold", value: rows.length, type: "number" },
          { label: "Units", value: totals.qty, type: "number" },
          { label: "Sales value", value: totals.value, type: "money" },
        ],
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "qty", label: "Qty", type: "number" },
          { key: "free", label: "Of which free", type: "number" },
          { key: "invoices", label: "Invoices", type: "number" },
          { key: "avgPrice", label: "Avg price", type: "money" },
          { key: "value", label: "Value", type: "money" },
        ],
        rows,
        totals,
      });
    }

    /* ------------------------------------------------------ receivables */
    case "outstanding": {
      const balances = await fetchAll(() => {
        let q = client
          .from("invoice_balances")
          .select("customer_id, salesman_id, outstanding, days_overdue, billing_series")
          .eq("country", country)
          .gt("outstanding", 0);
        if (salesmanId) q = q.eq("salesman_id", salesmanId);
        if (series) q = q.eq("billing_series", series);
        return q;
      });
      const customerIds = Array.from(new Set(balances.map((b: any) => b.customer_id)));
      const customers = new Map<string, any>();
      for (let i = 0; i < customerIds.length; i += 200) {
        const { data } = await client
          .from("customers")
          .select("id, company_name, assigned_salesman_id")
          .in("id", customerIds.slice(i, i + 200));
        (data || []).forEach((c: any) => customers.set(c.id, c));
      }
      const buckets = ["current", "d30", "d60", "d90", "d90plus"] as const;
      const bucketOf = (days: number) =>
        days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "d90plus";
      const byCustomer = new Map<string, any>();
      balances.forEach((b: any) => {
        const c = customers.get(b.customer_id);
        const row =
          byCustomer.get(b.customer_id) ||
          {
            customer: c?.company_name || "Customer",
            salesman: nameOf(c?.assigned_salesman_id || b.salesman_id),
            current: 0,
            d30: 0,
            d60: 0,
            d90: 0,
            d90plus: 0,
            total: 0,
          };
        const amount = num(b.outstanding);
        row[bucketOf(num(b.days_overdue))] += amount;
        row.total += amount;
        byCustomer.set(b.customer_id, row);
      });
      const rows = Array.from(byCustomer.values())
        .map((r) => {
          buckets.forEach((k) => (r[k] = round(r[k])));
          r.total = round(r.total);
          return r;
        })
        .sort((a, b) => b.total - a.total);
      const totals: Record<string, number> = {};
      [...buckets, "total"].forEach((k) => (totals[k] = round(rows.reduce((s, r) => s + num(r[k]), 0))));
      const overdue = round(totals.total - totals.current);

      // Payments and credit notes not yet matched to an invoice reduce what is
      // owed (they are not tied to one kind, so only shown without a kind filter).
      let unallocated = 0;
      if (!series) {
        const credits = await fetchAll(() =>
          client
            .from("customer_balances")
            .select("customer_id, unapplied_payments, unapplied_credit_notes")
            .eq("country", country)
            .or("unapplied_payments.gt.0,unapplied_credit_notes.gt.0")
        );
        let allowed: Set<string> | null = null;
        if (salesmanId && credits.length > 0) {
          const { data } = await client
            .from("customers")
            .select("id")
            .eq("assigned_salesman_id", salesmanId)
            .in("id", credits.map((c: any) => c.customer_id));
          allowed = new Set((data || []).map((c: any) => c.id));
        }
        unallocated = round(
          credits
            .filter((c: any) => !allowed || allowed.has(c.customer_id))
            .reduce((s: number, c: any) => s + num(c.unapplied_payments) + num(c.unapplied_credit_notes), 0)
        );
      }

      return base({
        summary: [
          { label: "Customers owing", value: rows.length, type: "number" },
          { label: "Unpaid invoices", value: totals.total, type: "money" },
          ...(unallocated > 0
            ? [
                { label: "Less unallocated payments", value: unallocated, type: "money" as const },
                { label: "Net owed", value: round(totals.total - unallocated), type: "money" as const },
              ]
            : []),
          { label: "Overdue", value: overdue, type: "money" },
        ],
        columns: [
          { key: "customer", label: "Customer", type: "text" },
          { key: "salesman", label: "Salesman", type: "text" },
          { key: "current", label: "Not due", type: "money" },
          { key: "d30", label: "1–30 days", type: "money" },
          { key: "d60", label: "31–60", type: "money" },
          { key: "d90", label: "61–90", type: "money" },
          { key: "d90plus", label: "90+", type: "money" },
          { key: "total", label: "Total", type: "money" },
        ],
        rows,
        totals,
      });
    }

    case "approaching-100":
    case "overdue": {
      const approaching = def.key === "approaching-100";
      const balances = await fetchAll(() => {
        let q = client
          .from("invoice_balances")
          .select("invoice_id, invoice_number, customer_id, salesman_id, invoice_date, due_date, credit_days, grand_total, outstanding, days_overdue, billing_series")
          .eq("country", country)
          .gt("outstanding", 0);
        if (salesmanId) q = q.eq("salesman_id", salesmanId);
        if (series) q = q.eq("billing_series", series);
        return q;
      });

      const within = Math.max(1, Math.min(100, Math.floor(params.within || 30)));
      const overdueBy = Math.max(1, Math.floor(params.overdueBy || 1));
      const addDays = (day: string, n: number) => {
        const d = new Date(`${day}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
      };

      const picked = balances
        .map((b: any) => {
          const invoiceDate = String(b.invoice_date || "").slice(0, 10);
          const age = invoiceDate ? daysBetween(invoiceDate, today) : 0;
          return { ...b, invoiceDate, age, daysLeft: COMMISSION_WINDOW_DAYS - age };
        })
        .filter((b: any) =>
          approaching
            ? b.invoiceDate && b.daysLeft >= 0 && b.daysLeft <= within
            : num(b.days_overdue) >= overdueBy
        );

      const customerIds = Array.from(new Set(picked.map((b: any) => b.customer_id)));
      const customers = new Map<string, any>();
      for (let i = 0; i < customerIds.length; i += 200) {
        const { data } = await client
          .from("customers")
          .select("id, company_name, phone")
          .in("id", customerIds.slice(i, i + 200));
        (data || []).forEach((c: any) => customers.set(c.id, c));
      }

      if (approaching) {
        filters.push(`${within} days or less left of ${COMMISSION_WINDOW_DAYS}`);
        const rows = picked
          .sort((a: any, b: any) => a.daysLeft - b.daysLeft || num(b.outstanding) - num(a.outstanding))
          .map((b: any) => ({
            deadline: addDays(b.invoiceDate, COMMISSION_WINDOW_DAYS),
            daysLeft: b.daysLeft,
            number: b.invoice_number,
            date: b.invoiceDate,
            customer: customers.get(b.customer_id)?.company_name || "Customer",
            phone: customers.get(b.customer_id)?.phone || "—",
            salesman: nameOf(b.salesman_id),
            outstanding: round(num(b.outstanding)),
          }));
        const total = round(rows.reduce((s, r) => s + num(r.outstanding), 0));
        const sumUpTo = (d: number) =>
          round(rows.filter((r) => num(r.daysLeft) <= d).reduce((s, r) => s + num(r.outstanding), 0));
        return base({
          summary: [
            { label: "Invoices", value: rows.length, type: "number" },
            { label: "To collect", value: total, type: "money" },
            { label: "Within 7 days", value: sumUpTo(7), type: "money" },
            { label: "Within 15 days", value: sumUpTo(15), type: "money" },
          ],
          columns: [
            { key: "deadline", label: "100 days on", type: "date" },
            { key: "daysLeft", label: "Days left", type: "number" },
            { key: "number", label: "Invoice", type: "text" },
            { key: "date", label: "Invoice date", type: "date" },
            { key: "customer", label: "Customer", type: "text" },
            { key: "phone", label: "Phone", type: "text" },
            { key: "salesman", label: "Salesman", type: "text" },
            { key: "outstanding", label: "Unpaid", type: "money" },
          ],
          rows,
          totals: { outstanding: total },
        });
      }

      if (overdueBy > 1) filters.push(`Overdue by ${overdueBy}+ days`);
      const rows = picked
        .sort((a: any, b: any) => num(b.days_overdue) - num(a.days_overdue) || num(b.outstanding) - num(a.outstanding))
        .map((b: any) => ({
          number: b.invoice_number,
          date: b.invoiceDate,
          due: String(b.due_date || "").slice(0, 10) || null,
          daysOverdue: num(b.days_overdue),
          customer: customers.get(b.customer_id)?.company_name || "Customer",
          phone: customers.get(b.customer_id)?.phone || "—",
          salesman: nameOf(b.salesman_id),
          invoiceTotal: round(num(b.grand_total)),
          outstanding: round(num(b.outstanding)),
        }));
      const total = round(rows.reduce((s, r) => s + num(r.outstanding), 0));
      const sumOver = (d: number) =>
        round(rows.filter((r) => num(r.daysOverdue) > d).reduce((s, r) => s + num(r.outstanding), 0));
      return base({
        summary: [
          { label: "Overdue invoices", value: rows.length, type: "number" },
          { label: "Customers", value: new Set(picked.map((b: any) => b.customer_id)).size, type: "number" },
          { label: "Overdue amount", value: total, type: "money" },
          { label: "Over 90 days", value: sumOver(90), type: "money" },
        ],
        columns: [
          { key: "number", label: "Invoice", type: "text" },
          { key: "date", label: "Invoice date", type: "date" },
          { key: "due", label: "Due", type: "date" },
          { key: "daysOverdue", label: "Days overdue", type: "number" },
          { key: "customer", label: "Customer", type: "text" },
          { key: "phone", label: "Phone", type: "text" },
          { key: "salesman", label: "Salesman", type: "text" },
          { key: "invoiceTotal", label: "Invoice total", type: "money" },
          { key: "outstanding", label: "Unpaid", type: "money" },
        ],
        rows,
        totals: { outstanding: total },
      });
    }

    case "collections": {
      const receipts = await fetchAll(() => {
        let q = client
          .from("receipts")
          .select("receipt_number, payment_date, company_name, customer_name, payment_method, amount_paid, created_by, billing_series, cheque_status, is_deleted")
          .eq("country", country)
          .gte("payment_date", period!.from)
          .lte("payment_date", period!.to)
          .order("payment_date", { ascending: true })
          .order("receipt_number", { ascending: true });
        if (salesmanId) q = q.eq("created_by", salesmanId);
        if (series) q = q.eq("billing_series", series);
        if (params.method) q = q.eq("payment_method", params.method);
        return q;
      });
      const rows = receipts
        .filter((r: any) => r.is_deleted !== true)
        .map((r: any) => ({
          date: String(r.payment_date || "").slice(0, 10),
          number: r.receipt_number,
          customer: r.company_name || r.customer_name || "—",
          method: r.payment_method === "Cheque" && r.cheque_status ? `Cheque (${r.cheque_status})` : r.payment_method || "—",
          collectedBy: nameOf(r.created_by),
          ...(withKind ? { kind: KIND_LABEL[r.billing_series || "standard"] } : {}),
          amount: round(num(r.amount_paid)),
        }));
      const sumWhere = (test: (m: string) => boolean) =>
        round(rows.filter((r) => test(String(r.method))).reduce((s, r) => s + num(r.amount), 0));
      const total = round(rows.reduce((s, r) => s + num(r.amount), 0));
      return base({
        summary: [
          { label: "Total collected", value: total, type: "money" },
          { label: "Cash", value: sumWhere((m) => m === "Cash"), type: "money" },
          { label: "Bank transfer", value: sumWhere((m) => m === "Bank Transfer"), type: "money" },
          { label: "Cheques", value: sumWhere((m) => m.startsWith("Cheque")), type: "money" },
        ],
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "number", label: "Receipt", type: "text" },
          { key: "customer", label: "Customer", type: "text" },
          { key: "method", label: "Method", type: "text" },
          { key: "collectedBy", label: "Collected by", type: "text" },
          ...(withKind ? [{ key: "kind", label: "Kind", type: "text" as const }] : []),
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows,
        totals: { amount: total },
      });
    }

    case "cheques": {
      const receipts = await fetchAll(() => {
        let q = client
          .from("receipts")
          .select("receipt_number, payment_date, cheque_date, cheque_number, bank_name, company_name, customer_name, amount_paid, cheque_status, created_by, cheque_received_at, is_deleted")
          .eq("country", country)
          .eq("payment_method", "Cheque")
          .order("cheque_date", { ascending: true });
        if (salesmanId) q = q.eq("created_by", salesmanId);
        if (params.chequeStatus) q = q.eq("cheque_status", params.chequeStatus);
        return q;
      });
      const rows = receipts
        .filter((r: any) => r.is_deleted !== true)
        .filter((r: any) => {
          const d = String(r.cheque_date || r.payment_date || "").slice(0, 10);
          return d >= period!.from && d <= period!.to;
        })
        .map((r: any) => ({
          chequeDate: String(r.cheque_date || r.payment_date || "").slice(0, 10),
          customer: r.company_name || r.customer_name || "—",
          chequeNo: r.cheque_number || "—",
          bank: r.bank_name || "—",
          receipt: r.receipt_number,
          collectedBy: nameOf(r.created_by),
          status:
            (r.cheque_status || "Pending") === "Pending"
              ? r.cheque_received_at
                ? "Waiting (at office)"
                : "Waiting (with salesman)"
              : r.cheque_status,
          amount: round(num(r.amount_paid)),
        }));
      const sumStatus = (s: string) =>
        round(rows.filter((r) => String(r.status).startsWith(s)).reduce((t, r) => t + num(r.amount), 0));
      const total = round(rows.reduce((s, r) => s + num(r.amount), 0));
      return base({
        summary: [
          { label: "Cheques", value: rows.length, type: "number" },
          { label: "Waiting", value: sumStatus("Waiting"), type: "money" },
          { label: "Cleared", value: sumStatus("Cleared"), type: "money" },
          { label: "Bounced", value: sumStatus("Bounced"), type: "money" },
        ],
        columns: [
          { key: "chequeDate", label: "Cheque date", type: "date" },
          { key: "customer", label: "Customer", type: "text" },
          { key: "chequeNo", label: "Cheque no.", type: "text" },
          { key: "bank", label: "Bank", type: "text" },
          { key: "receipt", label: "Receipt", type: "text" },
          { key: "collectedBy", label: "Collected by", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows,
        totals: { amount: total },
      });
    }

    /* --------------------------------------------------------- expenses */
    case "expenses": {
      const expenses = await fetchAll(() => {
        let q = client
          .from("expenses")
          .select("expense_number, expense_date, category, amount, description, status, payment_method, salesperson_id, employee_id, created_by, is_deleted")
          .eq("country", country)
          .gte("expense_date", period!.from)
          .lte("expense_date", period!.to)
          .order("expense_date", { ascending: true });
        if (salesmanId) q = q.or(`salesperson_id.eq.${salesmanId},employee_id.eq.${salesmanId}`);
        if (params.expenseStatus) q = q.eq("status", params.expenseStatus);
        else q = q.neq("status", "Rejected");
        return q;
      });
      const rows = expenses
        .filter((e: any) => e.is_deleted !== true)
        .map((e: any) => ({
          date: String(e.expense_date || "").slice(0, 10),
          number: e.expense_number,
          person: nameOf(e.salesperson_id || e.employee_id || e.created_by),
          category: e.category,
          description: e.description || "",
          method: e.payment_method || "Cash",
          status: e.status || "Pending",
          amount: round(num(e.amount)),
        }));
      const byCategory = new Map<string, number>();
      rows.forEach((r) => byCategory.set(String(r.category), (byCategory.get(String(r.category)) || 0) + num(r.amount)));
      const total = round(rows.reduce((s, r) => s + num(r.amount), 0));
      const topCategories = Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, value]) => ({ label, value: round(value), type: "money" as const }));
      if (!params.expenseStatus) filters.push("Status: approved and pending");
      return base({
        summary: [{ label: "Total expenses", value: total, type: "money" }, ...topCategories],
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "number", label: "Expense", type: "text" },
          { key: "person", label: "Person", type: "text" },
          { key: "category", label: "Category", type: "text" },
          { key: "description", label: "Details", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows,
        totals: { amount: total },
      });
    }

    /* ------------------------------------------------------------ stock */
    case "expiry": {
      const months = params.expiryWithin === undefined || isNaN(params.expiryWithin) ? 6 : params.expiryWithin;
      const limit = (() => {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + Math.max(months, 0));
        return d.toISOString().slice(0, 10);
      })();
      const lots = await fetchAll(() =>
        client
          .from("batch_stock")
          .select("product_id, expiry_date, qty_remaining, days_to_expiry, needs_check, is_active")
          .eq("country", country)
          .gt("qty_remaining", 0)
          .order("expiry_date", { ascending: true })
      );
      const prodIds = Array.from(new Set(lots.map((l: any) => l.product_id)));
      const prods = new Map<string, any>();
      for (let i = 0; i < prodIds.length; i += 150) {
        const { data } = await client
          .from("products")
          .select("id, name, manufacturer, cost_price, selling_price, cost_price_omr, selling_price_omr")
          .in("id", prodIds.slice(i, i + 150));
        (data || []).forEach((p: any) => prods.set(p.id, p));
      }
      const omr = country === "Oman";
      const rows = lots
        .filter((l: any) => l.is_active !== false && l.expiry_date)
        .filter((l: any) => {
          const e = String(l.expiry_date).slice(0, 10);
          if (months < 0) return true;
          if (months === 0) return e < today;
          return e <= limit;
        })
        .map((l: any) => {
          const p = prods.get(l.product_id) || {};
          const e = String(l.expiry_date).slice(0, 10);
          const days = num(l.days_to_expiry);
          const qty = num(l.qty_remaining);
          const cost = num(omr ? p.cost_price_omr : p.cost_price);
          const price = num(omr ? p.selling_price_omr : p.selling_price);
          return {
            product: p.name || "Product",
            company: p.manufacturer || "—",
            expiry: e,
            status: e < today ? `Expired ${-days} days ago` : `${days} days left`,
            qty,
            value: round(qty * price),
            costValue: round(qty * cost),
            check: l.needs_check ? "Confirm date" : "",
          };
        });
      if (months === 0) filters.push("Expired stock only");
      else if (months > 0) filters.push(`Expired or expiring by ${limit}`);
      const expired = rows.filter((r) => r.expiry < today);
      return base({
        summary: [
          { label: "Expired units", value: expired.reduce((s, r) => s + r.qty, 0), type: "number" },
          { label: "Expired, at price", value: round(expired.reduce((s, r) => s + r.value, 0)), type: "money" },
          { label: "Units in the list", value: rows.reduce((s, r) => s + r.qty, 0), type: "number" },
          { label: "Value at price", value: round(rows.reduce((s, r) => s + r.value, 0)), type: "money" },
        ],
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "company", label: "Company", type: "text" },
          { key: "expiry", label: "Expiry", type: "date" },
          { key: "status", label: "Status", type: "text" },
          { key: "qty", label: "Qty left", type: "number" },
          { key: "value", label: "Value at price", type: "money" },
          { key: "costValue", label: "Value at cost", type: "money" },
          { key: "check", label: "Note", type: "text" },
        ],
        rows,
        totals: {
          qty: rows.reduce((s, r) => s + r.qty, 0),
          value: round(rows.reduce((s, r) => s + r.value, 0)),
          costValue: round(rows.reduce((s, r) => s + r.costValue, 0)),
        },
      });
    }

    case "stock-summary": {
      const movements = await fetchAll(() =>
        client.from("inventory_transactions").select("product_id, quantity").eq("country", country)
      );
      const qtyBy = new Map<string, number>();
      movements.forEach((m: any) => qtyBy.set(m.product_id, (qtyBy.get(m.product_id) || 0) + num(m.quantity)));
      const products = await fetchAll(() =>
        client
          .from("products")
          .select("id, name, sku, registered_in, cost_price, selling_price, cost_price_omr, selling_price_omr, is_active")
          .order("name", { ascending: true })
      );
      const omr = country === "Oman";
      const rows = products
        .filter((p: any) => p.is_active !== false && (qtyBy.get(p.id) || 0) !== 0)
        .map((p: any) => {
          const qty = qtyBy.get(p.id) || 0;
          const cost = num(omr ? p.cost_price_omr : p.cost_price);
          return {
            product: p.name,
            sku: p.sku || "—",
            ...(withKind ? { kind: p.registered_in === "Oman" ? "Oman-reg" : "UAE-reg" } : {}),
            qty,
            cost: round(cost),
            price: round(num(omr ? p.selling_price_omr : p.selling_price)),
            value: round(qty * cost),
          };
        });
      const totals = {
        qty: rows.reduce((s, r) => s + num(r.qty), 0),
        value: round(rows.reduce((s, r) => s + num(r.value), 0)),
      };
      const noCost = rows.filter((r) => num(r.cost) === 0 && num(r.qty) > 0).length;
      if (noCost > 0) filters.push(`${noCost} product${noCost === 1 ? "" : "s"} without a cost price (valued at 0)`);
      return base({
        summary: [
          { label: "Products in stock", value: rows.filter((r) => num(r.qty) > 0).length, type: "number" },
          { label: "Units", value: totals.qty, type: "number" },
          { label: "Stock value (at cost)", value: totals.value, type: "money" },
        ],
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "sku", label: "Code", type: "text" },
          ...(withKind ? [{ key: "kind", label: "Kind", type: "text" as const }] : []),
          { key: "qty", label: "On hand", type: "number" },
          { key: "cost", label: "Unit cost", type: "money" },
          { key: "price", label: "Selling price", type: "money" },
          { key: "value", label: "Value at cost", type: "money" },
        ],
        rows,
        totals,
      });
    }
  }
}
