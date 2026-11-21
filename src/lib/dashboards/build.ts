import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll, loadSaleLines } from "@/lib/reports/build";
import { loadCreditPolicy } from "@/lib/db/creditControl";
import { todayInDubai } from "@/lib/db/commission";

/**
 * Sales and Collection dashboards for the admin / accountant of one country.
 * Everything is read for a period plus the same-length period before it, and
 * the last six months for the trend. No cost prices are returned.
 */

const num = (v: any) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
function addMonths(first: string, n: number): string {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export interface DashPeriod {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  days: number;
}

export function resolvePeriod(fromIn?: string | null, toIn?: string | null): DashPeriod {
  const today = todayInDubai();
  let to = toIn && DAY_RE.test(toIn) ? toIn : today;
  let from = fromIn && DAY_RE.test(fromIn) ? fromIn : monthStart(to);
  if (from > to) [from, to] = [to, from];
  const days = daysBetween(from, to) + 1;
  return { from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), days };
}

/** First day of each of the last 6 months up to the month of `to`. */
function trendMonths(to: string): { key: string; label: string; from: string; to: string }[] {
  const first = monthStart(to);
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const f = addMonths(first, -i);
    const next = addMonths(f, 1);
    out.push({
      key: f.slice(0, 7),
      label: new Date(`${f}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      from: f,
      to: addDays(next, -1),
    });
  }
  return out;
}

async function namesFor(client: SupabaseClient, country: string): Promise<Map<string, string>> {
  const { data } = await client.from("profiles").select("id, full_name").eq("country", country);
  return new Map((data || []).map((p: any) => [p.id, p.full_name || "—"]));
}

const inRange = (d: string, a: string, b: string) => d >= a && d <= b;

/* ------------------------------------------------------------------ SALES */

export async function buildSalesDashboard(client: SupabaseClient, country: string, period: DashPeriod) {
  const months = trendMonths(period.to);
  const earliest = [months[0].from, period.prevFrom].sort()[0];
  const names = await namesFor(client, country);

  const [invoices, notes, lines, prevLines] = await Promise.all([
    fetchAll(() =>
      client
        .from("invoices")
        .select("id, invoice_date, customer_id, salesman_id, grand_total, status, is_deleted, company_name")
        .eq("country", country)
        .gte("invoice_date", earliest)
        .lte("invoice_date", period.to)
    ),
    fetchAll(() =>
      client
        .from("credit_notes")
        .select("credit_date, total, status, is_deleted, customer_id, salesman_id")
        .eq("country", country)
        .eq("status", "Approved")
        .gte("credit_date", earliest)
        .lte("credit_date", period.to)
    ),
    loadSaleLines(client, country, { from: period.from, to: period.to }),
    loadSaleLines(client, country, { from: period.prevFrom, to: period.prevTo }),
  ]);

  const inv = invoices
    .filter((i: any) => i.is_deleted !== true && i.status !== "Cancelled" && i.status !== "Draft")
    .map((i: any) => ({
      date: String(i.invoice_date).slice(0, 10),
      customerId: i.customer_id as string,
      salesmanId: i.salesman_id as string,
      total: num(i.grand_total),
      company: i.company_name as string | null,
    }));
  const cn = notes
    .filter((n: any) => n.is_deleted !== true)
    .map((n: any) => ({ date: String(n.credit_date).slice(0, 10), total: num(n.total), salesmanId: n.salesman_id as string }));

  const sumInv = (a: string, b: string) => inv.filter((i) => inRange(i.date, a, b)).reduce((s, i) => s + i.total, 0);
  const sumCn = (a: string, b: string) => cn.filter((n) => inRange(n.date, a, b)).reduce((s, n) => s + n.total, 0);
  const cur = inv.filter((i) => inRange(i.date, period.from, period.to));
  const prev = inv.filter((i) => inRange(i.date, period.prevFrom, period.prevTo));

  const gross = sumInv(period.from, period.to);
  const credits = sumCn(period.from, period.to);
  const net = gross - credits;
  const prevNet = sumInv(period.prevFrom, period.prevTo) - sumCn(period.prevFrom, period.prevTo);
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const prevQty = prevLines.reduce((s, l) => s + l.qty, 0);
  const paidQtyValue = lines.filter((l) => !l.free).reduce((s, l) => s + l.value, 0);
  const paidQty = lines.filter((l) => !l.free).reduce((s, l) => s + l.qty, 0);
  const prevPaidValue = prevLines.filter((l) => !l.free).reduce((s, l) => s + l.value, 0);
  const prevPaidQty = prevLines.filter((l) => !l.free).reduce((s, l) => s + l.qty, 0);

  // Products
  const prodMap = new Map<string, { name: string; company: string; qty: number; value: number }>();
  lines.forEach((l) => {
    const p = prodMap.get(l.productId) || { name: l.name, company: l.company, qty: 0, value: 0 };
    p.qty += l.qty;
    p.value += l.value;
    prodMap.set(l.productId, p);
  });
  const prevProd = new Map<string, number>();
  prevLines.forEach((l) => prevProd.set(l.productId, (prevProd.get(l.productId) || 0) + l.value));
  const products = Array.from(prodMap.entries())
    .map(([id, p]) => ({
      id,
      name: p.name,
      company: p.company,
      qty: p.qty,
      value: r2(p.value),
      avgPrice: p.qty > 0 ? r2(p.value / p.qty) : 0,
      prevValue: r2(prevProd.get(id) || 0),
    }))
    .sort((a, b) => b.value - a.value);

  // Companies
  const compMap = new Map<string, number>();
  lines.forEach((l) => compMap.set(l.company, (compMap.get(l.company) || 0) + l.value));
  const companies = Array.from(compMap.entries()).map(([name, value]) => ({ name, value: r2(value) })).sort((a, b) => b.value - a.value);

  // Customers
  const custMap = new Map<string, { id: string; name: string; value: number; invoices: number }>();
  cur.forEach((i) => {
    const c = custMap.get(i.customerId) || { id: i.customerId, name: i.company || "", value: 0, invoices: 0 };
    c.value += i.total;
    c.invoices += 1;
    custMap.set(i.customerId, c);
  });
  const prevCust = new Map<string, number>();
  prev.forEach((i) => prevCust.set(i.customerId, (prevCust.get(i.customerId) || 0) + i.total));
  const allIds = Array.from(new Set([...Array.from(custMap.keys()), ...Array.from(prevCust.keys())].filter(Boolean)));
  const custNames = new Map<string, string>();
  for (let i = 0; i < allIds.length; i += 300) {
    const { data } = await client.from("customers").select("id, company_name").in("id", allIds.slice(i, i + 300));
    (data || []).forEach((c: any) => custNames.set(c.id, c.company_name));
  }
  const customers = Array.from(custMap.values())
    .map((c) => ({ id: c.id, name: custNames.get(c.id) || c.name || "—", value: r2(c.value), invoices: c.invoices, prevValue: r2(prevCust.get(c.id) || 0) }))
    .sort((a, b) => b.value - a.value);
  const stopped = Array.from(prevCust.entries())
    .filter(([id]) => !custMap.has(id))
    .map(([id, v]) => ({ id, name: custNames.get(id) || "—", prevValue: r2(v) }))
    .sort((a, b) => b.prevValue - a.prevValue);
  // new customers: no invoice before this period (within the data we loaded is not enough, so ask the DB)
  let newCustomers = 0;
  const currentIds = Array.from(custMap.keys()).filter(Boolean);
  if (currentIds.length) {
    const seenBefore = new Set<string>();
    for (let i = 0; i < currentIds.length; i += 300) {
      const { data } = await client
        .from("invoices")
        .select("customer_id")
        .eq("country", country)
        .eq("is_deleted", false)
        .lt("invoice_date", period.from)
        .in("customer_id", currentIds.slice(i, i + 300))
        .limit(5000);
      (data || []).forEach((r: any) => seenBefore.add(r.customer_id));
    }
    newCustomers = currentIds.filter((id) => !seenBefore.has(id)).length;
  }

  // Salesmen
  const sm = new Map<string, { value: number; invoices: number; customers: Set<string>; credits: number }>();
  cur.forEach((i) => {
    const s = sm.get(i.salesmanId) || { value: 0, invoices: 0, customers: new Set<string>(), credits: 0 };
    s.value += i.total;
    s.invoices += 1;
    s.customers.add(i.customerId);
    sm.set(i.salesmanId, s);
  });
  cn.filter((n) => inRange(n.date, period.from, period.to)).forEach((n) => {
    const s = sm.get(n.salesmanId) || { value: 0, invoices: 0, customers: new Set<string>(), credits: 0 };
    s.credits += n.total;
    sm.set(n.salesmanId, s);
  });
  const prevSm = new Map<string, number>();
  prev.forEach((i) => prevSm.set(i.salesmanId, (prevSm.get(i.salesmanId) || 0) + i.total));
  const salesmen = Array.from(sm.entries())
    .map(([id, s]) => ({
      id,
      name: names.get(id) || "—",
      net: r2(s.value - s.credits),
      invoices: s.invoices,
      customers: s.customers.size,
      avgInvoice: s.invoices ? r2(s.value / s.invoices) : 0,
      prevNet: r2(prevSm.get(id) || 0),
    }))
    .sort((a, b) => b.net - a.net);

  const trend = months.map((m) => ({ label: m.label, value: r2(sumInv(m.from, m.to) - sumCn(m.from, m.to)) }));

  return {
    period,
    kpis: {
      net: r2(net),
      prevNet: r2(prevNet),
      gross: r2(gross),
      credits: r2(credits),
      invoices: cur.length,
      prevInvoices: prev.length,
      qty,
      prevQty,
      avgPrice: paidQty > 0 ? r2(paidQtyValue / paidQty) : 0,
      prevAvgPrice: prevPaidQty > 0 ? r2(prevPaidValue / prevPaidQty) : 0,
      avgInvoice: cur.length ? r2(gross / cur.length) : 0,
      activeCustomers: custMap.size,
      prevActiveCustomers: prevCust.size,
      newCustomers,
      stoppedCustomers: stopped.length,
    },
    trend,
    products: products.slice(0, 15),
    productCount: products.length,
    companies,
    customers: customers.slice(0, 12),
    stopped: stopped.slice(0, 10),
    salesmen,
  };
}

/* ------------------------------------------------------------ COLLECTIONS */

export async function buildCollectionDashboard(client: SupabaseClient, country: string, period: DashPeriod) {
  const months = trendMonths(period.to);
  const earliest = [months[0].from, period.prevFrom].sort()[0];
  const today = todayInDubai();
  const names = await namesFor(client, country);
  const policy = await loadCreditPolicy(client, country);

  const [receipts, invoices, open] = await Promise.all([
    fetchAll(() =>
      client
        .from("receipts")
        .select("id, payment_date, customer_id, company_name, customer_name, payment_method, amount_paid, created_by, cheque_status, cheque_date, is_deleted")
        .eq("country", country)
        .gte("payment_date", earliest)
        .lte("payment_date", period.to)
    ),
    fetchAll(() =>
      client
        .from("invoices")
        .select("invoice_date, grand_total, status, is_deleted")
        .eq("country", country)
        .gte("invoice_date", earliest)
        .lte("invoice_date", period.to)
    ),
    fetchAll(() =>
      client
        .from("invoice_balances")
        .select("invoice_id, customer_id, salesman_id, invoice_date, credit_days, outstanding")
        .eq("country", country)
        .gt("outstanding", 0.0005)
    ),
  ]);

  const rc = receipts
    .filter((r: any) => r.is_deleted !== true && r.cheque_status !== "Bounced")
    .map((r: any) => ({
      id: r.id as string,
      date: String(r.payment_date).slice(0, 10),
      customerId: r.customer_id as string,
      name: (r.company_name || r.customer_name || "—") as string,
      method: (r.payment_method || "Other") as string,
      amount: num(r.amount_paid),
      by: r.created_by as string,
      pending: r.cheque_status === "Pending",
      chequeDate: r.cheque_date ? String(r.cheque_date).slice(0, 10) : null,
    }));
  const cleared = rc.filter((r) => !r.pending);
  const sumR = (a: string, b: string) => cleared.filter((r) => inRange(r.date, a, b)).reduce((s, r) => s + r.amount, 0);
  const inv = invoices.filter((i: any) => i.is_deleted !== true && i.status !== "Cancelled" && i.status !== "Draft");
  const sumI = (a: string, b: string) => inv.filter((i: any) => inRange(String(i.invoice_date).slice(0, 10), a, b)).reduce((s: number, i: any) => s + num(i.grand_total), 0);

  const curR = cleared.filter((r) => inRange(r.date, period.from, period.to));
  const collected = curR.reduce((s, r) => s + r.amount, 0);
  const prevCollected = sumR(period.prevFrom, period.prevTo);
  const invoiced = sumI(period.from, period.to);
  const prevInvoiced = sumI(period.prevFrom, period.prevTo);

  const byMethod = ["Cash", "Bank Transfer", "Cheque", "Other"].map((m) => ({
    label: m,
    value: r2(curR.filter((r) => (m === "Other" ? !["Cash", "Bank Transfer", "Cheque"].includes(r.method) : r.method === m)).reduce((s, r) => s + r.amount, 0)),
  }));

  // By salesman (who collected), with the previous period.
  const sm = new Map<string, { value: number; count: number }>();
  curR.forEach((r) => {
    const s = sm.get(r.by) || { value: 0, count: 0 };
    s.value += r.amount;
    s.count += 1;
    sm.set(r.by, s);
  });
  const prevSm = new Map<string, number>();
  cleared.filter((r) => inRange(r.date, period.prevFrom, period.prevTo)).forEach((r) => prevSm.set(r.by, (prevSm.get(r.by) || 0) + r.amount));
  const salesmen = Array.from(sm.entries())
    .map(([id, s]) => ({ id, name: names.get(id) || "—", collected: r2(s.value), receipts: s.count, prevCollected: r2(prevSm.get(id) || 0) }))
    .sort((a, b) => b.collected - a.collected);

  // Open balance per salesman (the invoice's salesman) for the effectiveness ratio.
  const openBySm = new Map<string, number>();
  let openTotal = 0;
  let overdueTotal = 0;
  let dueNext30 = 0;
  const dueDay = (o: any) => addDays(String(o.invoice_date).slice(0, 10), num(o.credit_days) > 0 ? num(o.credit_days) : policy.defaultCreditDays);
  open.forEach((o: any) => {
    const amt = num(o.outstanding);
    openTotal += amt;
    openBySm.set(o.salesman_id, (openBySm.get(o.salesman_id) || 0) + amt);
    const due = dueDay(o);
    if (due < today) overdueTotal += amt;
    else if (due <= addDays(today, 30)) dueNext30 += amt;
  });
  const smOut = salesmen.map((s) => ({ ...s, openNow: r2(openBySm.get(s.id) || 0) }));

  // Customers: who paid in the period, and how fast they pay (days from invoice to payment, by amount).
  const custPaid = new Map<string, { name: string; value: number; count: number }>();
  curR.forEach((r) => {
    const c = custPaid.get(r.customerId) || { name: r.name, value: 0, count: 0 };
    c.value += r.amount;
    c.count += 1;
    custPaid.set(r.customerId, c);
  });
  const ids = curR.map((r) => r.id);
  const daysToPay = new Map<string, { w: number; dsum: number }>();
  let allW = 0;
  let allD = 0;
  if (ids.length) {
    const recById = new Map<string, (typeof curR)[number]>(curR.map((r) => [r.id, r] as [string, (typeof curR)[number]]));
    const apps: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      apps.push(...(await fetchAll(() => client.from("receipt_applications").select("receipt_id, invoice_id, amount").in("receipt_id", ids.slice(i, i + 200)))));
    }
    const invIds = Array.from(new Set(apps.map((a) => a.invoice_id)));
    const invDate = new Map<string, string>();
    for (let i = 0; i < invIds.length; i += 200) {
      const rows = await fetchAll(() => client.from("invoices").select("id, invoice_date").in("id", invIds.slice(i, i + 200)));
      rows.forEach((r: any) => invDate.set(r.id, String(r.invoice_date).slice(0, 10)));
    }
    apps.forEach((a) => {
      const r = recById.get(a.receipt_id);
      const idt = invDate.get(a.invoice_id);
      if (!r || !idt) return;
      const d = Math.max(0, daysBetween(idt, r.date));
      const w = num(a.amount);
      const t = daysToPay.get(r.customerId) || { w: 0, dsum: 0 };
      t.w += w;
      t.dsum += d * w;
      daysToPay.set(r.customerId, t);
      allW += w;
      allD += d * w;
    });
  }
  const customers = Array.from(custPaid.entries())
    .map(([id, c]) => {
      const t = daysToPay.get(id);
      return { id, name: c.name, collected: r2(c.value), receipts: c.count, avgDays: t && t.w > 0 ? Math.round(t.dsum / t.w) : null };
    })
    .sort((a, b) => b.collected - a.collected)
    .slice(0, 12);

  // Weekly cash flow: invoiced vs collected, by week starting at the period start.
  const weeks: { label: string; invoiced: number; collected: number }[] = [];
  for (let s = period.from; s <= period.to && weeks.length < 14; s = addDays(s, 7)) {
    const e = addDays(s, 6) > period.to ? period.to : addDays(s, 6);
    weeks.push({
      label: new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      invoiced: r2(sumI(s, e)),
      collected: r2(sumR(s, e)),
    });
  }

  const pendingCheques = rc.filter((r) => r.pending);
  const trend = months.map((m) => ({ label: m.label, value: r2(sumR(m.from, m.to)), invoiced: r2(sumI(m.from, m.to)) }));

  return {
    period,
    kpis: {
      collected: r2(collected),
      prevCollected: r2(prevCollected),
      invoiced: r2(invoiced),
      prevInvoiced: r2(prevInvoiced),
      receipts: curR.length,
      collectionRate: invoiced > 0 ? Math.round((collected / invoiced) * 100) : null,
      openNow: r2(openTotal),
      overdueNow: r2(overdueTotal),
      dueNext30: r2(dueNext30),
      avgDaysToPay: allW > 0 ? Math.round(allD / allW) : null,
      pendingCheques: r2(pendingCheques.reduce((s, r) => s + r.amount, 0)),
      pendingChequeCount: pendingCheques.length,
    },
    trend,
    weeks,
    byMethod,
    salesmen: smOut,
    customers,
  };
}
