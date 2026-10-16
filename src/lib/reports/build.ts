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
  /** Slow-moving: no sale for at least this many months (default 6). */
  slowFor?: number;
  /** Reorder: months of sales the stock should cover (default 3). */
  coverMonths?: number;
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

interface SaleLine {
  productId: string;
  name: string;
  company: string;
  qty: number;
  value: number;
  list: number;
  cost: number;
  free: boolean;
  date: string;
}

/** Every sold line in a date range (deleted invoices left out), with the product's list and cost price. */
async function loadSaleLines(
  client: SupabaseClient,
  country: string,
  range: { from: string; to: string },
  opts: { salesmanId?: string; series?: string } = {}
): Promise<SaleLine[]> {
  const invoices = await fetchAll(() => {
    let q = client
      .from("invoices")
      .select("id, invoice_date, is_deleted")
      .eq("country", country)
      .gte("invoice_date", range.from)
      .lte("invoice_date", range.to);
    if (opts.salesmanId) q = q.eq("salesman_id", opts.salesmanId);
    if (opts.series) q = q.eq("billing_series", opts.series);
    return q;
  });
  const dateOf = new Map<string, string>();
  invoices.filter((i: any) => i.is_deleted !== true).forEach((i: any) => dateOf.set(i.id, String(i.invoice_date).slice(0, 10)));
  const ids = Array.from(dateOf.keys());
  const omr = country === "Oman";
  const out: SaleLine[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  for (let i = 0; i < chunks.length; i += 6) {
    const group = await Promise.all(
      chunks.slice(i, i + 6).map((chunk) =>
        fetchAll(() =>
          client
            .from("invoice_items")
            .select("invoice_id, product_id, quantity, unit_price, line_total, products(name, manufacturer, selling_price, selling_price_omr, cost_price, cost_price_omr)")
            .in("invoice_id", chunk)
        )
      )
    );
    group.flat().forEach((it: any) => {
      const qty = num(it.quantity);
      if (!it.product_id || qty <= 0) return;
      const p = Array.isArray(it.products) ? it.products[0] : it.products;
      const value = num(it.line_total);
      out.push({
        productId: it.product_id,
        name: p?.name || "Product",
        company: p?.manufacturer || "—",
        qty,
        value,
        list: num(omr ? p?.selling_price_omr : p?.selling_price) || num(it.unit_price),
        cost: num(omr ? p?.cost_price_omr : p?.cost_price),
        free: value <= 0.0005,
        date: dateOf.get(it.invoice_id) || "",
      });
    });
  }
  return out;
}

/** Quantity on hand per product, from the stock movements. */
async function stockOnHand(client: SupabaseClient, country: string): Promise<Map<string, number>> {
  const movements = await fetchAll(() => client.from("inventory_transactions").select("product_id, quantity").eq("country", country));
  const m = new Map<string, number>();
  movements.forEach((x: any) => m.set(x.product_id, (m.get(x.product_id) || 0) + num(x.quantity)));
  return m;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
            ...(office ? { costValue: round(qty * cost) } : { costValue: 0 }),
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
          // Cost prices are for the office only.
          ...(office ? [{ key: "costValue", label: "Value at cost", type: "money" as const }] : []),
          { key: "check", label: "Note", type: "text" },
        ],
        rows,
        totals: {
          qty: rows.reduce((s, r) => s + r.qty, 0),
          value: round(rows.reduce((s, r) => s + r.value, 0)),
          ...(office ? { costValue: round(rows.reduce((s, r) => s + r.costValue, 0)) } : {}),
        },
      });
    }

    case "slow-moving": {
      const months = [3, 6, 12].includes(Number(params.slowFor)) ? Number(params.slowFor) : 6;
      const since = (() => {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - months);
        return d.toISOString().slice(0, 10);
      })();
      const nearLimit = (() => {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + 6);
        return d.toISOString().slice(0, 10);
      })();

      // Stock on hand today.
      const movements = await fetchAll(() =>
        client.from("inventory_transactions").select("product_id, quantity").eq("country", country)
      );
      const onHand = new Map<string, number>();
      movements.forEach((m: any) => onHand.set(m.product_id, (onHand.get(m.product_id) || 0) + num(m.quantity)));

      // Last sale of each product (all invoices of the country that are not deleted).
      const invs = await fetchAll(() => client.from("invoices").select("id, invoice_date, is_deleted").eq("country", country));
      const dateOf = new Map<string, string>();
      invs.filter((i: any) => i.is_deleted !== true).forEach((i: any) => dateOf.set(i.id, String(i.invoice_date).slice(0, 10)));
      const ids = Array.from(dateOf.keys());
      const lastSold = new Map<string, string>();
      const soldSince = new Map<string, number>();
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      for (let i = 0; i < chunks.length; i += 6) {
        const group = await Promise.all(
          chunks.slice(i, i + 6).map((chunk) =>
            fetchAll(() => client.from("invoice_items").select("invoice_id, product_id, quantity").in("invoice_id", chunk))
          )
        );
        group.flat().forEach((it: any) => {
          if (!it.product_id || num(it.quantity) <= 0) return;
          const d = dateOf.get(it.invoice_id);
          if (!d) return;
          if (!lastSold.has(it.product_id) || d > (lastSold.get(it.product_id) as string)) lastSold.set(it.product_id, d);
          if (d >= since) soldSince.set(it.product_id, (soldSince.get(it.product_id) || 0) + num(it.quantity));
        });
      }

      // Expiry lots with stock.
      const lots = await fetchAll(() =>
        client.from("batch_stock").select("product_id, expiry_date, qty_remaining, is_active").eq("country", country).gt("qty_remaining", 0)
      );
      const lotInfo = new Map<string, { expired: number; near: number; first: string | null }>();
      lots
        .filter((l: any) => l.is_active !== false && l.expiry_date)
        .forEach((l: any) => {
          const e = String(l.expiry_date).slice(0, 10);
          const cur = lotInfo.get(l.product_id) || { expired: 0, near: 0, first: null };
          if (e < today) cur.expired += num(l.qty_remaining);
          else if (e <= nearLimit) cur.near += num(l.qty_remaining);
          if (!cur.first || e < cur.first) cur.first = e;
          lotInfo.set(l.product_id, cur);
        });

      const products = await fetchAll(() =>
        client
          .from("products")
          .select("id, name, manufacturer, cost_price, selling_price, cost_price_omr, selling_price_omr, is_active")
          .order("name", { ascending: true })
      );
      const omr = country === "Oman";
      const daysAgo = (d: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);

      const rows = products
        .filter((p: any) => p.is_active !== false && (onHand.get(p.id) || 0) > 0)
        .map((p: any) => {
          const qty = onHand.get(p.id) || 0;
          const last = lastSold.get(p.id) || null;
          const slow = !last || last < since;
          const lot = lotInfo.get(p.id);
          const expired = lot?.expired || 0;
          const near = lot?.near || 0;
          let priority = 0;
          let action = "";
          if (expired > 0) {
            priority = 1;
            action = `Expired stock (${expired}): remove from stock, return to the supplier or write off`;
          } else if (near > 0 && slow) {
            priority = 2;
            action = `Not selling and ${near} expiring within 6 months: offer to customers at a discount or FOC now`;
          } else if (near > 0) {
            priority = 3;
            action = `${near} expiring within 6 months: sell these lots first`;
          } else if (slow && !last) {
            priority = 4;
            action = "Never sold: check if it is still worth stocking";
          } else if (slow) {
            priority = 4;
            action = `No sale for ${months}+ months: push to customers, do not reorder`;
          }
          const price = num(omr ? p.selling_price_omr : p.selling_price);
          const cost = num(omr ? p.cost_price_omr : p.cost_price);
          return {
            priority,
            product: p.name,
            company: p.manufacturer || "—",
            qty,
            lastSold: last,
            daysSince: last ? daysAgo(last) : null,
            soldRecent: soldSince.get(p.id) || 0,
            nearestExpiry: lot?.first || null,
            value: round(qty * price),
            costValue: round(qty * cost),
            action,
          };
        })
        .filter((r) => r.priority > 0)
        .sort((a, b) => a.priority - b.priority || b.costValue - a.costValue);

      filters.push(`No sale for ${months} months or more, or expired / expiring within 6 months`);
      const slowRows = rows.filter((r) => !r.lastSold || r.lastSold < since);
      const sum = (list: typeof rows, k: "qty" | "value" | "costValue") => round(list.reduce((s, r) => s + num(r[k]), 0));
      return base({
        summary: [
          { label: "Products needing action", value: rows.length, type: "number" },
          { label: "Not selling", value: slowRows.length, type: "number" },
          { label: "Expired or near expiry", value: rows.filter((r) => r.priority <= 3 && (r.priority !== 4)).length, type: "number" },
          { label: "Stock value at cost", value: sum(rows, "costValue"), type: "money" },
        ],
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "company", label: "Company", type: "text" },
          { key: "qty", label: "On hand", type: "number" },
          { key: "lastSold", label: "Last sold", type: "date" },
          { key: "daysSince", label: "Days since", type: "number" },
          { key: "soldRecent", label: `Sold in ${months} mo`, type: "number" },
          { key: "nearestExpiry", label: "Earliest expiry", type: "date" },
          { key: "value", label: "Value at price", type: "money" },
          { key: "costValue", label: "Value at cost", type: "money" },
          { key: "action", label: "What to do", type: "text" },
        ],
        rows: rows.map(({ priority, ...r }) => r),
        totals: { qty: sum(rows, "qty"), value: sum(rows, "value"), costValue: sum(rows, "costValue") },
      });
    }

    case "reorder": {
      const cover = [2, 3, 4, 6].includes(Number(params.coverMonths)) ? Number(params.coverMonths) : 3;
      const windowDays = 90;
      const lines = await loadSaleLines(client, country, { from: addDays(today, -windowDays + 1), to: today });
      const onHand = await stockOnHand(client, country);
      const sold = new Map<string, { qty: number; name: string; company: string; cost: number; list: number }>();
      lines.forEach((l) => {
        const c = sold.get(l.productId) || { qty: 0, name: l.name, company: l.company, cost: l.cost, list: l.list };
        c.qty += l.qty;
        sold.set(l.productId, c);
      });
      const products = await fetchAll(() =>
        client.from("products").select("id, name, manufacturer, cost_price, cost_price_omr, is_active").order("name", { ascending: true })
      );
      const omr = country === "Oman";
      type R = { product: string; company: string; onHand: number; sold90: number; perMonth: number; weeksLeft: number | null; status: string; order: number; orderCost: number; rank: number };
      const rows: R[] = [];
      products
        .filter((p: any) => p.is_active !== false)
        .forEach((p: any) => {
          const have = Math.max(onHand.get(p.id) || 0, 0);
          const s = sold.get(p.id);
          const qty = s?.qty || 0;
          if (qty === 0 && have === 0) return;
          const perDay = qty / windowDays;
          const weeksLeft = perDay > 0 ? have / perDay / 7 : null;
          const need = Math.ceil(perDay * 30 * cover);
          const order = Math.max(need - have, 0);
          let status = "";
          let rank = 9;
          if (qty > 0 && have === 0) {
            status = "Out of stock: order now";
            rank = 0;
          } else if (weeksLeft !== null && weeksLeft < 4) {
            status = "Under 4 weeks left: order now";
            rank = 1;
          } else if (weeksLeft !== null && weeksLeft < 8) {
            status = "Under 8 weeks left: order soon";
            rank = 2;
          } else if (weeksLeft === null) {
            status = "Not sold in 90 days: do not order";
            rank = 5;
          } else if (weeksLeft > 26) {
            status = "Over 6 months of stock: do not order";
            rank = 4;
          } else {
            status = "Enough stock";
            rank = 3;
          }
          const cost = num(omr ? p.cost_price_omr : p.cost_price);
          rows.push({
            product: p.name,
            company: p.manufacturer || "—",
            onHand: have,
            sold90: qty,
            perMonth: round((qty / windowDays) * 30),
            weeksLeft: weeksLeft === null ? null : round(Math.round(weeksLeft * 10) / 10),
            status,
            order: rank <= 2 ? order : 0,
            orderCost: rank <= 2 ? round(order * cost) : 0,
            rank,
          });
        });
      rows.sort((a, b) => a.rank - b.rank || (a.weeksLeft ?? 999) - (b.weeksLeft ?? 999));
      filters.push(`Based on sales of the last ${windowDays} days · order enough for ${cover} months`);
      const urgent = rows.filter((r) => r.rank <= 1);
      const soon = rows.filter((r) => r.rank === 2);
      const over = rows.filter((r) => r.rank === 4);
      return base({
        summary: [
          { label: "Order now", value: urgent.length, type: "number" },
          { label: "Order soon", value: soon.length, type: "number" },
          { label: "Over 6 months of stock", value: over.length, type: "number" },
          { label: "Cost of suggested orders", value: round(rows.reduce((s, r) => s + r.orderCost, 0)), type: "money" },
        ],
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "company", label: "Company", type: "text" },
          { key: "onHand", label: "On hand", type: "number" },
          { key: "sold90", label: "Sold, 90 days", type: "number" },
          { key: "perMonth", label: "Per month", type: "number" },
          { key: "weeksLeft", label: "Weeks left", type: "number" },
          { key: "status", label: "What to do", type: "text" },
          { key: "order", label: "Suggested order", type: "number" },
          { key: "orderCost", label: "Order cost", type: "money" },
        ],
        rows: rows.map(({ rank, ...r }) => r),
        totals: { onHand: rows.reduce((s, r) => s + r.onHand, 0), order: rows.reduce((s, r) => s + r.order, 0), orderCost: round(rows.reduce((s, r) => s + r.orderCost, 0)) },
      });
    }

    case "company-performance": {
      const lines = await loadSaleLines(client, country, period!);
      const onHand = await stockOnHand(client, country);
      const products = await fetchAll(() =>
        client.from("products").select("id, manufacturer, cost_price, cost_price_omr, is_active")
      );
      const omr = country === "Oman";
      type C = { value: number; units: number; list: number; discount: number; focUnits: number; focValue: number; costKnownSales: number; costTotal: number; sold: Set<string>; range: number; stockUnits: number; stockValue: number };
      const by = new Map<string, C>();
      const get = (n: string) => {
        let c = by.get(n);
        if (!c) {
          c = { value: 0, units: 0, list: 0, discount: 0, focUnits: 0, focValue: 0, costKnownSales: 0, costTotal: 0, sold: new Set(), range: 0, stockUnits: 0, stockValue: 0 };
          by.set(n, c);
        }
        return c;
      };
      lines.forEach((l) => {
        const c = get(l.company);
        c.value += l.value;
        c.units += l.qty;
        c.sold.add(l.productId);
        if (l.free) {
          c.focUnits += l.qty;
          c.focValue += l.list * l.qty;
        } else if (l.list > 0 && l.value / l.qty < l.list - 0.0005) {
          c.discount += l.list * l.qty - l.value;
        }
        if (l.cost > 0) {
          c.costKnownSales += l.value;
          c.costTotal += l.cost * l.qty;
        }
      });
      products
        .filter((p: any) => p.is_active !== false)
        .forEach((p: any) => {
          const c = get(p.manufacturer || "—");
          c.range += 1;
          const q = Math.max(onHand.get(p.id) || 0, 0);
          c.stockUnits += q;
          c.stockValue += q * num(omr ? p.cost_price_omr : p.cost_price);
        });
      const days = Math.max(daysBetween(period!.from, period!.to) + 1, 1);
      const totalSales = Array.from(by.values()).reduce((s, c) => s + c.value, 0);
      const rows = Array.from(by.entries())
        .filter(([, c]) => c.value > 0 || c.stockUnits > 0)
        .map(([name, c]) => ({
          company: name,
          value: round(c.value),
          share: totalSales > 0 ? round((c.value / totalSales) * 100) : 0,
          units: c.units,
          margin: c.costKnownSales > 0 ? round(c.costKnownSales - c.costTotal) : null,
          marginPct: c.costKnownSales > 0 ? round(((c.costKnownSales - c.costTotal) / c.costKnownSales) * 100) : null,
          discount: round(c.discount),
          focValue: round(c.focValue),
          products: `${c.sold.size} of ${c.range}`,
          stockValue: round(c.stockValue),
          cover: c.units > 0 ? round(Math.round((c.stockUnits / (c.units / days)) / 7 * 10) / 10) : null,
        }))
        .sort((a, b) => b.value - a.value);
      return base({
        summary: [
          { label: "Sales", value: round(totalSales), type: "money" },
          { label: "Companies selling", value: rows.filter((r) => r.value > 0).length, type: "number" },
          { label: "Stock value at cost", value: round(rows.reduce((s, r) => s + r.stockValue, 0)), type: "money" },
          { label: "Discount + FOC given", value: round(rows.reduce((s, r) => s + r.discount + r.focValue, 0)), type: "money" },
        ],
        columns: [
          { key: "company", label: "Company", type: "text" },
          { key: "value", label: "Sales", type: "money" },
          { key: "share", label: "Share %", type: "number" },
          { key: "units", label: "Units", type: "number" },
          { key: "margin", label: "Margin", type: "money" },
          { key: "marginPct", label: "Margin %", type: "number" },
          { key: "discount", label: "Discount given", type: "money" },
          { key: "focValue", label: "FOC (at list)", type: "money" },
          { key: "products", label: "Products sold", type: "text" },
          { key: "stockValue", label: "Stock at cost", type: "money" },
          { key: "cover", label: "Weeks of stock", type: "number" },
        ],
        rows,
        totals: {
          value: round(totalSales),
          units: rows.reduce((s, r) => s + r.units, 0),
          margin: round(rows.reduce((s, r) => s + (r.margin || 0), 0)),
          discount: round(rows.reduce((s, r) => s + r.discount, 0)),
          focValue: round(rows.reduce((s, r) => s + r.focValue, 0)),
          stockValue: round(rows.reduce((s, r) => s + r.stockValue, 0)),
        },
      });
    }

    case "product-margin": {
      const lines = await loadSaleLines(client, country, period!, { salesmanId, series });
      type P = { name: string; company: string; units: number; value: number; list: number; discount: number; focUnits: number; costKnownSales: number; costTotal: number; noCost: boolean };
      const by = new Map<string, P>();
      lines.forEach((l) => {
        const c = by.get(l.productId) || { name: l.name, company: l.company, units: 0, value: 0, list: 0, discount: 0, focUnits: 0, costKnownSales: 0, costTotal: 0, noCost: l.cost <= 0 };
        c.units += l.qty;
        c.value += l.value;
        c.list += l.list * l.qty;
        if (l.free) c.focUnits += l.qty;
        else if (l.list > 0 && l.value / l.qty < l.list - 0.0005) c.discount += l.list * l.qty - l.value;
        if (l.cost > 0) {
          c.costKnownSales += l.value;
          c.costTotal += l.cost * l.qty;
        }
        by.set(l.productId, c);
      });
      const rows = Array.from(by.values())
        .map((c) => {
          const margin = c.costKnownSales > 0 ? c.costKnownSales - c.costTotal : null;
          const pct = c.costKnownSales > 0 ? ((c.costKnownSales - c.costTotal) / c.costKnownSales) * 100 : null;
          let note = "";
          if (c.noCost) note = "No cost price";
          else if (pct !== null && pct < 0) note = "Selling below cost";
          else if (pct !== null && pct < 10) note = "Low margin";
          else if (c.list > 0 && c.discount / c.list > 0.08) note = "Heavy discounting";
          return {
            product: c.name,
            company: c.company,
            units: c.units,
            value: round(c.value),
            avgPrice: c.units > 0 ? round(c.value / c.units) : 0,
            margin: margin === null ? null : round(margin),
            marginPct: pct === null ? null : round(pct),
            discount: round(c.discount),
            focUnits: c.focUnits,
            note,
          };
        })
        .sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity));
      const withCost = rows.filter((r) => r.margin !== null);
      const sales = rows.reduce((s, r) => s + r.value, 0);
      const marginTotal = withCost.reduce((s, r) => s + (r.margin || 0), 0);
      return base({
        summary: [
          { label: "Sales", value: round(sales), type: "money" },
          { label: "Margin (products with cost)", value: round(marginTotal), type: "money" },
          { label: "Low margin or below cost", value: rows.filter((r) => r.note === "Low margin" || r.note === "Selling below cost").length, type: "number" },
          { label: "Without cost price", value: rows.filter((r) => r.note === "No cost price").length, type: "number" },
        ],
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "company", label: "Company", type: "text" },
          { key: "units", label: "Units", type: "number" },
          { key: "value", label: "Sales", type: "money" },
          { key: "avgPrice", label: "Avg price", type: "money" },
          { key: "margin", label: "Margin", type: "money" },
          { key: "marginPct", label: "Margin %", type: "number" },
          { key: "discount", label: "Discount given", type: "money" },
          { key: "focUnits", label: "FOC units", type: "number" },
          { key: "note", label: "Note", type: "text" },
        ],
        rows,
        totals: { units: rows.reduce((s, r) => s + r.units, 0), value: round(sales), margin: round(marginTotal), discount: round(rows.reduce((s, r) => s + r.discount, 0)), focUnits: rows.reduce((s, r) => s + r.focUnits, 0) },
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
