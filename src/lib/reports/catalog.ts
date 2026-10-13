/**
 * The reports on the Reports tab. Shared by the pages and the API so both
 * agree on who sees what. "all" reports are open to salesmen too (limited to
 * their own invoices, customers, receipts and expenses); "office" reports are
 * for the admin and accountant only.
 */

export type ReportKey =
  | "sales-register"
  | "sales-by-product"
  | "outstanding"
  | "collections"
  | "cheques"
  | "expenses"
  | "stock-summary";

export type ReportFilter = "period" | "salesman" | "series" | "method" | "chequeStatus" | "expenseStatus";

export interface ReportDef {
  key: ReportKey;
  title: string;
  description: string;
  group: "Sales" | "Receivables" | "Cash & expenses" | "Stock";
  audience: "all" | "office";
  filters: ReportFilter[];
  /** Wide reports print in landscape. */
  landscape?: boolean;
}

export const REPORTS: ReportDef[] = [
  {
    key: "sales-register",
    title: "Sales register",
    description: "Every invoice in a period, with customer, salesman and total.",
    group: "Sales",
    audience: "all",
    filters: ["period", "salesman", "series"],
  },
  {
    key: "sales-by-product",
    title: "Sales by product",
    description: "Quantity and value sold per product in a period.",
    group: "Sales",
    audience: "all",
    filters: ["period", "salesman", "series"],
  },
  {
    key: "outstanding",
    title: "Outstanding & ageing",
    description: "What each customer owes today, by how long it is overdue.",
    group: "Receivables",
    audience: "all",
    filters: ["salesman", "series"],
    landscape: true,
  },
  {
    key: "collections",
    title: "Collections",
    description: "Receipts in a period by method, with who collected them.",
    group: "Receivables",
    audience: "all",
    filters: ["period", "salesman", "series", "method"],
    landscape: true,
  },
  {
    key: "cheques",
    title: "Cheque register",
    description: "Cheques received, by cheque date: waiting, cleared or bounced.",
    group: "Receivables",
    audience: "all",
    filters: ["period", "salesman", "chequeStatus"],
    landscape: true,
  },
  {
    key: "expenses",
    title: "Expenses",
    description: "Expenses in a period by person and category.",
    group: "Cash & expenses",
    audience: "all",
    filters: ["period", "salesman", "expenseStatus"],
    landscape: true,
  },
  {
    key: "stock-summary",
    title: "Stock summary",
    description: "Quantity on hand and stock value per product today.",
    group: "Stock",
    audience: "office",
    filters: [],
  },
];

export function reportByKey(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

export function reportsForRole(role: string | null | undefined): ReportDef[] {
  const office = role === "super_admin" || role === "accountant";
  return REPORTS.filter((r) => office || r.audience === "all");
}

export type ColumnType = "text" | "date" | "money" | "number";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportResult {
  key: ReportKey;
  title: string;
  country: string;
  /** Period shown on the report, or null for "as of today" reports. */
  period: { from: string; to: string } | null;
  asOf: string;
  /** Plain-language filter description, e.g. ["Salesman: Dr.Kaleemullah"]. */
  filters: string[];
  summary: { label: string; value: number; type: ColumnType }[];
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number> | null;
  /** For the salesman filter (office users only). */
  people?: { id: string; name: string }[];
}
