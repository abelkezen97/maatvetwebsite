"use client";

import React, { useState } from "react";
import { SERIES, fmtMoney } from "./PerfCharts";

/** Shared pieces of the Sales and Collection dashboards. */

export const todayDubai = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const addD = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthFirst = (day: string, back = 0) => {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 10);
};

export function presets() {
  const t = todayDubai();
  const lastMonthFirst = monthFirst(t, 1);
  return [
    { key: "month", label: "This month", from: monthFirst(t), to: t },
    { key: "last", label: "Last month", from: lastMonthFirst, to: addD(monthFirst(t), -1) },
    { key: "q", label: "Last 3 months", from: monthFirst(t, 2), to: t },
    { key: "6m", label: "Last 6 months", from: monthFirst(t, 5), to: t },
    { key: "year", label: "This year", from: `${t.slice(0, 4)}-01-01`, to: t },
  ];
}

export function PeriodBar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const list = presets();
  const active = list.find((p) => p.from === from && p.to === to)?.key;
  const input = "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/15";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden">
        {list.map((p, i) => (
          <button key={p.key} type="button" onClick={() => onChange(p.from, p.to)} className={`h-9 px-3.5 text-sm ${i ? "border-l border-slate-300" : ""} ${active === p.key ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">From</span>
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} className={input} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">To</span>
        <input type="date" value={to} min={from} onChange={(e) => e.target.value && onChange(from, e.target.value)} className={input} />
      </label>
    </div>
  );
}

export function Card({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs ${className}`}>
      <div className="mb-3">
        <h2 className="text-sm font-extrabold text-[#1B2A4A]">{title}</h2>
        {note && <p className="text-xs text-slate-500 mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** Vertical bars, one or two series, value on hover and written under each bar. */
export function Bars({
  items,
  series,
  currency,
  height = 150,
}: {
  items: { label: string; a: number; b?: number }[];
  series: string[];
  currency: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...items.flatMap((i) => [i.a, i.b || 0]), 0);
  if (max <= 0) return <p className="text-sm text-slate-400">Nothing in this period.</p>;
  const two = series.length > 1;
  return (
    <div>
      {two && (
        <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} />
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="relative flex items-end gap-2" style={{ height }}>
        {items.map((it, idx) => (
          <div key={it.label + idx} className="relative flex h-full flex-1 items-end justify-center gap-[3px]" onMouseEnter={() => setHover(idx)} onMouseLeave={() => setHover(null)}>
            {[it.a, it.b].map((v, k) =>
              v === undefined ? null : (
                <div key={k} className="w-full max-w-[26px] rounded-t-[4px] transition-all duration-500" style={{ height: `${Math.max(1.5, (v / max) * 100)}%`, background: SERIES[k], opacity: hover === null || hover === idx ? 1 : 0.45 }} />
              )
            )}
            {hover === idx && (
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg">
                <div className="font-semibold">{it.label}</div>
                {series.map((s, i) => (
                  <div key={s}>
                    {two ? `${s}: ` : ""}
                    {fmtMoney(i === 0 ? it.a : it.b || 0, currency)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {items.map((it, i) => (
          <div key={it.label + i} className="flex-1 text-center text-xs text-slate-500 truncate">
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 ${right ? "text-right" : "text-left"}`}>{children}</th>
);
export const Td = ({ children, right, strong, className = "" }: { children?: React.ReactNode; right?: boolean; strong?: boolean; className?: string }) => (
  <td className={`px-3 py-2.5 text-sm tabular-nums ${right ? "text-right" : ""} ${strong ? "font-semibold text-slate-900" : "text-slate-700"} ${className}`}>{children}</td>
);
export const TableWrap = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto -mx-5 px-5">
    <table className="w-full min-w-[520px]">{children}</table>
  </div>
);
