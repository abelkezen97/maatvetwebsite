import { SupabaseClient } from "@supabase/supabase-js";
import { UserCountry } from "@/types";
import { getMultiSalespersonLedgerSummaries } from "@/lib/db/collectionLedger";
import { todayInDubai } from "@/lib/db/commission";

/**
 * Everything the accountant's dashboard shows for one country, computed on
 * the server in one call: sales and collections, receivables ageing, cash in
 * hand per person, cheques waiting to clear, and items waiting for approval.
 */

export interface AgeingBucket {
  key: string;
  label: string;
  amount: number;
  invoices: number;
}

export interface OverdueCustomer {
  customerId: string;
  companyName: string;
  salesmanName: string;
  outstanding: number;
  overdue: number;
  oldestDaysOverdue: number;
  invoices: number;
}

export interface CashPerson {
  id: string;
  name: string;
  role: string;
  cashInHand: number;
  collected: number;
  received: number;
  expenses: number;
  handedOver: number;
}

export interface PendingCheque {
  receiptId: string;
  receiptNumber: string;
  companyName: string;
  amount: number;
  chequeNumber: string;
  chequeDate: string | null;
  bankName: string;
  atOffice: boolean;
  collectedBy: string;
}

export interface PendingExpense {
  id: string;
  number: string;
  date: string;
  person: string;
  category: string;
  amount: number;
  description: string;
}

export interface PendingHandover {
  id: string;
  number: string;
  date: string;
  person: string;
  amount: number;
  notes: string;
}

