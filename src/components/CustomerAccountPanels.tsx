"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, Clock, Download, FileText, Layers, LucideIcon, Receipt as ReceiptIcon, Wallet } from "lucide-react";
import { Customer, Invoice, Receipt } from "@/types";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";
import { buildCustomerLedgerPDF, buildPendingInvoicesPDF, OutstandingInvoiceItem } from "@/lib/pdfLedgerHelper";
import { currencyFor, decimalsFor } from "@/lib/currency";

/**
 * Shared by the invoice and receipt wizards:
 * - AccountSnapshot: the customer's account on the Review step, before and
 *   after this document.
 * - SavedDocuments: the screen after saving, with the new invoice/receipt,
 *   the customer's ledger and pending invoices as PDF downloads.
 */

export interface CustomerWorkspace {
  customer: Customer;
  financialSummary: any;
  outstandingInvoices: OutstandingInvoiceItem[];
  allInvoices: Invoice[];
  allReceipts: Receipt[];
}

export function useCustomerWorkspace(customerId: string | null | undefined, refreshKey = 0) {
  const [ws, setWs] = useState<CustomerWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!customerId) {
      setWs(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/customers/${customerId}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setWs(data && data.customer ? data : null);
      })
      .catch(() => {
        if (!cancelled) setWs(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, refreshKey]);
  return { ws, loading };
}

function todayGulf(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
}

