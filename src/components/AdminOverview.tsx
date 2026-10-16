"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, CalendarClock, CheckCircle2, Receipt, Wallet } from "lucide-react";
import { currencyFor, decimalsFor } from "@/lib/currency";
import { Delta, KpiTile, RankBars, SERIES, fmtMoney } from "@/components/charts/PerfCharts";

/**
 * The admin's home screen: how the business is doing today and this month,
 * and the few things that need a decision. Numbers come from one API call.
 */

interface Overview {
  country: string;
  today: string;
  sales: { today: { value: number; count: number }; month: { value: number; count: number }; prevMonth: { value: number; count: number } };
  collections: { today: number; month: number; prevMonth: number };
  series: { day: string; sales: number; collected: number }[];
  receivables: { owed: number; overdue: number; overdueInvoices: number; over60: number; top: { name: string; amount: number }[] };
  cheques: { waiting: number; waitingAmount: number; dueSoon: number; dueSoonAmount: number };
  expiry: { expiredUnits: number; expiredValue: number; nearUnits: number; nearValue: number; nearLots: number; expiredLots: number };
  expenses: { month: number; pendingCount: number; pendingAmount: number };
  salesmen: { name: string; sales: number; invoices: number; collected: number }[];
}

function Trend({ series, currency }: { series: Overview["series"]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 190;
  const padL = 44;
  const padB = 22;
  const padT = 10;
  const max = Math.max(...series.flatMap((s) => [s.sales, s.collected]), 1);
  const x = (i: number) => padL + (i * (W - padL - 8)) / Math.max(series.length - 1, 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const path = (key: "sales" | "collected") => series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");
  const short = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
  const h = hover !== null ? series[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sales and collections, last 30 days" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" />
            <text x={padL - 6} y={y(max * t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {short(max * t)}
            </text>
          </g>
        ))}
        <path d={path("sales")} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" />
        <path d={path("collected")} fill="none" stroke={SERIES[2]} strokeWidth={2} strokeLinejoin="round" />
        {series.map((s, i) =>
          i % 5 === 0 || i === series.length - 1 ? (
            <text key={s.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {s.day.slice(8, 10)}/{s.day.slice(5, 7)}
            </text>
          ) : null
        )}
        {series.map((s, i) => (
          <rect key={`h${s.day}`} x={x(i) - 8} y={padT} width={16} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#cbd5e1" />
            <circle cx={x(hover)} cy={y(h.sales)} r={4} fill={SERIES[0]} stroke="#fff" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(h.collected)} r={4} fill={SERIES[2]} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>
      {h && (
        <div className="absolute top-0 right-0 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          <div className="font-semibold">{h.day}</div>
          <div>Sales {fmtMoney(h.sales, currency)}</div>
          <div>Collected {fmtMoney(h.collected, currency)}</div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: SERIES[0] }} /> Sales</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: SERIES[2] }} /> Collected</span>
      </div>
    </div>
  );
}

function Attention({
  tone,
  icon: Icon,
  title,
  detail,
  href,
}: {
  tone: "bad" | "warn";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  href: string;
}) {
  const c = tone === "bad" ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-amber-50 text-amber-800 border-amber-100";
  return (
    <Link href={href} className="wiz-in group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-slate-300 hover:shadow-sm transition">
      <span className={`mt-0.5 rounded-lg border p-1.5 ${c}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 leading-snug">{title}</span>
        <span className="block text-xs text-slate-500 leading-snug mt-0.5">{detail}</span>
      </span>
      <ArrowRight className="w-4 h-4 mt-1 text-slate-300 group-hover:text-accent transition shrink-0" />
    </Link>
  );
}

export function AdminOverview({ name }: { name: string }) {
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/overview", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load");
        setD(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-rose-700">{error}</p>;
  if (!d) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const cur = currencyFor(d.country);
  const dp = decimalsFor(d.country);
  const m = (n: number) => fmtMoney(n, cur, dp);
  const hour = new Date(Date.now() + 4 * 3600 * 1000).getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const collectedRate = d.sales.month.value > 0 ? Math.round((d.collections.month / d.sales.month.value) * 100) : null;

  const attention: React.ReactNode[] = [];
  if (d.receivables.over60 > 0)
    attention.push(
      <Attention key="o60" tone="bad" icon={AlertTriangle} title={`${m(d.receivables.over60)} is more than 60 days overdue`} detail="Collect before it passes 100 days and the salesman loses commission." href="/reports/approaching-100" />
    );
  if (d.receivables.overdue > 0)
    attention.push(
      <Attention key="od" tone="warn" icon={Wallet} title={`${m(d.receivables.overdue)} overdue on ${d.receivables.overdueInvoices} invoices`} detail="Overdue invoices, most overdue first." href="/reports/overdue" />
    );
  if (d.cheques.dueSoon > 0)
    attention.push(
      <Attention key="chq" tone="warn" icon={Banknote} title={`${d.cheques.dueSoon} cheque${d.cheques.dueSoon === 1 ? "" : "s"} due this week (${m(d.cheques.dueSoonAmount)})`} detail={`${d.cheques.waiting} cheques waiting in total, ${m(d.cheques.waitingAmount)}.`} href="/reports/cheques" />
    );
  if (d.expiry.expiredUnits > 0)
    attention.push(
      <Attention key="exp" tone="bad" icon={CalendarClock} title={`${d.expiry.expiredUnits.toLocaleString("en-US")} units expired (${m(d.expiry.expiredValue)} at price)`} detail="Remove, return to the supplier or write off." href="/reports/slow-moving" />
    );
  if (d.expiry.nearUnits > 0)
    attention.push(
      <Attention key="near" tone="warn" icon={CalendarClock} title={`${d.expiry.nearUnits.toLocaleString("en-US")} units expire within 6 months (${m(d.expiry.nearValue)} at price)`} detail="Sell these first. Salesmen may discount or give FOC on them." href="/reports/expiry" />
    );
  if (d.expenses.pendingCount > 0)
    attention.push(
      <Attention key="exps" tone="warn" icon={Receipt} title={`${d.expenses.pendingCount} expense${d.expenses.pendingCount === 1 ? "" : "s"} waiting for approval (${m(d.expenses.pendingAmount)})`} detail="Approve or reject." href="/expenses" />
    );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg md:text-xl font-semibold text-slate-900">
          {greeting}, {name.split(" ")[0]}
        </h2>
        <p className="text-sm text-slate-500">
          {new Date(`${d.today}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {d.country}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile label="Sales today" value={m(d.sales.today.value)} sub={`${d.sales.today.count} invoices`} delay={0} />
        <KpiTile
          label="Sales this month"
          value={m(d.sales.month.value)}
          delta={<Delta now={d.sales.month.value} prev={d.sales.prevMonth.value} />}
          sub="vs the same days last month"
          delay={60}
        />
        <KpiTile
          label="Collected this month"
          value={m(d.collections.month)}
          delta={<Delta now={d.collections.month} prev={d.collections.prevMonth} />}
          sub={collectedRate !== null ? `${collectedRate}% of sales` : `${m(d.collections.today)} today`}
          delay={120}
        />
        <KpiTile label="Owed to you" value={m(d.receivables.owed)} sub={`${m(d.receivables.overdue)} overdue`} delay={180} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Sales and collections, last 30 days</h3>
          <Trend series={d.series} currency={cur} />
        </section>
        <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Needs your attention</h3>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Nothing urgent right now.
            </p>
          ) : (
            <div className="space-y-2.5">{attention}</div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Salesmen this month</h3>
            <Link href="/performance" className="text-xs font-semibold text-accent">Full performance report</Link>
          </div>
          <RankBars
            rows={d.salesmen.map((s) => ({ label: s.name, value: s.sales, sub: `${s.invoices} invoices · collected ${m(s.collected)}`, key: s.name }))}
            currency={cur}
            dp={dp}
            color={SERIES[0]}
          />
        </section>
        <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Biggest overdue customers</h3>
            <Link href="/reports/outstanding" className="text-xs font-semibold text-accent">Outstanding report</Link>
          </div>
          <RankBars rows={d.receivables.top.map((c) => ({ label: c.name, value: c.amount, key: c.name }))} currency={cur} dp={dp} color={SERIES[1]} />
          <p className="mt-4 text-xs text-slate-500">Expenses this month: <span className="font-semibold text-slate-800">{m(d.expenses.month)}</span></p>
        </section>
      </div>
    </div>
  );
}
