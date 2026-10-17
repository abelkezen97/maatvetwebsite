import { SupabaseClient } from "@supabase/supabase-js";
import { Profile } from "@/types";
import { todayInDubai, COMMISSION_WINDOW_DAYS, daysBetween } from "@/lib/db/commission";
import { currencyFor } from "@/lib/currency";
import { countWorkingDays, isWorkingDay, loadWorkSchedule, describeSchedule } from "@/lib/db/workSchedule";
import { PerfInsight, PerfPeriod, PerfPeriodKind, PerfShare, PerformanceReport } from "./types";

/**
 * Salesman performance for a day, a half month or a month: sales, collections
 * (on time vs late, within 100 days), products by company, pricing (FOC,
 * below and above list price), expenses, and plain-language insights.
 * Uses invoice dates and payment dates (Gulf time). Admin only.
 */

const num = (v: any) => Number(v) || 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

async function inChunks<T = any>(ids: string[], run: (chunk: string[]) => any): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await run(ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) || []));
  }
  return out;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function lastOfMonth(y: number, m: number): string {
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}
function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function resolvePeriod(kind: PerfPeriodKind, anchor: string, today: string): PerfPeriod {
  const a = DAY_RE.test(anchor) ? anchor : today;
  const y = Number(a.slice(0, 4));
  const m = Number(a.slice(5, 7)) - 1;
  const d = Number(a.slice(8, 10));
  let from: string, to: string, label: string, prevFrom: string, prevTo: string, prevLabel: string;
  if (kind === "day") {
    from = to = a;
    label = fmtDay(a);
    prevFrom = prevTo = addDays(a, -1);
    prevLabel = fmtDay(prevFrom);
  } else if (kind === "half") {
    const first = d <= 15;
    const mm = String(m + 1).padStart(2, "0");
    from = first ? `${y}-${mm}-01` : `${y}-${mm}-16`;
    to = first ? `${y}-${mm}-15` : lastOfMonth(y, m);
    label = `${first ? "1–15" : `16–${Number(to.slice(8))}`} ${MONTHS[m]} ${y}`;
    if (first) {
      const py = m === 0 ? y - 1 : y;
      const pm = m === 0 ? 11 : m - 1;
      prevFrom = `${py}-${String(pm + 1).padStart(2, "0")}-16`;
      prevTo = lastOfMonth(py, pm);
      prevLabel = `16–${Number(prevTo.slice(8))} ${MONTHS[pm]} ${py}`;
    } else {
      prevFrom = `${y}-${mm}-01`;
      prevTo = `${y}-${mm}-15`;
      prevLabel = `1–15 ${MONTHS[m]} ${y}`;
    }
  } else {
    from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    to = lastOfMonth(y, m);
    label = `${MONTHS[m]} ${y}`;
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    prevFrom = `${py}-${String(pm + 1).padStart(2, "0")}-01`;
    prevTo = lastOfMonth(py, pm);
    prevLabel = `${MONTHS[pm]} ${py}`;
  }
  const end = to < today ? to : today;
  const daysElapsed = end < from ? 0 : daysBetween(from, end) + 1;
  return { kind, from, to, label, prevFrom, prevTo, prevLabel, daysElapsed };
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

export async function buildPerformance(
  client: SupabaseClient,
  profile: Profile,
  params: { kind: PerfPeriodKind; date?: string; salesmanId?: string }
): Promise<PerformanceReport> {
  const country = profile.country;
  const omr = country === "Oman";
  const currency = currencyFor(country);
  const today = todayInDubai();
  const period = resolvePeriod(params.kind, params.date || today, today);
  // Only working days count: the weekly day off (Friday by default) and holidays are left out.
  const schedule = await loadWorkSchedule(client, country);
  period.daysElapsed = countWorkingDays(period.from, period.to < today ? period.to : today, schedule);
  const sid = params.salesmanId || null;

  // People
  const people = await fetchAll(() => client.from("profiles").select("id, full_name, role, country, countries, is_active").order("full_name"));
  const nameOf = new Map(people.map((p: any) => [p.id, p.full_name || "—"]));
  const salesmen = people
    .filter((p: any) => p.role === "salesperson" && (p.country === country || (Array.isArray(p.countries) && p.countries.includes(country))))
    .map((p: any) => ({ id: p.id, name: p.full_name || "—" }));

  // ---------- Sales ----------
  const invoiceCols = "id, invoice_number, invoice_date, customer_id, company_name, salesman_id, grand_total, status, is_deleted, credit_days, due_date";
  const invoicesIn = async (from: string, to: string) =>
    (
      await fetchAll(() => {
        let q = client.from("invoices").select(invoiceCols).eq("country", country).gte("invoice_date", from).lte("invoice_date", to);
        if (sid) q = q.eq("salesman_id", sid);
        return q;
      })
    ).filter((i: any) => i.is_deleted !== true && i.status !== "Cancelled");

  const [invoices, prevInvoices] = await Promise.all([invoicesIn(period.from, period.to), invoicesIn(period.prevFrom, period.prevTo)]);
  const salesValue = invoices.reduce((s: number, i: any) => s + num(i.grand_total), 0);
  const prevSalesValue = prevInvoices.reduce((s: number, i: any) => s + num(i.grand_total), 0);

  const customerIds = Array.from(new Set(invoices.map((i: any) => i.customer_id).filter(Boolean))) as string[];
  const customers = await inChunks(customerIds, (c) => client.from("customers").select("id, company_name").in("id", c));
  const custName = new Map(customers.map((c: any) => [c.id, c.company_name]));
  // New customers: no invoice before this period.
  const earlier = await inChunks(customerIds, (c) =>
    client.from("invoices").select("customer_id").in("customer_id", c).lt("invoice_date", period.from).eq("is_deleted", false).limit(5000)
  );
  const seenBefore = new Set(earlier.map((e: any) => e.customer_id));
  const newCustomerIds = new Set(customerIds.filter((c) => !seenBefore.has(c)));

  const byDayMap = new Map<string, { value: number; invoices: number }>();
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) byDayMap.set(d, { value: 0, invoices: 0 });
  const custAgg = new Map<string, { name: string; value: number; invoices: number; isNew: boolean }>();
  let paidAtSale = 0;
  invoices.forEach((i: any) => {
    const day = String(i.invoice_date).slice(0, 10);
    const b = byDayMap.get(day);
    if (b) {
      b.value += num(i.grand_total);
      b.invoices += 1;
    }
    if (i.status === "Paid") paidAtSale += num(i.grand_total);
    const key = i.customer_id || i.company_name;
    const c = custAgg.get(key) || { name: custName.get(i.customer_id) || i.company_name || "Customer", value: 0, invoices: 0, isNew: newCustomerIds.has(i.customer_id) };
    c.value += num(i.grand_total);
    c.invoices += 1;
    custAgg.set(key, c);
  });
  const byDay = Array.from(byDayMap.entries()).map(([day, v]) => ({
    day,
    label: `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`,
    value: r3(v.value),
    invoices: v.invoices,
  }));
  const soldDays = byDay.filter((d) => d.invoices > 0).length;
  // Working days with sales, for the "days with sales" rate (selling on a day off is a bonus, not counted).
  const activeDays = byDay.filter((d) => d.invoices > 0 && isWorkingDay(d.day, schedule)).length;

  // ---------- Items: products, companies, pricing ----------
  const invoiceIds = invoices.map((i: any) => i.id);
  const items = await inChunks(invoiceIds, (c) =>
    client
      .from("invoice_items")
      .select("invoice_id, quantity, unit_price, discount, line_total, products(name, manufacturer, selling_price, selling_price_omr, cost_price, cost_price_omr)")
      .in("invoice_id", c)
  );
  let units = 0;
  const companyAgg = new Map<string, { value: number; units: number; products: Map<string, { value: number; units: number }> }>();
  const productAgg = new Map<string, { company: string; value: number; units: number }>();
  const pricing = {
    listValue: 0,
    soldValue: 0,
    atList: { lines: 0, value: 0 },
    below: { lines: 0, value: 0, given: 0 },
    above: { lines: 0, value: 0, earned: 0 },
    foc: { lines: 0, units: 0, listValue: 0 },
  };
  let costKnownSold = 0;
  let costTotal = 0;
  const discountByProduct = new Map<string, { given: number; units: number }>();
  const focByProduct = new Map<string, { units: number; listValue: number }>();

  items.forEach((it: any) => {
    const qty = num(it.quantity);
    if (qty <= 0) return;
    const value = num(it.line_total);
    const p = it.products || {};
    const name = p.name || "Product";
    const company = (p.manufacturer || "Other").trim() || "Other";
    const list = num(omr ? p.selling_price_omr : p.selling_price) || num(it.unit_price);
    const cost = num(omr ? p.cost_price_omr : p.cost_price);
    const rate = value / qty;
    units += qty;

    const co = companyAgg.get(company) || { value: 0, units: 0, products: new Map() };
    co.value += value;
    co.units += qty;
    const cp = co.products.get(name) || { value: 0, units: 0 };
    cp.value += value;
    cp.units += qty;
    co.products.set(name, cp);
    companyAgg.set(company, co);
    const pa = productAgg.get(name) || { company, value: 0, units: 0 };
    pa.value += value;
    pa.units += qty;
    productAgg.set(name, pa);

    pricing.listValue += list * qty;
    pricing.soldValue += value;
    if (value <= 0.0005) {
      pricing.foc.lines += 1;
      pricing.foc.units += qty;
      pricing.foc.listValue += list * qty;
      const f = focByProduct.get(name) || { units: 0, listValue: 0 };
      f.units += qty;
      f.listValue += list * qty;
      focByProduct.set(name, f);
    } else if (list > 0 && rate < list - 0.0005) {
      pricing.below.lines += 1;
      pricing.below.value += value;
      pricing.below.given += (list - rate) * qty;
      const g = discountByProduct.get(name) || { given: 0, units: 0 };
      g.given += (list - rate) * qty;
      g.units += qty;
      discountByProduct.set(name, g);
    } else if (list > 0 && rate > list + 0.0005) {
      pricing.above.lines += 1;
      pricing.above.value += value;
      pricing.above.earned += (rate - list) * qty;
    } else {
      pricing.atList.lines += 1;
      pricing.atList.value += value;
    }
    if (cost > 0) {
      costKnownSold += value;
      costTotal += cost * qty;
    }
  });

  const companies = Array.from(companyAgg.entries())
    .map(([name, c]) => ({
      name,
      value: r3(c.value),
      units: c.units,
      share: salesValue > 0 ? (c.value / Math.max(pricing.soldValue, 0.0001)) * 100 : 0,
      products: Array.from(c.products.entries())
        .map(([pn, v]) => ({ name: pn, value: r3(v.value), units: v.units }))
        .sort((a, b) => b.value - a.value || b.units - a.units)
        .slice(0, 6),
    }))
    .sort((a, b) => b.value - a.value || b.units - a.units);
  const topProducts = Array.from(productAgg.entries())
    .map(([name, v]) => ({ name, company: v.company, value: r3(v.value), units: v.units }))
    .sort((a, b) => b.units - a.units || b.value - a.value)
    .slice(0, 10);
  const grossMargin = costKnownSold > 0 ? costKnownSold - costTotal : null;

  // ---------- Collections ----------
  const receipts = await fetchAll(() =>
    client
      .from("receipts")
      .select("id, receipt_number, payment_date, amount_paid, payment_method, cheque_status, invoice_id, created_by, customer_id, is_deleted")
      .eq("country", country)
      .gte("payment_date", period.from)
      .lte("payment_date", period.to)
  ).then((rows) => rows.filter((r: any) => r.is_deleted !== true));
  const prevReceipts = await fetchAll(() =>
    client
      .from("receipts")
      .select("id, payment_date, amount_paid, cheque_status, invoice_id, created_by, is_deleted")
      .eq("country", country)
      .gte("payment_date", period.prevFrom)
      .lte("payment_date", period.prevTo)
  ).then((rows) => rows.filter((r: any) => r.is_deleted !== true));

  const allReceiptIds = [...receipts, ...prevReceipts].map((r: any) => r.id);
  const allocations = await inChunks(allReceiptIds, (c) => client.from("receipt_allocations").select("receipt_id, invoice_id, amount").in("receipt_id", c));
  const allocByReceipt = new Map<string, { invoice_id: string; amount: number }[]>();
  allocations.forEach((a: any) => {
    const list = allocByReceipt.get(a.receipt_id) || [];
    list.push({ invoice_id: a.invoice_id, amount: num(a.amount) });
    allocByReceipt.set(a.receipt_id, list);
  });
  const appliedOf = (r: any) => allocByReceipt.get(r.id) || (r.invoice_id ? [{ invoice_id: r.invoice_id, amount: num(r.amount_paid) }] : []);
  const appliedInvoiceIds = Array.from(new Set([...receipts, ...prevReceipts].flatMap((r: any) => appliedOf(r).map((a) => a.invoice_id)).filter(Boolean))) as string[];
  const appliedInvoices = await inChunks(appliedInvoiceIds, (c) =>
    client.from("invoices").select("id, salesman_id, invoice_date, credit_days, due_date").in("id", c)
  );
  const invInfo = new Map(appliedInvoices.map((i: any) => [i.id, i]));
  const dueOf = (i: any) => (i.due_date ? String(i.due_date).slice(0, 10) : addDays(String(i.invoice_date).slice(0, 10), num(i.credit_days)));
  const mine = (invoiceId: string) => {
    const i = invInfo.get(invoiceId);
    return i && (!sid || i.salesman_id === sid) ? i : null;
  };

  const coll = { total: 0, onTime: 0, late: 0, within100: 0, after100: 0, chequesPending: 0, advance: 0, receipts: 0 };
  const methodAgg = new Map<string, number>();
  const lateAgg = new Map<string, number>([
    ["1–30 days late", 0],
    ["31–60 days late", 0],
    ["61–90 days late", 0],
    ["Over 90 days late", 0],
  ]);
  receipts.forEach((r: any) => {
    if (r.cheque_status === "Bounced") return;
    const pending = r.cheque_status === "Pending";
    const day = String(r.payment_date).slice(0, 10);
    let counted = 0;
    let any = false;
    for (const a of appliedOf(r)) {
      const inv = mine(a.invoice_id);
      if (!inv) continue;
      any = true;
      if (pending) {
        coll.chequesPending += a.amount;
        continue;
      }
      counted += a.amount;
      const due = dueOf(inv);
      if (day <= due) coll.onTime += a.amount;
      else {
        coll.late += a.amount;
        const lateBy = daysBetween(due, day);
        const bucket = lateBy <= 30 ? "1–30 days late" : lateBy <= 60 ? "31–60 days late" : lateBy <= 90 ? "61–90 days late" : "Over 90 days late";
        lateAgg.set(bucket, (lateAgg.get(bucket) || 0) + a.amount);
      }
      if (daysBetween(String(inv.invoice_date).slice(0, 10), day) <= COMMISSION_WINDOW_DAYS) coll.within100 += a.amount;
      else coll.after100 += a.amount;
    }
    // Unapplied money (advance) collected by this salesman.
    const applied = appliedOf(r).reduce((s, a) => s + a.amount, 0);
    const advance = Math.max(0, num(r.amount_paid) - applied);
    if (advance > 0.0005 && (!sid || r.created_by === sid) && !pending) {
      coll.advance += advance;
      counted += advance;
      any = true;
    }
    if (counted > 0) {
      coll.total += counted;
      const m = r.payment_method === "Bank Transfer" ? "Bank transfer" : r.payment_method || "Other";
      methodAgg.set(m, (methodAgg.get(m) || 0) + counted);
    }
    if (any) coll.receipts += 1;
  });
  let prevCollected = 0;
  prevReceipts.forEach((r: any) => {
    if (r.cheque_status === "Bounced" || r.cheque_status === "Pending") return;
    for (const a of appliedOf(r)) if (mine(a.invoice_id)) prevCollected += a.amount;
    const applied = appliedOf(r).reduce((s, a) => s + a.amount, 0);
    const advance = Math.max(0, num(r.amount_paid) - applied);
    if (advance > 0.0005 && (!sid || r.created_by === sid)) prevCollected += advance;
  });

  // ---------- Outstanding now ----------
  const balances = await fetchAll(() => {
    let q = client.from("invoice_balances").select("outstanding, is_overdue, days_overdue, invoice_date").eq("country", country).gt("outstanding", 0.0005);
    if (sid) q = q.eq("salesman_id", sid);
    return q;
  });
  const outstanding = { total: 0, overdue: 0, overdueInvoices: 0, over100: 0, oldestDays: 0 };
  balances.forEach((b: any) => {
    outstanding.total += num(b.outstanding);
    if (b.is_overdue) {
      outstanding.overdue += num(b.outstanding);
      outstanding.overdueInvoices += 1;
    }
    const age = daysBetween(String(b.invoice_date).slice(0, 10), today);
    if (age > COMMISSION_WINDOW_DAYS) outstanding.over100 += num(b.outstanding);
    outstanding.oldestDays = Math.max(outstanding.oldestDays, age);
  });

  // ---------- Expenses ----------
  const expensesIn = async (from: string, to: string) =>
    (
      await fetchAll(() =>
        client
          .from("expenses")
          .select("amount, category, status, salesperson_id, employee_id, is_deleted, expense_date")
          .eq("country", country)
          .gte("expense_date", from)
          .lte("expense_date", to)
      )
    ).filter((e: any) => e.is_deleted !== true && e.status !== "Rejected" && (!sid || (e.salesperson_id || e.employee_id) === sid));
  const [expenses, prevExpenses] = await Promise.all([expensesIn(period.from, period.to), expensesIn(period.prevFrom, period.prevTo)]);
  const catAgg = new Map<string, { value: number; count: number }>();
  const personAgg = new Map<string, { value: number; count: number }>();
  let expTotal = 0;
  let expApproved = 0;
  expenses.forEach((e: any) => {
    const a = num(e.amount);
    expTotal += a;
    if (e.status === "Approved") expApproved += a;
    const cat = e.category || "Other";
    const c = catAgg.get(cat) || { value: 0, count: 0 };
    c.value += a;
    c.count += 1;
    catAgg.set(cat, c);
    const who = nameOf.get(e.salesperson_id || e.employee_id) || "—";
    const p = personAgg.get(who) || { value: 0, count: 0 };
    p.value += a;
    p.count += 1;
    personAgg.set(who, p);
  });
  const toShares = (m: Map<string, { value: number; count: number }>): PerfShare[] =>
    Array.from(m.entries())
      .map(([label, v]) => ({ label, value: r3(v.value), count: v.count }))
      .sort((a, b) => b.value - a.value);
  const petrol = (catAgg.get("Petrol")?.value || 0) + (catAgg.get("Fuel")?.value || 0);

  // ---------- Efficiency ----------
  const efficiency = {
    collectionRate: pct(coll.total, salesValue),
    onTimeRate: pct(coll.onTime, coll.onTime + coll.late),
    within100Rate: pct(coll.within100, coll.within100 + coll.after100),
    focRate: pct(pricing.foc.listValue, pricing.listValue),
    discountRate: pct(pricing.below.given, pricing.listValue),
    expenseRate: pct(expTotal, salesValue),
    salesPerActiveDay: soldDays > 0 ? salesValue / soldDays : 0,
    invoicesPerActiveDay: soldDays > 0 ? invoices.length / soldDays : 0,
    activeDayRate: period.kind === "day" ? null : pct(Math.min(activeDays, period.daysElapsed), period.daysElapsed),
  };

  // ---------- Insights ----------
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString("en-US")}`;
  const p0 = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
  const insights: PerfInsight[] = [];
  const who = sid ? nameOf.get(sid) || "The salesman" : "The team";
  const partial = period.to > today;

  if (prevSalesValue > 0) {
    const ch = ((salesValue - prevSalesValue) / prevSalesValue) * 100;
    insights.push({
      tone: ch >= 0 ? "good" : ch > -20 ? "warn" : "bad",
      title: `Sales ${ch >= 0 ? "up" : "down"} ${Math.abs(Math.round(ch))}% on ${period.prevLabel}`,
      detail: `${money(salesValue)} against ${money(prevSalesValue)}${partial ? ` (this period is still running: ${period.daysElapsed} days so far)` : ""}.`,
    });
  } else if (salesValue > 0) {
    insights.push({ tone: "info", title: `${money(salesValue)} sold`, detail: `No sales in ${period.prevLabel} to compare with.` });
  } else {
    insights.push({ tone: "bad", title: "No sales in this period", detail: `${who} has no invoices dated ${period.label}.` });
  }

  if (efficiency.collectionRate !== null) {
    const r = efficiency.collectionRate;
    insights.push({
      tone: r >= 90 ? "good" : r >= 60 ? "warn" : "bad",
      title: `Collected ${p0(r)} of what was sold`,
      detail: `${money(coll.total)} collected against ${money(salesValue)} sold in the same period${coll.chequesPending > 0 ? `, plus ${money(coll.chequesPending)} in cheques not yet cleared` : ""}.`,
    });
  }
  if (efficiency.onTimeRate !== null) {
    const r = efficiency.onTimeRate;
    insights.push({
      tone: r >= 80 ? "good" : r >= 50 ? "warn" : "bad",
      title: `${p0(r)} of collections came in on time`,
      detail: `${money(coll.onTime)} before the due date, ${money(coll.late)} after it.${efficiency.within100Rate !== null && efficiency.within100Rate < 100 ? ` ${money(coll.after100)} was collected after ${COMMISSION_WINDOW_DAYS} days (no commission).` : ""}`,
    });
  }
  if (outstanding.overdue > 0) {
    insights.push({
      tone: outstanding.over100 > 0 ? "bad" : "warn",
      title: `${money(outstanding.overdue)} overdue today on ${outstanding.overdueInvoices} invoices`,
      detail: `Total unpaid ${money(outstanding.total)}; ${outstanding.over100 > 0 ? `${money(outstanding.over100)} is past ${COMMISSION_WINDOW_DAYS} days. ` : ""}Oldest unpaid invoice is ${outstanding.oldestDays} days old.`,
    });
  }
  if (pricing.listValue > 0) {
    const belowPct = pct(pricing.below.given, pricing.listValue) || 0;
    const focPct = pct(pricing.foc.listValue, pricing.listValue) || 0;
    insights.push({
      tone: belowPct + focPct <= 5 ? "good" : belowPct + focPct <= 12 ? "warn" : "bad",
      title: `Gave away ${p0(belowPct + focPct)} of list value`,
      detail: `${money(pricing.below.given)} in discounts on ${pricing.below.lines} lines and ${pricing.foc.units} FOC units worth ${money(pricing.foc.listValue)}.${pricing.above.earned > 0 ? ` Sold ${pricing.above.lines} lines above list for an extra ${money(pricing.above.earned)}.` : ""}`,
    });
  }
  if (companies.length > 0 && pricing.soldValue > 0) {
    const top = companies[0];
    insights.push({
      tone: top.share > 70 ? "warn" : "info",
      title: `${top.name} is ${p0(top.share)} of sales`,
      detail: `${companies.length} companies sold; top product by units: ${topProducts[0]?.name || "—"} (${topProducts[0]?.units || 0} units).`,
    });
  }
  if (efficiency.expenseRate !== null && expTotal > 0) {
    const r = efficiency.expenseRate;
    insights.push({
      tone: r <= 5 ? "good" : r <= 10 ? "warn" : "bad",
      title: `Expenses are ${p0(r)} of sales`,
      detail: `${money(expTotal)} spent${petrol > 0 ? `, of which petrol ${money(petrol)}` : ""}.`,
    });
  } else if (expTotal > 0) {
    insights.push({ tone: "bad", title: `${money(expTotal)} spent with no sales`, detail: `Expenses in ${period.label} without invoices in the same period.` });
  }
  if (period.kind !== "day" && period.daysElapsed > 0) {
    insights.push({
      tone: (efficiency.activeDayRate || 0) >= 70 ? "good" : (efficiency.activeDayRate || 0) >= 45 ? "warn" : "bad",
      title: `Sold on ${activeDays} of ${period.daysElapsed} working days`,
      detail: `${money(efficiency.salesPerActiveDay)} and ${efficiency.invoicesPerActiveDay.toFixed(1)} invoices per selling day; ${customerIds.length} customers, ${newCustomerIds.size} new.`,
    });
  }

  if (period.kind === "day" && !isWorkingDay(period.from, schedule)) {
    insights.unshift({ tone: "info", title: "Day off", detail: `This is a non-working day (${describeSchedule(schedule)}).` });
  }

  return {
    country,
    currency,
    generatedAt: new Date().toISOString(),
    today,
    period,
    salesman: { id: sid, name: sid ? nameOf.get(sid) || "Salesman" : "All salesmen" },
    salesmen,
    sales: {
      value: r3(salesValue),
      prevValue: r3(prevSalesValue),
      invoices: invoices.length,
      prevInvoices: prevInvoices.length,
      units,
      customers: customerIds.length,
      newCustomers: newCustomerIds.size,
      paidAtSale: r3(paidAtSale),
      onCredit: r3(salesValue - paidAtSale),
      avgInvoice: invoices.length ? r3(salesValue / invoices.length) : 0,
      activeDays,
      byDay,
      topCustomers: Array.from(custAgg.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .map((c) => ({ ...c, value: r3(c.value) })),
      invoiceList:
        period.kind === "day"
          ? invoices
              .map((i: any) => ({ number: i.invoice_number, customer: custName.get(i.customer_id) || i.company_name || "", value: r3(num(i.grand_total)), status: i.status || "" }))
              .sort((a: any, b: any) => (a.number < b.number ? -1 : 1))
          : [],
    },
    collections: {
      total: r3(coll.total),
      prevTotal: r3(prevCollected),
      onTime: r3(coll.onTime),
      late: r3(coll.late),
      within100: r3(coll.within100),
      after100: r3(coll.after100),
      chequesPending: r3(coll.chequesPending),
      advance: r3(coll.advance),
      byMethod: Array.from(methodAgg.entries())
        .map(([label, value]) => ({ label, value: r3(value) }))
        .sort((a, b) => b.value - a.value),
      lateBuckets: Array.from(lateAgg.entries()).map(([label, value]) => ({ label, value: r3(value) })),
      receipts: coll.receipts,
    },
    outstanding: {
      total: r3(outstanding.total),
      overdue: r3(outstanding.overdue),
      overdueInvoices: outstanding.overdueInvoices,
      over100: r3(outstanding.over100),
      oldestDays: outstanding.oldestDays,
    },
    products: { companies, topProducts, productsSold: productAgg.size },
    pricing: {
      listValue: r3(pricing.listValue),
      soldValue: r3(pricing.soldValue),
      atList: { lines: pricing.atList.lines, value: r3(pricing.atList.value) },
      below: { lines: pricing.below.lines, value: r3(pricing.below.value), given: r3(pricing.below.given) },
      above: { lines: pricing.above.lines, value: r3(pricing.above.value), earned: r3(pricing.above.earned) },
      foc: { lines: pricing.foc.lines, units: pricing.foc.units, listValue: r3(pricing.foc.listValue) },
      grossMargin: grossMargin === null ? null : r3(grossMargin),
      grossMarginPct: grossMargin === null ? null : pct(grossMargin, costKnownSold),
      topDiscounted: Array.from(discountByProduct.entries())
        .map(([name, v]) => ({ name, given: r3(v.given), units: v.units }))
        .sort((a, b) => b.given - a.given)
        .slice(0, 6),
      topFoc: Array.from(focByProduct.entries())
        .map(([name, v]) => ({ name, units: v.units, listValue: r3(v.listValue) }))
        .sort((a, b) => b.listValue - a.listValue)
        .slice(0, 6),
    },
    expenses: {
      total: r3(expTotal),
      prevTotal: r3(prevExpenses.reduce((s: number, e: any) => s + num(e.amount), 0)),
      approved: r3(expApproved),
      pending: r3(expTotal - expApproved),
      byCategory: toShares(catAgg),
      byPerson: toShares(personAgg),
      petrol: r3(petrol),
      ratioToSales: efficiency.expenseRate,
    },
    efficiency,
    insights,
  };
}