export interface AccountantOverview {
  country: UserCountry;
  today: string;
  monthStart: string;
  sales: { today: number; month: number; lastMonth: number; monthInvoices: number };
  collections: { today: number; month: number; byMethod: { method: string; amount: number; count: number }[] };
  receivables: {
    total: number;
    customersOwing: number;
    overdue: number;
    overdueCustomers: number;
    ageing: AgeingBucket[];
    bySeries: { standard: number; omanReg: number } | null;
    topOverdue: OverdueCustomer[];
  };
  cash: {
    people: CashPerson[];
    totalCashInHand: number;
    cheques: { count: number; amount: number; notAtOffice: number; list: PendingCheque[] };
  };
  approvals: {
    expenses: PendingExpense[];
    expensesTotal: number;
    handovers: PendingHandover[];
    handoversTotal: number;
    creditNotes: number;
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: any) => Number(v) || 0;

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function monthStartOf(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function previousMonthStart(day: string): string {
  const d = new Date(`${monthStartOf(day)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

const AGEING: { key: string; label: string; test: (days: number) => boolean }[] = [
  { key: "current", label: "Not due yet", test: (d) => d <= 0 },
  { key: "1-30", label: "1–30 days overdue", test: (d) => d >= 1 && d <= 30 },
  { key: "31-60", label: "31–60 days overdue", test: (d) => d >= 31 && d <= 60 },
  { key: "61-90", label: "61–90 days overdue", test: (d) => d >= 61 && d <= 90 },
  { key: "90+", label: "Over 90 days overdue", test: (d) => d > 90 },
];

export async function buildAccountantOverview(
  client: SupabaseClient,
  role: string,
  country: UserCountry
): Promise<AccountantOverview> {
  const today = todayInDubai();
  const monthStart = monthStartOf(today);
  const lastMonthStart = previousMonthStart(today);

  const [invRes, recRes, balRes, custBalRes, chequeRes, expRes, hoRes, cnRes, peopleRes] = await Promise.all([
    client
      .from("invoices")
      .select("invoice_date, grand_total, is_deleted")
      .eq("country", country)
      .gte("invoice_date", lastMonthStart),
    client
      .from("receipts")
      .select("payment_date, amount_paid, payment_method, cheque_status, is_deleted")
      .eq("country", country)
      .gte("payment_date", monthStart),
    client
      .from("invoice_balances")
      .select("invoice_id, customer_id, salesman_id, outstanding, days_overdue, is_overdue, billing_series")
      .eq("country", country)
      .gt("outstanding", 0),
    client.from("customer_balances").select("customer_id, balance").eq("country", country),
    client
      .from("receipts")
      .select("id, receipt_number, company_name, amount_paid, cheque_number, cheque_date, bank_name, cheque_received_at, created_by, is_deleted")
      .eq("country", country)
      .eq("payment_method", "Cheque")
      .eq("cheque_status", "Pending")
      .order("cheque_date", { ascending: true }),
    client
      .from("expenses")
      .select("id, expense_number, expense_date, category, amount, description, salesperson_id, employee_id, created_by, is_deleted")
      .eq("country", country)
      .eq("status", "Pending")
      .order("expense_date", { ascending: true }),
    client
      .from("cash_handovers")
      .select("id, handover_number, handover_date, amount, notes, salesperson_id, is_deleted")
      .eq("country", country)
      .eq("status", "Pending")
      .order("handover_date", { ascending: true }),
    client.from("credit_notes").select("id", { count: "exact", head: true }).eq("country", country).eq("status", "Pending"),
    client.from("profiles").select("id, full_name"),
  ]);

  const names = new Map<string, string>();
  (peopleRes.data || []).forEach((p: any) => names.set(p.id, p.full_name || "Staff"));
  const nameOf = (id?: string | null) => (id && names.get(id)) || "—";

  // Sales
  const invoices = (invRes.data || []).filter((i: any) => i.is_deleted !== true);
  const sumInv = (from: string, to?: string) =>
    invoices
      .filter((i: any) => {
        const d = String(i.invoice_date || "").slice(0, 10);
        return d >= from && (!to || d < to);
      })
      .reduce((s: number, i: any) => s + num(i.grand_total), 0);
  const monthInvoices = invoices.filter((i: any) => String(i.invoice_date || "").slice(0, 10) >= monthStart).length;

  // Collections (this month)
  const receipts = (recRes.data || []).filter((r: any) => r.is_deleted !== true && r.cheque_status !== "Bounced");
  const methods = new Map<string, { amount: number; count: number }>();
  let collectedToday = 0;
  let collectedMonth = 0;
  receipts.forEach((r: any) => {
    const amount = num(r.amount_paid);
    const method = r.payment_method || "Other";
    const m = methods.get(method) || { amount: 0, count: 0 };
    m.amount += amount;
    m.count += 1;
    methods.set(method, m);
    collectedMonth += amount;
    if (String(r.payment_date || "").slice(0, 10) === today) collectedToday += amount;
  });

  // Receivables
  const balances = balRes.data || [];
  const ageing: AgeingBucket[] = AGEING.map((b) => ({ key: b.key, label: b.label, amount: 0, invoices: 0 }));
  let overdue = 0;
  let standard = 0;
  let omanReg = 0;
  const byCustomer = new Map<string, OverdueCustomer & { salesmanId?: string }>();
  balances.forEach((b: any) => {
    const amount = num(b.outstanding);
    const days = num(b.days_overdue);
    const bucket = AGEING.findIndex((a) => a.test(days));
    if (bucket >= 0) {
      ageing[bucket].amount += amount;
      ageing[bucket].invoices += 1;
    }
    if (b.billing_series === "oman_reg") omanReg += amount;
    else standard += amount;
    const c = byCustomer.get(b.customer_id) || {
      customerId: b.customer_id,
      companyName: "",
      salesmanName: "",
      salesmanId: b.salesman_id,
      outstanding: 0,
      overdue: 0,
      oldestDaysOverdue: 0,
      invoices: 0,
    };
    c.outstanding += amount;
    c.invoices += 1;
    if (days > 0) {
      overdue += amount;
      c.overdue += amount;
      c.oldestDaysOverdue = Math.max(c.oldestDaysOverdue, days);
    }
    byCustomer.set(b.customer_id, c);
  });

  const topList = Array.from(byCustomer.values())
    .filter((c) => c.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 10);
  if (topList.length > 0) {
    const { data: custs } = await client
      .from("customers")
      .select("id, company_name, assigned_salesman_id")
      .in(
        "id",
        topList.map((c) => c.customerId)
      );
    const custMap = new Map((custs || []).map((c: any) => [c.id, c]));
    topList.forEach((c) => {
      const row: any = custMap.get(c.customerId);
      c.companyName = row?.company_name || "Customer";
      c.salesmanName = nameOf(row?.assigned_salesman_id || c.salesmanId);
    });
  }

  const custBalances = (custBalRes.data || []).map((c: any) => num(c.balance));
  const receivablesTotal = custBalances.filter((b) => b > 0).reduce((s, b) => s + b, 0);

  // Cash in hand per person
  const summaries = await getMultiSalespersonLedgerSummaries(client, role, country);
  const people: CashPerson[] = summaries
    .map((s) => ({
      id: s.salespersonId,
      name: s.salespersonName,
      role: "",
      cashInHand: round(s.currentCashInHand),
      collected: round(s.totalCashCollected),
      received: round(s.totalCashReceived || 0),
      expenses: round(s.totalCashExpenses),
      handedOver: round(s.totalCashHandedOver),
    }))
    .sort((a, b) => b.cashInHand - a.cashInHand);

  // Cheques waiting to clear
  const cheques = (chequeRes.data || []).filter((r: any) => r.is_deleted !== true);
  const chequeList: PendingCheque[] = cheques.slice(0, 15).map((r: any) => ({
    receiptId: r.id,
    receiptNumber: r.receipt_number,
    companyName: r.company_name || "Customer",
    amount: num(r.amount_paid),
    chequeNumber: r.cheque_number || "",
    chequeDate: r.cheque_date || null,
    bankName: r.bank_name || "",
    atOffice: !!r.cheque_received_at,
    collectedBy: nameOf(r.created_by),
  }));

  // Approvals
  const expenses: PendingExpense[] = (expRes.data || [])
    .filter((e: any) => e.is_deleted !== true)
    .map((e: any) => ({
      id: e.id,
      number: e.expense_number,
      date: e.expense_date,
      person: nameOf(e.salesperson_id || e.employee_id || e.created_by),
      category: e.category,
      amount: num(e.amount),
      description: e.description || "",
    }));
  const handovers: PendingHandover[] = (hoRes.data || [])
    .filter((h: any) => h.is_deleted !== true)
    .map((h: any) => ({
      id: h.id,
      number: h.handover_number,
      date: h.handover_date,
      person: nameOf(h.salesperson_id),
      amount: num(h.amount),
      notes: h.notes || "",
    }));

  return {
    country,
    today,
    monthStart,
    sales: {
      today: round(sumInv(today, addDays(today, 1))),
      month: round(sumInv(monthStart)),
      lastMonth: round(sumInv(lastMonthStart, monthStart)),
      monthInvoices,
    },
    collections: {
      today: round(collectedToday),
      month: round(collectedMonth),
      byMethod: Array.from(methods.entries())
        .map(([method, v]) => ({ method, amount: round(v.amount), count: v.count }))
        .sort((a, b) => b.amount - a.amount),
    },
    receivables: {
      total: round(receivablesTotal),
      customersOwing: custBalances.filter((b) => b > 0).length,
      overdue: round(overdue),
      overdueCustomers: Array.from(byCustomer.values()).filter((c) => c.overdue > 0).length,
      ageing: ageing.map((a) => ({ ...a, amount: round(a.amount) })),
      bySeries: country === "UAE" ? { standard: round(standard), omanReg: round(omanReg) } : null,
      topOverdue: topList.map(({ salesmanId, ...c }) => ({
        ...c,
        outstanding: round(c.outstanding),
        overdue: round(c.overdue),
      })),
    },
    cash: {
      people,
      totalCashInHand: round(people.reduce((s, p) => s + p.cashInHand, 0)),
      cheques: {
        count: cheques.length,
        amount: round(cheques.reduce((s: number, r: any) => s + num(r.amount_paid), 0)),
        notAtOffice: cheques.filter((r: any) => !r.cheque_received_at).length,
        list: chequeList,
      },
    },
    approvals: {
      expenses,
      expensesTotal: round(expenses.reduce((s, e) => s + e.amount, 0)),
      handovers,
      handoversTotal: round(handovers.reduce((s, h) => s + h.amount, 0)),
      creditNotes: cnRes.count || 0,
    },
  };
}
