/** Salesman performance report (admin only): daily, half-monthly or monthly. */

export type PerfPeriodKind = "day" | "half" | "month";

export interface PerfPeriod {
  kind: PerfPeriodKind;
  from: string;
  to: string;
  label: string;
  /** Previous period of the same kind, for comparison. */
  prevFrom: string;
  prevTo: string;
  prevLabel: string;
  /** Days in the period up to today (a running month counts only days so far). */
  daysElapsed: number;
}

export type Tone = "good" | "warn" | "bad" | "info";

export interface PerfInsight {
  tone: Tone;
  title: string;
  detail: string;
}

export interface PerfShare {
  label: string;
  value: number;
  /** Optional second figure (units, count). */
  count?: number;
}

export interface PerformanceReport {
  country: string;
  currency: string;
  generatedAt: string;
  today: string;
  period: PerfPeriod;
  salesman: { id: string | null; name: string };
  salesmen: { id: string; name: string }[];

  sales: {
    value: number;
    prevValue: number;
    invoices: number;
    prevInvoices: number;
    units: number;
    customers: number;
    newCustomers: number;
    paidAtSale: number;
    onCredit: number;
    avgInvoice: number;
    activeDays: number;
    /** Per day of the period: value and invoice count. */
    byDay: { day: string; label: string; value: number; invoices: number }[];
    topCustomers: { name: string; value: number; invoices: number; isNew: boolean }[];
    /** Daily report: every invoice of the day. */
    invoiceList: { number: string; customer: string; value: number; status: string }[];
  };

  collections: {
    total: number;
    prevTotal: number;
    onTime: number;
    late: number;
    /** Collected within the 100-day commission window. */
    within100: number;
    after100: number;
    chequesPending: number;
    advance: number;
    byMethod: PerfShare[];
    /** Late collections: how late, in buckets. */
    lateBuckets: PerfShare[];
    receipts: number;
  };

  outstanding: {
    total: number;
    overdue: number;
    overdueInvoices: number;
    over100: number;
    oldestDays: number;
  };

  products: {
    companies: { name: string; value: number; units: number; share: number; products: { name: string; value: number; units: number }[] }[];
    topProducts: { name: string; company: string; value: number; units: number }[];
    productsSold: number;
  };

  pricing: {
    /** Value at list price of everything sold. */
    listValue: number;
    soldValue: number;
    atList: { lines: number; value: number };
    below: { lines: number; value: number; given: number };
    above: { lines: number; value: number; earned: number };
    foc: { lines: number; units: number; listValue: number };
    grossMargin: number | null;
    grossMarginPct: number | null;
    topDiscounted: { name: string; given: number; units: number }[];
    topFoc: { name: string; units: number; listValue: number }[];
  };

  expenses: {
    total: number;
    prevTotal: number;
    approved: number;
    pending: number;
    byCategory: PerfShare[];
    byPerson: PerfShare[];
    petrol: number;
    ratioToSales: number | null;
  };

  efficiency: {
    collectionRate: number | null;
    onTimeRate: number | null;
    within100Rate: number | null;
    focRate: number | null;
    discountRate: number | null;
    expenseRate: number | null;
    salesPerActiveDay: number;
    invoicesPerActiveDay: number;
    activeDayRate: number | null;
  };

  insights: PerfInsight[];
}
