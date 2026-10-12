"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/currency";
import type { CommissionReport, SalesmanCommission, CommissionBand } from "@/lib/db/commission";

type Report = CommissionReport & { enabled: boolean; canMarkPaid?: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function currentQuarter() {
  const d = new Date();
  return { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 };
}

function quarterLabel(year: number, quarter: number) {
  const m = (quarter - 1) * 3;
  return `Q${quarter} ${year} · ${MONTHS[m]}–${MONTHS[m + 2]}`;
}

function shortDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
}

function bandsText(bands: CommissionBand[]) {
  const n = (v: number) => v.toLocaleString("en-US");
  return bands
    .map((b) => (b.to === null ? `above ${n(b.from)}: ${b.rate}%` : `${n(b.from)}–${n(b.to)}: ${b.rate}%`))
    .join("  ·  ");
}

const money = (v: number) => formatMoney(v, "UAE");

function SalesmanDetail({ s, showName }: { s: SalesmanCommission; showName?: boolean }) {
  return (
    <div className="space-y-5">
      {showName && <h3 className="text-sm font-bold text-[#1B2A4A]">{s.salesmanName}</h3>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Collected in time</div>
          <div className="text-xl font-black text-[#1B2A4A] mt-1">{money(s.eligibleTotal)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Collected after 100 days</div>
          <div className="text-xl font-black text-slate-500 mt-1">{money(s.lateTotal)}</div>
          <div className="text-[11px] font-medium text-slate-400 mt-0.5">No commission</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Commission</div>
          <div className="text-xl font-black text-emerald-700 mt-1">{money(s.commission)}</div>
          {s.payout && (
            <div className="text-[11px] font-medium text-slate-500 mt-0.5">
              Paid {shortDate(s.payout.paidAt.slice(0, 10))}
              {s.payout.paidByName ? ` by ${s.payout.paidByName}` : ""}
            </div>
          )}
        </div>
      </div>

      {s.nextBand && (
        <p className="text-sm font-semibold text-slate-600">
          {money(s.nextBand.remaining)} more collected in time this quarter reaches the {s.nextBand.rate}% band.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
              <th className="text-start py-2 pe-3">Band</th>
              <th className="text-end py-2 pe-3">Amount in band</th>
              <th className="text-end py-2 pe-3">Rate</th>
              <th className="text-end py-2">Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {s.breakdown.map((b) => (
              <tr key={b.from} className={b.amount > 0 ? "" : "text-slate-400"}>
                <td className="py-2 pe-3 font-medium">
                  {b.to === null ? `Above ${b.from.toLocaleString("en-US")}` : `${b.from.toLocaleString("en-US")} – ${b.to.toLocaleString("en-US")}`}
                </td>
                <td className="py-2 pe-3 text-end">{money(b.amount)}</td>
                <td className="py-2 pe-3 text-end">{b.rate}%</td>
                <td className="py-2 text-end font-bold">{money(b.commission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Collections this quarter</h4>
        {s.lines.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing collected yet this quarter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                  <th className="text-start py-2 pe-3">Collected</th>
                  <th className="text-start py-2 pe-3">Receipt</th>
                  <th className="text-start py-2 pe-3">Invoice</th>
                  <th className="text-start py-2 pe-3">Customer</th>
                  <th className="text-end py-2 pe-3">Days</th>
                  <th className="text-end py-2 pe-3">Amount</th>
                  <th className="text-start py-2">Counts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.lines.map((l) => (
                  <tr key={`${l.receiptId}:${l.invoiceId}`} className={l.eligible ? "" : "text-slate-400"}>
                    <td className="py-2 pe-3 whitespace-nowrap">{shortDate(l.collectedOn)}</td>
                    <td className="py-2 pe-3">{l.receiptNumber}</td>
                    <td className="py-2 pe-3">{l.invoiceNumber}</td>
                    <td className="py-2 pe-3">{l.companyName || "—"}</td>
                    <td className="py-2 pe-3 text-end">{l.days}</td>
                    <td className="py-2 pe-3 text-end font-semibold">{money(l.amount)}</td>
                    <td className="py-2">{l.eligible ? "Yes" : "No, after 100 days"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommissionPage() {
  const { isSuperAdmin } = useAuth();
  const [{ year, quarter }, setPeriod] = useState(currentQuarter);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAllOpen, setShowAllOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/commission?year=${year}&quarter=${quarter}&t=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load commission");
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => {
    load();
  }, [load]);

  const step = (delta: number) => {
    setOpen(null);
    setPeriod(({ year: y, quarter: q }) => {
      const idx = y * 4 + (q - 1) + delta;
      return { year: Math.floor(idx / 4), quarter: (idx % 4) + 1 };
    });
  };

  const isFutureNext = useMemo(() => {
    const now = currentQuarter();
    return year * 4 + quarter >= now.year * 4 + now.quarter;
  }, [year, quarter]);

  const markPaid = async (s: SalesmanCommission) => {
    if (!window.confirm(`Record ${money(s.commission)} commission for ${s.salesmanName} (${quarterLabel(year, quarter)}) as paid?`)) return;
    setBusy(s.salesmanId);
    setError(null);
    try {
      const res = await fetch("/api/commission/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesmanId: s.salesmanId, year, quarter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not record the payment");
      setMessage(`Commission for ${s.salesmanName} recorded as paid.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const undoPaid = async (s: SalesmanCommission) => {
    if (!window.confirm(`Undo the payment record for ${s.salesmanName}?`)) return;
    setBusy(s.salesmanId);
    try {
      const res = await fetch("/api/commission/payouts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesmanId: s.salesmanId, year, quarter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not undo");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const isStaff = Boolean(report?.canMarkPaid);
  const watch = (report?.watchlist || []).filter((w) => showAllOpen || w.daysLeft <= 30);

  return (
    <div className="w-full">
      <PageHeader title="Commission" description="Earned on money collected within 100 days of the invoice date" />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1400px] mx-auto space-y-6 text-start">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            <span className="font-semibold">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}
        {message && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 font-semibold">
            <span>{message}</span>
            <button onClick={() => setMessage(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}

        {report && report.enabled === false ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Commission currently applies to UAE salesmen only.
          </div>
        ) : (
          <>
            {/* Quarter */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <button onClick={() => step(-1)} aria-label="Previous quarter" className="p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 text-sm font-bold text-[#1B2A4A] whitespace-nowrap">{quarterLabel(year, quarter)}</span>
                <button
                  onClick={() => step(1)}
                  disabled={isFutureNext}
                  aria-label="Next quarter"
                  className="p-2 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {report && report.bands.length > 0 && (
                <p className="text-xs font-semibold text-slate-500">Bands per quarter (AED): {bandsText(report.bands)}</p>
              )}
            </div>

            {loading && !report ? (
              <p className="text-sm font-semibold text-slate-500">Loading...</p>
            ) : report && isStaff ? (
              /* Admin / Accountant: all salesmen */
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                      <th className="text-start p-4">Salesman</th>
                      <th className="text-end p-4">Collected in time</th>
                      <th className="text-end p-4">After 100 days</th>
                      <th className="text-end p-4">Commission</th>
                      <th className="text-start p-4">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.salesmen.length === 0 && (
                      <tr><td colSpan={5} className="p-6 text-center text-slate-500">No salesmen.</td></tr>
                    )}
                    {report.salesmen.map((s) => (
                      <React.Fragment key={s.salesmanId}>
                        <tr className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(open === s.salesmanId ? null : s.salesmanId)}>
                          <td className="p-4 font-bold text-slate-800">
                            <span className="inline-flex items-center gap-2">
                              <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open === s.salesmanId ? "rotate-180" : ""}`} />
                              {s.salesmanName}
                            </span>
                          </td>
                          <td className="p-4 text-end font-semibold">{money(s.eligibleTotal)}</td>
                          <td className="p-4 text-end text-slate-500">{money(s.lateTotal)}</td>
                          <td className="p-4 text-end font-black text-emerald-700">{money(s.commission)}</td>
                          <td className="p-4" onClick={(e) => e.stopPropagation()}>
                            {s.payout ? (
                              <span className="text-xs font-semibold text-slate-600">
                                Paid {shortDate(s.payout.paidAt.slice(0, 10))} ({money(s.payout.commissionAmount)})
                                {isSuperAdmin && (
                                  <button
                                    onClick={() => undoPaid(s)}
                                    disabled={busy === s.salesmanId}
                                    className="ms-2 text-slate-400 hover:text-rose-600 underline cursor-pointer"
                                  >
                                    Undo
                                  </button>
                                )}
                              </span>
                            ) : (
                              <button
                                onClick={() => markPaid(s)}
                                disabled={busy === s.salesmanId || s.commission <= 0}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                              >
                                {busy === s.salesmanId ? "Saving..." : "Mark as paid"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {open === s.salesmanId && (
                          <tr>
                            <td colSpan={5} className="bg-slate-50/60 p-5">
                              <SalesmanDetail s={s} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : report && report.salesmen[0] ? (
              /* Salesman: own commission */
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <SalesmanDetail s={report.salesmen[0]} />
              </div>
            ) : null}

            {/* Open invoices against the 100-day window */}
            {report && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1B2A4A]">Collect within 100 days</h3>
                    <p className="text-xs font-medium text-slate-500">
                      Open invoices that still earn commission if collected in time.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={showAllOpen} onChange={(e) => setShowAllOpen(e.target.checked)} />
                    Show all, not only the next 30 days
                  </label>
                </div>
                {watch.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {showAllOpen ? "No open invoices inside the 100-day window." : "Nothing reaches 100 days in the next 30 days."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                          <th className="text-start py-2 pe-3">Invoice</th>
                          <th className="text-start py-2 pe-3">Customer</th>
                          {isStaff && <th className="text-start py-2 pe-3">Salesman</th>}
                          <th className="text-start py-2 pe-3">Invoice date</th>
                          <th className="text-end py-2 pe-3">Days left</th>
                          <th className="text-end py-2">Open</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {watch.map((w) => (
                          <tr key={w.invoiceId}>
                            <td className="py-2 pe-3 font-semibold">{w.invoiceNumber}</td>
                            <td className="py-2 pe-3">{w.companyName || "—"}</td>
                            {isStaff && <td className="py-2 pe-3">{w.salesmanName}</td>}
                            <td className="py-2 pe-3 whitespace-nowrap">{shortDate(w.invoiceDate)}</td>
                            <td className={`py-2 pe-3 text-end font-bold ${w.daysLeft <= 7 ? "text-rose-600" : "text-slate-700"}`}>
                              {w.daysLeft === 0 ? "Today" : w.daysLeft}
                            </td>
                            <td className="py-2 text-end font-semibold">{money(w.outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
