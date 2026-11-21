"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, Eye, Unlock, Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { currencyFor, decimalsFor } from "@/lib/currency";
import { useDialog } from "@/components/DialogProvider";
import { EmptyState } from "@/components/EmptyState";

interface Row {
  id: string;
  company: string;
  doctor: string;
  salesman: string;
  creditLimit: number;
  overLimit: boolean;
  cashOnly: boolean;
  released: boolean;
  releasedReason: string;
  state: "ok" | "watch" | "blocked" | "released";
  openAmount: number;
  notDue: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90Plus: number;
  overdueAmount: number;
  maxDaysOverdue: number;
}
interface Policy {
  blockEnabled: boolean;
  blockAfterDays: number;
  defaultCreditDays: number;
}

const STATE: Record<Row["state"], { label: string; cls: string }> = {
  blocked: { label: "Blocked", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  released: { label: "Released", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  watch: { label: "Watch", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  ok: { label: "OK", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function CreditControlPage() {
  const { profile, isStaff, loading } = useAuth();
  const dialog = useDialog();
  const [rows, setRows] = useState<Row[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [filter, setFilter] = useState<"all" | "blocked" | "watch" | "over">("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);
  const dp = decimalsFor(profile?.country);
  const cur = currencyFor(profile?.country);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/credit-control", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load");
      setRows(d.rows || []);
      setPolicy(d.policy);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && isStaff) load();
  }, [loading, isStaff, load]);

  const release = async (r: Row, released: boolean) => {
    let reason = "";
    if (released) {
      const v = await dialog.prompt({ title: `Release ${r.company}?`, message: "Salesmen will be able to sell to this customer on credit again.", label: "Reason (optional)", confirmText: "Release", tone: "success" });
      if (v === null) return;
      reason = v;
    }
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/customers/${r.id}/credit-release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ released, reason }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not update");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const totals = useMemo(() => {
    const t = { open: 0, overdue: 0, blocked: 0, b: [0, 0, 0, 0, 0] };
    rows.forEach((r) => {
      t.open += r.openAmount;
      t.overdue += r.overdueAmount;
      if (r.state === "blocked") t.blocked += 1;
      t.b[0] += r.notDue;
      t.b[1] += r.d1_30;
      t.b[2] += r.d31_60;
      t.b[3] += r.d61_90;
      t.b[4] += r.d90Plus;
    });
    return t;
  }, [rows]);

  const shown = rows.filter((r) => (filter === "all" ? true : filter === "blocked" ? r.state === "blocked" || r.state === "released" : filter === "watch" ? r.state === "watch" : r.overLimit));

  if (loading || !profile) return null;
  if (!isStaff) {
    return (
      <div className="w-full">
        <PageHeader title="Credit control" />
        <p className="px-6 py-8 text-sm font-semibold text-slate-500">Only the admin or the accountant can open this page.</p>
      </div>
    );
  }

  const buckets = [
    { label: "Not due", v: totals.b[0], cls: "bg-emerald-500" },
    { label: "1–30 days", v: totals.b[1], cls: "bg-lime-500" },
    { label: "31–60 days", v: totals.b[2], cls: "bg-amber-400" },
    { label: "61–90 days", v: totals.b[3], cls: "bg-orange-500" },
    { label: "Over 90 days", v: totals.b[4], cls: "bg-rose-600" },
  ];
  const totalB = buckets.reduce((s, b) => s + b.v, 0) || 1;

  return (
    <div className="w-full">
      <PageHeader
        title="Credit control"
        description={policy ? `Customers are blocked for credit after ${policy.blockAfterDays} days overdue. Invoices without credit days count as ${policy.defaultCreditDays} days.` : undefined}
      />
      <div className="px-6 py-5 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: "Open invoices", v: `${cur} ${money(totals.open)}`, c: "text-slate-900" },
            { l: "Overdue", v: `${cur} ${money(totals.overdue)}`, c: "text-rose-700" },
            { l: "Blocked customers", v: String(totals.blocked), c: totals.blocked ? "text-rose-700" : "text-slate-900" },
            { l: "Customers with open balance", v: String(rows.length), c: "text-slate-900" },
          ].map((k) => (
            <div key={k.l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{k.l}</div>
              <div className={`mt-1 text-xl font-extrabold ${k.c}`}>{k.v}</div>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-[#1B2A4A] mb-3">Ageing of open invoices</h2>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {buckets.map((b) => (
              <div key={b.label} className={`${b.cls} h-full`} style={{ width: `${(b.v / totalB) * 100}%`, marginRight: 2 }} title={`${b.label}: ${money(b.v)}`} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {buckets.map((b) => (
              <div key={b.label} className="flex items-start gap-2">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${b.cls}`} />
                <div>
                  <div className="text-xs font-semibold text-slate-500">{b.label}</div>
                  <div className="text-sm font-bold text-slate-900">{money(b.v)}</div>
                  <div className="text-xs font-semibold text-slate-400">{((b.v / totalB) * 100).toFixed(0)}%</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden">
          {([
            ["all", "All"],
            ["blocked", "Blocked / released"],
            ["watch", "Watch (60+ days)"],
            ["over", "Over credit limit"],
          ] as const).map(([k, l], i) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`h-9 px-4 text-sm ${i ? "border-l border-slate-300" : ""} ${filter === k ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-left font-bold">Customer</th>
                <th className="px-3 py-2.5 text-right font-bold">Open</th>
                <th className="px-3 py-2.5 text-right font-bold">Not due</th>
                <th className="px-3 py-2.5 text-right font-bold">1–30</th>
                <th className="px-3 py-2.5 text-right font-bold">31–60</th>
                <th className="px-3 py-2.5 text-right font-bold">61–90</th>
                <th className="px-3 py-2.5 text-right font-bold">90+</th>
                <th className="px-3 py-2.5 text-right font-bold">Oldest</th>
                <th className="px-3 py-2.5 text-right font-bold">Limit</th>
                <th className="px-3 py-2.5 text-left font-bold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fetching && (
                <>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={11} className="px-4 py-4">
                        <div className="h-4 w-full bg-slate-100 rounded-lg" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!fetching && shown.length === 0 && (
                <tr>
                  <td colSpan={11}><EmptyState compact title="No customers here" description="Nothing matches this filter." /></td>
                </tr>
              )}
              {shown.map((r) => {
                const st = STATE[r.state];
                const cell = (v: number, hot?: boolean) => <td className={`px-3 py-3 text-right tabular-nums ${v > 0 ? (hot ? "font-bold text-rose-700" : "text-slate-800") : "text-slate-300"}`}>{v > 0 ? money(v) : "–"}</td>;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${r.id}`} className="font-semibold text-[#1B2A4A] hover:text-accent">{r.company}</Link>
                      <div className="text-xs text-slate-500">{[r.doctor, r.salesman].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">{money(r.openAmount)}</td>
                    {cell(r.notDue)}
                    {cell(r.d1_30)}
                    {cell(r.d31_60)}
                    {cell(r.d61_90)}
                    {cell(r.d90Plus, true)}
                    <td className={`px-3 py-3 text-right tabular-nums ${r.maxDaysOverdue >= (policy?.blockAfterDays || 100) ? "font-bold text-rose-700" : "text-slate-700"}`}>{r.maxDaysOverdue > 0 ? `${r.maxDaysOverdue} d` : "–"}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${r.overLimit ? "font-bold text-rose-700" : "text-slate-600"}`}>{r.creditLimit > 0 ? money(r.creditLimit) : "–"}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${st.cls}`}>
                        {r.state === "blocked" ? <ShieldAlert className="h-3 w-3" /> : r.state === "watch" ? <Eye className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {st.label}
                      </span>
                      {r.cashOnly && <span className="ml-1 text-xs font-semibold text-amber-700">Cash only</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.state === "blocked" && (
                        <button type="button" disabled={busyId === r.id} onClick={() => release(r, true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                          <Unlock className="h-3.5 w-3.5" /> Release
                        </button>
                      )}
                      {r.state === "released" && (
                        <button type="button" disabled={busyId === r.id} onClick={() => release(r, false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40" title={r.releasedReason}>
                          <Lock className="h-3.5 w-3.5" /> Block again
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          Ageing counts invoices only. A customer&apos;s opening balance from before the portal is not aged. Release lets salesmen sell on credit to that customer again.
        </p>
      </div>
    </div>
  );
}