export function accountFigures(ws: CustomerWorkspace) {
  const pending = Math.max(0, Number(ws.financialSummary?.pendingBalance) || 0);
  const today = todayGulf();
  let overdue = 0;
  let overdueCount = 0;
  for (const inv of ws.outstandingInvoices || []) {
    const due = new Date(`${String(inv.date).slice(0, 10)}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + (Number(inv.creditDays) || 0));
    if (due.toISOString().slice(0, 10) < today) {
      overdue += Number(inv.outstandingAmount) || 0;
      overdueCount += 1;
    }
  }
  const pendingCheques = (ws.allReceipts || []).filter(
    (r) => !r.isDeleted && r.paymentMethod === "Cheque" && (r.chequeStatus || "Pending") === "Pending"
  );
  const chequeTotal = pendingCheques.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0);
  const lastPayment = ws.financialSummary?.lastPayment || null;
  return {
    pending,
    openCount: (ws.outstandingInvoices || []).length,
    overdue,
    overdueCount,
    chequeCount: pendingCheques.length,
    chequeTotal,
    lastPayment,
  };
}

/** What this document does to the balance. */
export type BalanceChange =
  | { kind: "invoice"; amount: number; credit: boolean; cheque: boolean }
  | { kind: "receipt"; amount: number; cheque: boolean };

export function AccountSnapshot({ customerId, change }: { customerId: string; change: BalanceChange }) {
  const { ws, loading } = useCustomerWorkspace(customerId);
  if (loading && !ws) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 space-y-3">
        <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
        <div className="h-8 w-40 rounded bg-slate-100 animate-pulse" />
        <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
      </div>
    );
  }
  if (!ws) return null;
  const country = ws.customer.country;
  const dp = decimalsFor(country);
  const money = (n: number) =>
    `${currencyFor(country)} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const f = accountFigures(ws);

  // Credit invoices and cheques both leave the money owed until paid / cleared.
  let after = f.pending;
  let afterNote = "";
  if (change.kind === "invoice") {
    if (change.credit || change.cheque) after = f.pending + change.amount;
    if (change.cheque) afterNote = "until the cheque clears";
  } else if (change.cheque) {
    afterNote = `${money(Math.max(0, f.pending - change.amount))} once the cheque clears`;
  } else {
    after = Math.max(0, f.pending - change.amount);
  }

  const row = (Icon: LucideIcon, label: string, value: React.ReactNode, tone = "text-slate-900") => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="w-4 h-4 text-slate-400" /> {label}
      </dt>
      <dd className={`text-sm font-medium text-right ${tone}`}>{value}</dd>
    </div>
  );

  return (
    <section className="wiz-in bg-white border border-slate-200/80 rounded-2xl shadow-sm shadow-slate-200/60 p-5 md:p-6" style={{ animationDelay: "140ms" }}>
      <h2 className="text-sm font-semibold text-slate-700 mb-1">Customer account</h2>
      <dl className="divide-y divide-slate-50">
        {row(Wallet, "Pending now", money(f.pending), f.pending > 0 ? "text-rose-700" : "text-slate-900")}
        {row(
          FileText,
          "Open invoices",
          f.openCount === 0 ? "None" : `${f.openCount}${f.overdueCount ? ` · ${f.overdueCount} overdue (${money(f.overdue)})` : ""}`,
          f.overdueCount ? "text-rose-700" : "text-slate-900"
        )}
        {row(Clock, "Cheques not cleared", f.chequeCount === 0 ? "None" : `${f.chequeCount} · ${money(f.chequeTotal)}`, f.chequeCount ? "text-amber-700" : "text-slate-900")}
        {f.lastPayment &&
          row(
            ReceiptIcon,
            "Last payment",
            `${money(Number(f.lastPayment.amount ?? f.lastPayment.amountPaid) || 0)}${f.lastPayment.date || f.lastPayment.paymentDate ? ` on ${String(f.lastPayment.date || f.lastPayment.paymentDate).slice(0, 10)}` : ""}`
          )}
        {ws.customer.cashOnly && row(AlertTriangle, "Status", "Cash only", "text-amber-700")}
      </dl>
      <div className={`mt-3 -mx-5 md:-mx-6 -mb-5 md:-mb-6 px-5 md:px-6 py-4 rounded-b-2xl flex items-center justify-between gap-3 ${after > 0 ? "bg-rose-50/70" : "bg-emerald-50/70"}`}>
        <span className="text-sm font-semibold text-slate-900">Pending after this {change.kind}</span>
        <span className="text-right">
          <span className={`text-base font-semibold ${after > 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(after)}</span>
          {afterNote && <span className="block text-xs text-slate-500">{afterNote}</span>}
        </span>
      </div>
    </section>
  );
}

function DownloadButton({
  label,
  onClick,
  disabled,
  icon: Icon = FileText,
  tone = "bg-slate-100 text-slate-600",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  tone?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex items-center gap-3 p-3.5 min-h-[60px] w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 transition hover:border-accent hover:shadow-md hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
    >
      <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${tone}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-left flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        <span className="block text-xs font-normal text-slate-400">PDF</span>
      </span>
      <Download className="w-4 h-4 text-slate-400 group-hover:text-accent transition shrink-0" />
    </button>
  );
}

export function SavedDocuments({
  title,
  customerId,
  invoiceIds = [],
  receiptNumbers = [],
  invoiceIdsForReceipts = [],
  newHref,
  newLabel,
  listHref,
  listLabel,
}: {
  title: string;
  customerId: string;
  /** Invoices saved now (ids). */
  invoiceIds?: string[];
  /** Receipts saved now (numbers). */
  receiptNumbers?: string[];
  /** Receipts made automatically for these invoices (paid invoices). */
  invoiceIdsForReceipts?: string[];
  newHref: string;
  newLabel: string;
  listHref: string;
  listLabel: string;
}) {
  const { ws, loading } = useCustomerWorkspace(customerId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const country = ws?.customer.country;
  const dp = decimalsFor(country);
  const money = (n: number) =>
    `${currencyFor(country)} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const code = ws?.customer.customerCode || "CUSTOMER";

  const receipts: Receipt[] = ws
    ? ws.allReceipts.filter(
        (r) => !r.isDeleted && (receiptNumbers.includes(r.receiptNumber) || (r.invoiceId && invoiceIdsForReceipts.includes(r.invoiceId)))
      )
    : [];
  const invoices: Invoice[] = ws ? ws.allInvoices.filter((i) => invoiceIds.includes(i.id)) : [];
  const hasOmanRegDocs = Boolean(
    ws &&
      ws.customer.country === "UAE" &&
      (ws.allInvoices.some((inv) => inv.billingSeries === "oman_reg") || ws.allReceipts.some((rec) => rec.billingSeries === "oman_reg"))
  );

  const downloadInvoice = async (inv: Invoice) => {
    setBusy(inv.id);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${inv.id}?t=${Date.now()}`);
      const full = res.ok ? await res.json() : null;
      buildInvoicePDF(full && full.id ? full : inv).save(`MAAT-INVOICE-${inv.invoiceNumber}.pdf`);
    } catch {
      setError("Could not make the invoice PDF. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const downloadReceipt = (r: Receipt) => buildReceiptPDF(r).save(`MAAT-RECEIPT-${r.receiptNumber}.pdf`);
  const downloadLedger = (series?: "standard" | "oman_reg") => {
    if (!ws) return;
    buildCustomerLedgerPDF(ws.customer, ws.allInvoices, ws.allReceipts, ws.financialSummary, { billingSeries: series }).save(
      series === "oman_reg" ? `STATEMENT-${code}-2.pdf` : `MAAT-LEDGER-${code}.pdf`
    );
  };
  const downloadPending = (series?: "standard" | "oman_reg") => {
    if (!ws) return;
    buildPendingInvoicesPDF(ws.customer, ws.outstandingInvoices, ws.financialSummary, { billingSeries: series }).save(
      series === "oman_reg" ? `PENDING-${code}-2.pdf` : `MAAT-PENDING-INVOICES-${code}.pdf`
    );
  };

  const f = ws ? accountFigures(ws) : null;

  return (
    <div className="space-y-4">
      <section className="wiz-in relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent text-white px-6 py-9 md:py-12 text-center shadow-lg shadow-primary/15">
        <span className="wiz-pop mx-auto mb-4 w-16 h-16 rounded-full bg-white/15 ring-8 ring-white/10 grid place-items-center">
          <CheckCircle className="w-9 h-9 text-white" />
        </span>
        <h2 className="text-xl md:text-2xl font-semibold">{title}</h2>
        {ws && <p className="text-sm text-white/80 mt-1">{ws.customer.company}</p>}
      </section>

      {f && (
        <section className="wiz-in bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5 md:p-6" style={{ animationDelay: "80ms" }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Customer account now</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:divide-x divide-slate-100">
            <div>
              <dt className="text-xs text-slate-500">Pending</dt>
              <dd className={`text-lg font-semibold ${f.pending > 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(f.pending)}</dd>
            </div>
            <div className="sm:pl-4">
              <dt className="text-xs text-slate-500">Open invoices</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {f.openCount}
                {f.overdueCount > 0 && <span className="text-sm font-normal text-rose-700"> · {f.overdueCount} overdue</span>}
              </dd>
            </div>
            <div className="sm:pl-4">
              <dt className="text-xs text-slate-500">Cheques not cleared</dt>
              <dd className="text-lg font-semibold text-slate-900">{f.chequeCount === 0 ? "None" : money(f.chequeTotal)}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="wiz-in bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5 md:p-6" style={{ animationDelay: "160ms" }}>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Downloads</h2>
        {loading && !ws ? (
          <p className="text-sm text-slate-500">Preparing…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {invoices.map((inv) => (
              <DownloadButton
                key={inv.id}
                icon={FileText}
                tone="bg-sky-50 text-sky-700"
                label={busy === inv.id ? "Preparing…" : `Invoice ${inv.invoiceNumber}`}
                disabled={busy === inv.id}
                onClick={() => downloadInvoice(inv)}
              />
            ))}
            {receipts.map((r) => (
              <DownloadButton key={r.id} icon={ReceiptIcon} tone="bg-emerald-50 text-emerald-700" label={`Receipt ${r.receiptNumber}`} onClick={() => downloadReceipt(r)} />
            ))}
            {hasOmanRegDocs ? (
              <>
                <DownloadButton icon={Layers} tone="bg-violet-50 text-violet-700" label="Ledger (UAE-registered)" onClick={() => downloadLedger("standard")} disabled={!ws} />
                <DownloadButton icon={Layers} tone="bg-violet-50 text-violet-700" label="Ledger (Oman-registered)" onClick={() => downloadLedger("oman_reg")} disabled={!ws} />
                <DownloadButton icon={Clock} tone="bg-amber-50 text-amber-700" label="Pending invoices (UAE-registered)" onClick={() => downloadPending("standard")} disabled={!ws} />
                <DownloadButton icon={Clock} tone="bg-amber-50 text-amber-700" label="Pending invoices (Oman-registered)" onClick={() => downloadPending("oman_reg")} disabled={!ws} />
              </>
            ) : (
              <>
                <DownloadButton icon={Layers} tone="bg-violet-50 text-violet-700" label="Customer ledger" onClick={() => downloadLedger()} disabled={!ws} />
                <DownloadButton icon={Clock} tone="bg-amber-50 text-amber-700" label="Pending invoices" onClick={() => downloadPending()} disabled={!ws} />
              </>
            )}
          </div>
        )}
        {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
      </section>

      <div className="wiz-in flex flex-col-reverse sm:flex-row gap-3 sm:justify-end" style={{ animationDelay: "220ms" }}>
        <Link href={listHref} className="px-6 py-3 min-h-[48px] text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl bg-white hover:border-slate-400 text-center">
          {listLabel}
        </Link>
        <a href={newHref} className="px-6 py-3 min-h-[48px] text-sm font-semibold text-white bg-primary rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-hover text-center">
          {newLabel}
        </a>
      </div>
    </div>
  );
}
