import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { todayInDubai } from "@/lib/db/commission";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/overview
 * One compact payload for the admin's home screen: today, this month against
 * last month, receivables, cheques, expiry, expenses and the salesmen.
 * Admin only.
 */

const num = (v: any) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function all<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const { profile, supabase } = await requireAuth();
    if (profile.role !== "super_admin") {
      return NextResponse.json({ error: "The owner overview is for the admin only." }, { status: 403 });
    }
    const country = profile.country;
    const today = todayInDubai();
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevMonthEnd = addDays(monthStart, -1);
    const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
    // Same number of days into last month, for a fair comparison.
    const dayOfMonth = Number(today.slice(8, 10));
    const prevSameDay = (() => {
      const cand = `${prevMonthStart.slice(0, 8)}${String(dayOfMonth).padStart(2, "0")}`;
      return cand > prevMonthEnd ? prevMonthEnd : cand;
    })();
    const from30 = addDays(today, -29);
    const rangeFrom = prevMonthStart < from30 ? prevMonthStart : from30;

    const [invoices, receipts, expenses, balances, pendingCheques, lots, people] = await Promise.all([
      all(() =>
        supabase
          .from("invoices")
          .select("invoice_date, grand_total, salesman_id, is_deleted")
          .eq("country", country)
          .gte("invoice_date", rangeFrom)
          .lte("invoice_date", today)
      ),
      all(() =>
        supabase
          .from("receipts")
          .select("payment_date, amount_paid, created_by, payment_method, cheque_status, is_deleted")
          .eq("country", country)
          .gte("payment_date", rangeFrom)
          .lte("payment_date", today)
      ),
      all(() =>
        supabase
          .from("expenses")
          .select("expense_date, amount, status, is_deleted")
          .eq("country", country)
          .gte("expense_date", monthStart)
          .lte("expense_date", today)
      ),
      all(() =>
        supabase
          .from("invoice_balances")
          .select("customer_id, outstanding, days_overdue")
          .eq("country", country)
          .gt("outstanding", 0)
      ),
      all(() =>
        supabase
          .from("receipts")
          .select("amount_paid, cheque_date, payment_date, cheque_received_at, is_deleted")
          .eq("country", country)
          .eq("payment_method", "Cheque")
          .eq("cheque_status", "Pending")
      ),
      all(() =>
        supabase.from("batch_stock").select("product_id, expiry_date, qty_remaining, is_active").eq("country", country).gt("qty_remaining", 0)
      ),
      supabase.from("profiles").select("id, full_name, role, country").eq("country", country),
    ]);

    const names = new Map<string, string>(((people as any).data || []).map((p: any) => [p.id, p.full_name || "—"]));
    const liveInv = invoices.filter((i: any) => i.is_deleted !== true);
    const liveRec = receipts.filter((r: any) => r.is_deleted !== true && r.cheque_status !== "Bounced");
    const day = (s: any) => String(s || "").slice(0, 10);

    const sumInv = (from: string, to: string) => {
      const list = liveInv.filter((i: any) => day(i.invoice_date) >= from && day(i.invoice_date) <= to);
      return { value: r2(list.reduce((s: number, i: any) => s + num(i.grand_total), 0)), count: list.length };
    };
    const sumRec = (from: string, to: string) =>
      r2(liveRec.filter((r: any) => day(r.payment_date) >= from && day(r.payment_date) <= to).reduce((s: number, r: any) => s + num(r.amount_paid), 0));

    const salesToday = sumInv(today, today);
    const salesMonth = sumInv(monthStart, today);
    const salesPrev = sumInv(prevMonthStart, prevSameDay);
    const colToday = sumRec(today, today);
    const colMonth = sumRec(monthStart, today);
    const colPrev = sumRec(prevMonthStart, prevSameDay);

    // Last 30 days, one point per day.
    const series: { day: string; sales: number; collected: number }[] = [];
    for (let d = from30; d <= today; d = addDays(d, 1)) {
      series.push({
        day: d,
        sales: r2(liveInv.filter((i: any) => day(i.invoice_date) === d).reduce((s: number, i: any) => s + num(i.grand_total), 0)),
        collected: r2(liveRec.filter((r: any) => day(r.payment_date) === d).reduce((s: number, r: any) => s + num(r.amount_paid), 0)),
      });
    }

    // Expenses this month.
    const liveExp = expenses.filter((e: any) => e.is_deleted !== true && e.status !== "Rejected");
    const expMonth = r2(liveExp.reduce((s: number, e: any) => s + num(e.amount), 0));
    const expPending = liveExp.filter((e: any) => (e.status || "Pending") === "Pending");

    // Receivables.
    const owed = balances.reduce((s: number, b: any) => s + num(b.outstanding), 0);
    const overdueRows = balances.filter((b: any) => num(b.days_overdue) > 0);
    const overdue = overdueRows.reduce((s: number, b: any) => s + num(b.outstanding), 0);
    const over60 = balances.filter((b: any) => num(b.days_overdue) > 60).reduce((s: number, b: any) => s + num(b.outstanding), 0);
    const byCust = new Map<string, number>();
    overdueRows.forEach((b: any) => byCust.set(b.customer_id, (byCust.get(b.customer_id) || 0) + num(b.outstanding)));
    const topIds = Array.from(byCust.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const custNames = new Map<string, string>();
    if (topIds.length > 0) {
      const { data } = await supabase.from("customers").select("id, company_name").in("id", topIds.map(([id]) => id));
      (data || []).forEach((c: any) => custNames.set(c.id, c.company_name));
    }

    // Cheques waiting.
    const waiting = pendingCheques.filter((c: any) => c.is_deleted !== true);
    const dueLimit = addDays(today, 7);
    const dueSoon = waiting.filter((c: any) => day(c.cheque_date || c.payment_date) <= dueLimit);

    // Expiry.
    const nearLimit = (() => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 6);
      return d.toISOString().slice(0, 10);
    })();
    const liveLots = lots.filter((l: any) => l.is_active !== false && l.expiry_date);
    const expiredLots = liveLots.filter((l: any) => day(l.expiry_date) < today);
    const nearLots = liveLots.filter((l: any) => day(l.expiry_date) >= today && day(l.expiry_date) <= nearLimit);
    const expiredUnits = expiredLots.reduce((s: number, l: any) => s + num(l.qty_remaining), 0);
    const nearUnits = nearLots.reduce((s: number, l: any) => s + num(l.qty_remaining), 0);
    let expiredValue = 0;
    let nearValue = 0;
    const prodIds = Array.from(new Set([...expiredLots, ...nearLots].map((l: any) => l.product_id)));
    if (prodIds.length > 0) {
      const price = new Map<string, number>();
      for (let i = 0; i < prodIds.length; i += 150) {
        const { data } = await supabase
          .from("products")
          .select("id, selling_price, selling_price_omr")
          .in("id", prodIds.slice(i, i + 150));
        (data || []).forEach((p: any) => price.set(p.id, num(country === "Oman" ? p.selling_price_omr : p.selling_price)));
      }
      expiredValue = expiredLots.reduce((s: number, l: any) => s + num(l.qty_remaining) * (price.get(l.product_id) || 0), 0);
      nearValue = nearLots.reduce((s: number, l: any) => s + num(l.qty_remaining) * (price.get(l.product_id) || 0), 0);
    }

    // Salesmen this month.
    const bySales = new Map<string, { sales: number; invoices: number; collected: number }>();
    const get = (id: string) => {
      let v = bySales.get(id);
      if (!v) {
        v = { sales: 0, invoices: 0, collected: 0 };
        bySales.set(id, v);
      }
      return v;
    };
    liveInv
      .filter((i: any) => day(i.invoice_date) >= monthStart && i.salesman_id)
      .forEach((i: any) => {
        const v = get(i.salesman_id);
        v.sales += num(i.grand_total);
        v.invoices += 1;
      });
    liveRec
      .filter((r: any) => day(r.payment_date) >= monthStart && r.created_by)
      .forEach((r: any) => {
        get(r.created_by).collected += num(r.amount_paid);
      });
    const salesmen = Array.from(bySales.entries())
      .map(([id, v]) => ({ name: names.get(id) || "—", sales: r2(v.sales), invoices: v.invoices, collected: r2(v.collected) }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 6);

    return NextResponse.json({
      country,
      today,
      sales: { today: salesToday, month: salesMonth, prevMonth: salesPrev },
      collections: { today: colToday, month: colMonth, prevMonth: colPrev },
      series,
      receivables: {
        owed: r2(owed),
        overdue: r2(overdue),
        overdueInvoices: overdueRows.length,
        over60: r2(over60),
        top: topIds.map(([id, v]) => ({ name: custNames.get(id) || "Customer", amount: r2(v) })),
      },
      cheques: {
        waiting: waiting.length,
        waitingAmount: r2(waiting.reduce((s: number, c: any) => s + num(c.amount_paid), 0)),
        dueSoon: dueSoon.length,
        dueSoonAmount: r2(dueSoon.reduce((s: number, c: any) => s + num(c.amount_paid), 0)),
      },
      expiry: { expiredUnits, expiredValue: r2(expiredValue), nearUnits, nearValue: r2(nearValue), nearLots: nearLots.length, expiredLots: expiredLots.length },
      expenses: { month: expMonth, pendingCount: expPending.length, pendingAmount: r2(expPending.reduce((s: number, e: any) => s + num(e.amount), 0)) },
      salesmen,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error building owner overview:", error);
    return NextResponse.json({ error: error.message || "Could not load the overview" }, { status: 500 });
  }
}
