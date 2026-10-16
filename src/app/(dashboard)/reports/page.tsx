"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ArrowRight, Download, Layers } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { reportsForRole, ReportDef, ReportResult } from "@/lib/reports/catalog";
import { buildCombinedReportPDF, reportDate } from "@/lib/pdfReportHelper";

const GROUPS: ReportDef["group"][] = ["Sales", "Receivables", "Cash & expenses", "Stock"];

const todayLocal = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);

/** Pick several reports and a period, get one PDF with a contents page. */
function CombinedReport({ reports, preparedBy, country }: { reports: ReportDef[]; preparedBy: string; country: string }) {
  const today = useMemo(() => todayLocal(), []);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(reports.map((r) => r.key)));
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (k: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const chosen = reports.filter((r) => picked.has(r.key));
      const results = await Promise.all(
        chosen.map(async (r) => {
          const qs = new URLSearchParams();
          if (r.filters.includes("period")) {
            qs.set("from", from);
            qs.set("to", to);
          }
          const res = await fetch(`/api/reports/${r.key}?${qs.toString()}`, { cache: "no-store" });
          const json = await res.json();
          if (!res.ok) throw new Error(`${r.title}: ${json.error || "could not load"}`);
          return { report: json as ReportResult, landscape: r.landscape };
        })
      );
      const doc = buildCombinedReportPDF(results, {
        preparedBy,
        country,
        asOf: today,
        periodLabel: `${reportDate(from)} – ${reportDate(to)}`,
      });
      doc.save(`MAAT-${country}-combined-reports-${today}.pdf`);
    } catch (e: any) {
      setError(e.message || "Could not build the combined report");
    } finally {
      setBusy(false);
    }
  };

  const input = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/15";

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-5 text-start">
        <span className="rounded-lg bg-teal-50 p-1.5 text-[#165B66]">
          <Layers className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-extrabold text-[#1B2A4A]">Combined report (one PDF)</span>
          <span className="block text-xs font-semibold text-slate-500">Choose the reports and the period. They are put together in one PDF with a contents page.</span>
        </span>
        <span className="text-xs font-bold text-accent">{open ? "Close" : "Open"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 p-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {reports.map((r) => (
              <label key={r.key} className="flex items-center gap-2 py-1 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} className="h-4 w-4 accent-[#165B66]" />
                {r.title}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">From</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">To</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} />
            </label>
            <button
              type="button"
              onClick={() => setPicked(picked.size === reports.length ? new Set() : new Set(reports.map((r) => r.key)))}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              {picked.size === reports.length ? "Clear all" : "Select all"}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={busy || picked.size === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              {busy ? "Building PDF…" : `Download PDF (${picked.size})`}
            </button>
          </div>
          <p className="text-xs font-semibold text-slate-500">The period applies to sales, collections, cheque and expense reports. Stock and balance reports show today.</p>
          {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
        </div>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const { profile, isSalesperson, loading } = useAuth();
  if (loading || !profile) return null;
  const reports = reportsForRole(profile.role);

  return (
    <div className="w-full">
      <PageHeader
        title="Reports"
        description={
          isSalesperson
            ? "Your sales, customers, collections and expenses. Download any report as a PDF."
            : `Reports for ${profile.country}. Pick a period and filters, then download as a PDF.`
        }
      />
      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1200px] mx-auto space-y-6 text-start">
        <CombinedReport reports={reports} preparedBy={profile.full_name || ""} country={profile.country} />
        {GROUPS.map((group) => {
          const list = reports.filter((r) => r.group === group);
          if (list.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{group}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((r) => (
                  <Link
                    key={r.key}
                    href={`/reports/${r.key}`}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-lg bg-teal-50 p-1.5 text-[#165B66]">
                          <BarChart3 className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-extrabold text-[#1B2A4A] group-hover:text-accent">{r.title}</span>
                      </div>
                      <p className="text-xs font-semibold leading-relaxed text-slate-500">{r.description}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
