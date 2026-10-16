"use client";

import React, { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * Small hand-drawn chart kit for the performance report. Categorical colours
 * in a fixed order (never cycled), thin marks, values and percentages written
 * next to every mark so nothing relies on colour alone.
 */

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const OTHER = "#c9ccd3";

export const fmtMoney = (n: number, currency: string, dp = 0) =>
  `${currency} ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined || !isFinite(n) ? "—" : `${Math.round(n)}%`);

/** Up / down change against the previous period, with an arrow and words. */
export function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (!(prev > 0)) return <span className="text-xs text-slate-400">no earlier figure</span>;
  const ch = ((now - prev) / prev) * 100;
  const up = ch > 0.5;
  const down = ch < -0.5;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? "text-emerald-700" : bad ? "text-rose-700" : "text-slate-500"}`}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(Math.round(ch))}% {up ? "up" : down ? "down" : "flat"}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  delta,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  delay?: number;
}) {
  return (
    <div className="wiz-in bg-white border border-slate-200 rounded-xl p-4 md:p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl md:text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta}
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

/** A 100% stacked bar with a legend that carries values and percentages. */
export function ShareBar({
  parts,
  currency,
  dp = 0,
  showMoney = true,
  colors,
}: {
  parts: { label: string; value: number; note?: string }[];
  currency: string;
  dp?: number;
  showMoney?: boolean;
  colors?: string[];
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const palette = colors || SERIES;
  if (total <= 0) return <p className="text-sm text-slate-400">Nothing in this period.</p>;
  return (
    <div>
      <div className="flex h-3.5 rounded-full overflow-hidden bg-slate-100 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${fmtPct((p.value / total) * 100)}`).join(", ")}>
        {parts.map((p, i) =>
          p.value > 0 ? (
            <div
              key={p.label}
              className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(p.value / total) * 100}%`, background: palette[i % palette.length] }}
              title={`${p.label}: ${showMoney ? fmtMoney(p.value, currency, dp) : p.value} (${fmtPct((p.value / total) * 100)})`}
            />
          ) : null
        )}
      </div>
      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        {parts.map((p, i) => (
          <li key={p.label} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
            <span className="flex items-start gap-2.5 min-w-0 flex-1 basis-44">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1.5" style={{ background: palette[i % palette.length] }} />
              <span className="min-w-0">
                <span className="block text-slate-800 leading-snug break-words">{p.label}</span>
                {p.note && <span className="block text-[11px] text-slate-500">{p.note}</span>}
              </span>
            </span>
            <span className="ml-auto flex items-baseline gap-3 whitespace-nowrap tabular-nums pl-5">
              <span className="font-semibold text-slate-900 w-11 text-right">{fmtPct((p.value / total) * 100)}</span>
              <span className="text-slate-500 text-right min-w-[5.5rem]">{showMoney ? fmtMoney(p.value, currency, dp) : p.value.toLocaleString("en-US")}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars: label, bar, value and share. */
export function RankBars({
  rows,
  currency,
  dp = 0,
  color = SERIES[0],
  valueLabel,
  max = 8,
}: {
  rows: { label: string; value: number; sub?: string; key?: string }[];
  currency?: string;
  dp?: number;
  color?: string;
  valueLabel?: (v: number) => string;
  max?: number;
}) {
  const shown = rows.slice(0, max);
  const top = Math.max(...shown.map((r) => r.value), 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (shown.length === 0 || top <= 0) return <p className="text-sm text-slate-400">Nothing in this period.</p>;
  return (
    <ul className="space-y-2.5">
      {shown.map((r, i) => (
        <li key={r.key || r.label} className="wiz-in" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
            <span className="text-slate-800 leading-snug break-words min-w-0 flex-1 basis-40">{r.label}</span>
            <span className="whitespace-nowrap tabular-nums ml-auto">
              <span className="font-semibold text-slate-900">{valueLabel ? valueLabel(r.value) : currency ? fmtMoney(r.value, currency, dp) : r.value.toLocaleString("en-US")}</span>
              {total > 0 && <span className="text-slate-500"> · {fmtPct((r.value / total) * 100)}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: color }} />
          </div>
          {r.sub && <div className="text-[11px] text-slate-500 mt-0.5">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Sales per day: bars on one axis with a hover tooltip. */
export function DayBars({ days, currency }: { days: { day: string; label: string; value: number; invoices: number }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const padL = 44;
  const padB = 24;
  const padT = 12;
  const max = Math.max(...days.map((d) => d.value), 0);
  const nice = max <= 0 ? 1 : Math.pow(10, Math.floor(Math.log10(max))) * Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max))));
  const bw = (W - padL - 8) / Math.max(days.length, 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const short = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sales per day">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(nice * t)} y2={y(nice * t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL - 6} y={y(nice * t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {short(nice * t)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = padL + i * bw + 1;
          const bh = H - padB - y(d.value);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              {d.value > 0 && (
                <path
                  d={`M${x},${H - padB} v${-Math.max(bh - 3, 0)} q0,-3 3,-3 h${Math.max(bw - 8, 1)} q3,0 3,3 v${Math.max(bh - 3, 0)} z`}
                  fill={hover === i ? "#1d5fae" : SERIES[0]}
                  className="transition-colors"
                />
              )}
              {(days.length <= 16 || i % Math.ceil(days.length / 16) === 0) && (
                <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
                  {d.label.split(" ")[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="absolute top-0 right-0 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          <div className="font-semibold">{h.label}</div>
          <div>{fmtMoney(h.value, currency)}</div>
          <div className="text-white/70">{h.invoices} invoices</div>
        </div>
      )}
    </div>
  );
}

/** Donut with the total in the middle; legend is drawn by the caller (ShareBar style list). */
export function Donut({ parts, centerTop, centerBottom }: { parts: { label: string; value: number }[]; centerTop: string; centerBottom?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label={parts.map((p) => `${p.label} ${fmtPct(total ? (p.value / total) * 100 : 0)}`).join(", ")}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {total > 0 &&
        parts.map((p, i) => {
          const len = (p.value / total) * C;
          const gap = parts.filter((q) => q.value > 0).length > 1 ? 2 : 0;
          const el = (
            <circle
              key={p.label}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={i < SERIES.length ? SERIES[i] : OTHER}
              strokeWidth="16"
              strokeDasharray={`${Math.max(len - gap, 0)} ${C}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 70 70)"
              className="transition-all duration-700"
            />
          );
          acc += len;
          return el;
        })}
      <text x="70" y={centerBottom ? 68 : 74} textAnchor="middle" fontSize="15" fontWeight="600" fill="#0f172a">
        {centerTop}
      </text>
      {centerBottom && (
        <text x="70" y="86" textAnchor="middle" fontSize="9" fill="#64748b">
          {centerBottom}
        </text>
      )}
    </svg>
  );
}

/** A rate on a track with its verdict in words. */
export function Meter({ label, value, good, warn, invert = false, note }: { label: string; value: number | null; good: number; warn: number; invert?: boolean; note?: string }) {
  const v = value === null || !isFinite(value) ? null : Math.max(0, value);
  const ok = v === null ? null : invert ? v <= good : v >= good;
  const mid = v === null ? null : invert ? v <= warn : v >= warn;
  const tone = v === null ? "text-slate-400" : ok ? "text-emerald-700" : mid ? "text-amber-700" : "text-rose-700";
  const bar = v === null ? "#cbd5e1" : ok ? "#1baf7a" : mid ? "#eda100" : "#e2475f";
  const word = v === null ? "no data" : ok ? "good" : mid ? "watch" : "poor";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className={`font-semibold tabular-nums ${tone}`}>
          {fmtPct(v)} <span className="text-xs font-normal">· {word}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, v || 0)}%`, background: bar }} />
      </div>
      {note && <div className="text-[11px] text-slate-500 mt-1">{note}</div>}
    </div>
  );
}
