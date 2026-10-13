"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { reportByKey, reportsForRole, ReportResult } from "@/lib/reports/catalog";
import { buildReportPDF, formatReportValue, reportDate } from "@/lib/pdfReportHelper";
import { currencyFor } from "@/lib/currency";

type Preset = "this-month" | "last-month" | "this-quarter" | "this-year" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "this-year", label: "This year" },
  { key: "custom", label: "Custom" },
];

function todayLocal(): string {
  // Gulf time (UTC+4), matching the server.
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function rangeFor(preset: Preset, today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1-12
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  switch (preset) {
    case "last-month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "this-quarter": {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, qStart, 1), to: today };
    }
    case "this-year":
      return { from: iso(y, 1, 1), to: today };
    default:
      return { from: iso(y, m, 1), to: today };
  }
}

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/15";

export default function ReportViewPage() {
  const params = useParams();
  const key = String(params?.key || "");
  const def = reportByKey(key);
  const { profile, isStaff, loading: authLoading } = useAuth();

  const today = useMemo(() => todayLocal(), []);
  const [preset, setPreset] = useState<Preset>("this-month");
  const [from, setFrom] = useState(() => rangeFor("this-month", todayLocal()).from);
  const [to, setTo] = useState(() => todayLocal());
  const [salesman, setSalesman] = useState("");
  const [series, setSeries] = useState("");
  const [method, setMethod] = useState("");
  const [chequeStatus, setChequeStatus] = useState("");
  const [expenseStatus, setExpenseStatus] = useState("");
  const [within, setWithin] = useState("30");
  const [overdueBy, setOverdueBy] = useState("1");

  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = rangeFor(p, today);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const has = (f: string) => !!def?.filters.includes(f as any);

  const load = useCallback(async () => {
    if (!def) return;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams();
    if (has("period")) {
      qs.set("from", from);
      qs.set("to", to);
    }
    if (salesman) qs.set("salesman", salesman);
    if (series) qs.set("series", series);
    if (method) qs.set("method", method);
    if (chequeStatus) qs.set("chequeStatus", chequeStatus);
    if (expenseStatus) qs.set("expenseStatus", expenseStatus);
    if (has("within")) qs.set("within", within);
    if (has("overdueBy")) qs.set("overdueBy", overdueBy);
    try {
      const res = await fetch(`/api/reports/${def.key}?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the report");
      setReport(json);
    } catch (e: any) {
      setError(e.message || "Could not load the report");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.key, from, to, salesman, series, method, chequeStatus, expenseStatus, within, overdueBy]);

  useEffect(() => {
    if (profile && def) load();
  }, [profile, def, load]);

  if (authLoading || !profile) return null;

  if (!def || !reportsForRole(profile.role).some((r) => r.key === def.key)) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-slate-500">This report isn't available.</p>
        <Link href="/reports" className="mt-3 inline-block text-sm font-bold text-accent">
          Back to reports
        </Link>
      </div>
    );
  }

  const currency = currencyFor(profile.country);

  const downloadPdf = () => {
    if (!report) return;
    const doc = buildReportPDF(report, { landscape: def.landscape, preparedBy: profile.full_name });
    const stamp = report.period ? `${report.period.from}_to_${report.period.to}` : report.asOf;
    doc.save(`MAAT-${report.country}-${def.key}-${stamp}.pdf`);
  };

  return (
    <div className="w-full">
      <PageHeader
        title={def.title}
        description={def.description}
        action={
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!report || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#1B2A4A] shadow-md hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-4 text-start">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" /> All reports
        </Link>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
          {has("period") && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Period</span>
                <select className={selectClass} value={preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
                  {PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">From</span>
                <input
                  type="date"
                  className={selectClass}
                  value={from}
                  max={to}
                  onChange={(e) => {
                    setPreset("custom");
                    setFrom(e.target.value);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">To</span>
                <input
                  type="date"
                  className={selectClass}
                  value={to}
                  min={from}
                  onChange={(e) => {
                    setPreset("custom");
                    setTo(e.target.value);
                  }}
                />
              </label>
            </>
          )}

          {has("salesman") && isStaff && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Salesman</span>
              <select className={selectClass} value={salesman} onChange={(e) => setSalesman(e.target.value)}>
                <option value="">Everyone</option>
                {(report?.people || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {has("series") && profile.country === "UAE" && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Kind</span>
              <select className={selectClass} value={series} onChange={(e) => setSeries(e.target.value)}>
                <option value="">Both</option>
                <option value="standard">UAE-registered</option>
                <option value="oman_reg">Oman-registered</option>
              </select>
            </label>
          )}

          {has("method") && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Method</span>
              <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">All</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </label>
          )}

          {has("chequeStatus") && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Status</span>
              <select className={selectClass} value={chequeStatus} onChange={(e) => setChequeStatus(e.target.value)}>
                <option value="">All</option>
                <option value="Pending">Waiting</option>
                <option value="Cleared">Cleared</option>
                <option value="Bounced">Bounced</option>
              </select>
            </label>
          )}

          {has("expenseStatus") && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Status</span>
              <select className={selectClass} value={expenseStatus} onChange={(e) => setExpenseStatus(e.target.value)}>
                <option value="">Approved & pending</option>
                <option value="Approved">Approved</option>
                <option value="Pending">Pending</option>
                <option value="Rejected">Rejected</option>
              </select>
            </label>
          )}

          {has("within") && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Days left</span>
              <select className={selectClass} value={within} onChange={(e) => setWithin(e.target.value)}>
                <option value="7">7 days or less</option>
                <option value="15">15 days or less</option>
                <option value="30">30 days or less</option>
                <option value="45">45 days or less</option>
                <option value="100">All open invoices under 100 days</option>
              </select>
            </label>
          )}

          {has("overdueBy") && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Overdue by</span>
              <select className={selectClass} value={overdueBy} onChange={(e) => setOverdueBy(e.target.value)}>
                <option value="1">Any</option>
                <option value="31">More than 30 days</option>
                <option value="61">More than 60 days</option>
                <option value="91">More than 90 days</option>
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={load}
            className="ms-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

        {report && (
          <>
            <p className="text-xs font-semibold text-slate-500">
              {report.period ? `${reportDate(report.period.from)} – ${reportDate(report.period.to)}` : `As of ${reportDate(report.asOf)}`}
              {report.filters.length > 0 ? ` · ${report.filters.join(" · ")}` : ""} · amounts in {currency}
            </p>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {report.summary.map((s) => (
                <div key={s.label} className="rounded-2xl border border-slate-200/80 bg-white p-4">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{s.label}</div>
                  <div className="mt-1.5 text-lg font-extrabold tabular-nums text-slate-900">
                    {s.type === "money" ? `${currency} ` : ""}
                    {formatReportValue(s.value, s.type, report.country)}
                  </div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white ${loading ? "opacity-60" : ""}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      {report.columns.map((c) => (
                        <th
                          key={c.key}
                          className={`px-4 py-3 ${c.type === "money" || c.type === "number" ? "text-right" : ""}`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={report.columns.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">
                          No records for this period.
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          {report.columns.map((c) => (
                            <td
                              key={c.key}
                              className={`px-4 py-2.5 ${
                                c.type === "money" || c.type === "number"
                                  ? "text-right tabular-nums font-semibold text-slate-800"
                                  : c.key === "customer" || c.key === "product"
                                  ? "font-bold text-slate-800"
                                  : "text-slate-600"
                              }`}
                            >
                              {formatReportValue(row[c.key], c.type, report.country)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {report.totals && report.rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-extrabold text-[#1B2A4A]">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={`px-4 py-3 ${c.type === "money" || c.type === "number" ? "text-right tabular-nums" : ""}`}>
                            {i === 0
                              ? `Total (${report.rows.length})`
                              : c.key in (report.totals || {})
                              ? formatReportValue(report.totals![c.key], c.type, report.country)
                              : ""}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}

        {!report && loading && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}
      </div>
    </div>
  );
}
