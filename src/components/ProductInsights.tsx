"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { currencyFor, decimalsFor } from "@/lib/currency";

/* ------------------------------------------------------------------ types */

interface MonthRow {
  month: string;
  label: string;
  units: number;
  free: number;
  value: number;
  invoices: number;
  avgPrice: number | null;
}

interface Insights {
  country: string;
  office: boolean;
  today: string;
  price: { list: number; cost: number | null; average: number | null; marginPct: number | null };
  totals: {
    value12: number;
    valuePrev12: number;
    units12: number;
    free12: number;
    invoices12: number;
    customers12: number;
    repeatCustomers: number;
    lastSale: string | null;
    lifetimeUnits: number;
  };
  stock: { onHand: number; unitsLast90: number; daysOfStock: number | null };
  months: MonthRow[];
  customers: { id: string; name: string; units: number; value: number; invoices: number; lastDate: string }[];
  salesmen: { name: string; units: number; value: number }[] | null;
  recent: { date: string; invoiceNumber: string; customer: string; qty: number; unitPrice: number; value: number }[];
}

/* Validated categorical palette (light): slots 1-5 in fixed order; "Other" is neutral. */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER = "#c9ccd3";
const GRID = "#e6e8ec";
const INK_MUTED = "#64748b";

function shortDate(day?: string | null) {
  if (!day) return "—";
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Round an axis maximum up to a friendly number. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * p;
}

/* ------------------------------------------------------------------ main */

export function ProductInsights({ productId }: { productId: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/products/${productId}/insights`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load sales figures");
        if (alive) setData(json);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [productId]);

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  return <InsightsView data={data} />;
}

function InsightsView({ data }: { data: Insights }) {
  const cur = currencyFor(data.country);
  const dp = decimalsFor(data.country);
  const money = (n: number) => `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const moneyShort = (n: number) =>
    n >= 1000 ? `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : n.toLocaleString("en-US", { maximumFractionDigits: dp });

  const t = data.totals;
  const change = t.valuePrev12 > 0 ? ((t.value12 - t.valuePrev12) / t.valuePrev12) * 100 : null;
  const priceGap = data.price.average !== null && data.price.list > 0 ? ((data.price.average - data.price.list) / data.price.list) * 100 : null;

  // Pie slices: top 4 + Other.
  const customerSlices = useMemo(() => toSlices(data.customers.map((c) => ({ label: c.name, value: c.value }))), [data.customers]);
  const salesmanSlices = useMemo(
    () => (data.salesmen ? toSlices(data.salesmen.map((s) => ({ label: s.name, value: s.value }))) : []),
    [data.salesmen]
  );

  const noSales = t.units12 === 0;

  return (
    <div className="space-y-5">
      {/* Key figures */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Figure
          label="Sales, last 12 months"
          value={money(t.value12)}
          note={change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(0)}% vs the 12 months before` : "No sales the year before"}
        />
        <Figure
          label="Units sold"
          value={t.units12.toLocaleString("en-US")}
          note={`${t.invoices12} invoices${t.free12 > 0 ? ` · ${t.free12} free` : ""}`}
        />
        <Figure
          label="Average price charged"
          value={data.price.average !== null ? money(data.price.average) : "—"}
          note={
            priceGap !== null
              ? `${Math.abs(priceGap) < 0.5 ? "At" : priceGap > 0 ? `${priceGap.toFixed(0)}% above` : `${Math.abs(priceGap).toFixed(0)}% below`} list ${money(data.price.list)}`
              : data.price.list > 0
              ? `List ${money(data.price.list)}`
              : "No list price set"
          }
        />
        {data.office ? (
          <Figure
            label="Gross margin"
            value={data.price.marginPct !== null ? `${data.price.marginPct.toFixed(0)}%` : "—"}
            note={data.price.cost ? `Cost ${money(data.price.cost)}` : "No cost price set"}
          />
        ) : (
          <Figure label="Customers" value={String(t.customers12)} note={`${t.repeatCustomers} bought more than once`} />
        )}
        <Figure
          label="Stock on hand"
          value={data.stock.onHand.toLocaleString("en-US")}
          note={
            data.stock.daysOfStock !== null
              ? `About ${data.stock.daysOfStock} days at the last 90 days' pace`
              : data.stock.onHand > 0
              ? "Not sold in the last 90 days"
              : "Out of stock"
          }
          tone={data.stock.onHand <= 0 ? "bad" : data.stock.daysOfStock !== null && data.stock.daysOfStock < 30 ? "warn" : undefined}
        />
      </div>

      {noSales ? (
        <Card title="Sales">
          <p className="py-8 text-center text-sm font-semibold text-slate-400">
            No sales in the last 12 months{t.lastSale ? ` (last sold ${shortDate(t.lastSale)})` : ""}.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Sales by month" note="Value of invoices each month · hover for units and invoices">
            <MonthlyBars months={data.months} money={money} moneyShort={moneyShort} />
          </Card>

          <div className={`grid grid-cols-1 gap-5 ${data.office ? "lg:grid-cols-2" : ""}`}>
            <Card title="Who buys it" note={`${t.customers12} customers · last 12 months`}>
              <Donut slices={customerSlices} money={money} centerLabel="Customers" centerValue={String(t.customers12)} />
            </Card>
            {data.office && (
              <Card title="Who sells it" note="By salesman · last 12 months">
                <Donut slices={salesmanSlices} money={money} centerLabel="Salesmen" centerValue={String(data.salesmen?.length || 0)} />
              </Card>
            )}
          </div>

          <Card title="Price charged vs list price" note="Average price per unit each month (free units excluded)">
            <PriceLine months={data.months} list={data.price.list} cost={data.price.cost} money={money} />
          </Card>
        </>
      )}

      {/* Tables */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Customers" note="Last 12 months, by value">
          {data.customers.length === 0 ? (
            <Empty>No customers in the last 12 months.</Empty>
          ) : (
            <Table
              head={["Customer", "Units", "Value", "Share", "Last bought"]}
              numeric={[1, 2, 3]}
              rows={data.customers.map((c) => [
                c.id ? (
                  <Link key="n" href={`/customers/${c.id}`} className="font-bold text-slate-800 hover:text-accent hover:underline">
                    {c.name}
                  </Link>
                ) : (
                  c.name
                ),
                c.units.toLocaleString("en-US"),
                money(c.value),
                t.value12 > 0 ? `${((c.value / t.value12) * 100).toFixed(0)}%` : "—",
                shortDate(c.lastDate),
              ])}
            />
          )}
        </Card>

        <Card title="Latest sales" note="Most recent invoices with this product">
          {data.recent.length === 0 ? (
            <Empty>No sales yet.</Empty>
          ) : (
            <Table
              head={["Date", "Invoice", "Customer", "Qty", "Price", "Total"]}
              numeric={[3, 4, 5]}
              rows={data.recent.map((r) => [
                shortDate(r.date),
                r.invoiceNumber,
                r.customer,
                r.qty.toLocaleString("en-US"),
                r.value === 0 ? "Free" : money(r.unitPrice),
                money(r.value),
              ])}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1.5 text-xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}</div>
      {note && (
        <div
          className={`mt-1 text-xs font-semibold ${
            tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-500"
          }`}
        >
          {tone && (
            <span aria-hidden className="me-1">
              {tone === "bad" ? "●" : "▲"}
            </span>
          )}
          {note}
        </div>
      )}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
      <div className="mb-4">
        <h3 className="text-sm font-extrabold text-[#1B2A4A]">{title}</h3>
        {note && <p className="text-xs font-semibold text-slate-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm font-semibold text-slate-400">{children}</p>;
}

function Table({ head, rows, numeric }: { head: string[]; rows: React.ReactNode[][]; numeric: number[] }) {
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pe-3 ${numeric.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`py-2 pe-3 ${numeric.includes(j) ? "text-right tabular-nums font-semibold text-slate-800" : j === 0 ? "text-slate-700" : "text-slate-600"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Monthly bars: one series, value on a single axis; tooltip shows units and invoices. */
function MonthlyBars({
  months,
  money,
  moneyShort,
}: {
  months: MonthRow[];
  money: (n: number) => string;
  moneyShort: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 240;
  const pad = { l: 44, r: 8, t: 12, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = niceMax(Math.max(...months.map((m) => m.value)));
  const slot = innerW / months.length;
  const barW = Math.min(36, slot - 6);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const best = months.reduce((b, m, i) => (m.value > months[b].value ? i : b), 0);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales value by month">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(tk) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>
              {moneyShort(tk)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = pad.l + i * slot + (slot - barW) / 2;
          const h = Math.max(0, pad.t + innerH - y(m.value));
          const r = Math.min(4, h / 2);
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* larger invisible hit area */}
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + innerH} V${y(m.value) + r} Q${x},${y(m.value)} ${x + r},${y(m.value)} H${x + barW - r} Q${x + barW},${y(m.value)} ${x + barW},${y(m.value) + r} V${pad.t + innerH} Z`}
                  fill={SERIES[0]}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                {m.label}
              </text>
              {i === best && m.value > 0 && hover === null && (
                <text x={x + barW / 2} y={y(m.value) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f172a">
                  {moneyShort(m.value)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%` }}
        >
          <div className="font-extrabold text-slate-900">{months[hover].label}</div>
          <div className="tabular-nums text-slate-700">{money(months[hover].value)}</div>
          <div className="text-slate-500">
            {months[hover].units} units{months[hover].free > 0 ? ` (${months[hover].free} free)` : ""} · {months[hover].invoices} invoices
          </div>
        </div>
      )}
    </div>
  );
}

interface Slice {
  label: string;
  value: number;
  color: string;
}

function toSlices(items: { label: string; value: number }[]): Slice[] {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const top = positive.slice(0, 4).map((i, idx) => ({ ...i, color: SERIES[idx] }));
  const rest = positive.slice(4).reduce((t, i) => t + i.value, 0);
  return rest > 0 ? [...top, { label: `Others (${positive.length - 4})`, value: rest, color: OTHER }] : top;
}

/* Donut (pie) with a 2px surface gap between slices and a legend carrying value and share. */
function Donut({
  slices,
  money,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  money: (n: number) => string;
  centerLabel: string;
  centerValue: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((t, s) => t + s.value, 0);
  if (total <= 0) return <Empty>No paid sales in this period.</Empty>;

  const size = 200;
  const c = size / 2;
  const outer = 92;
  const inner = 58;
  let angle = -Math.PI / 2;

  const arcs = slices.map((s) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    const full = sweep >= Math.PI * 2 - 1e-6;
    const d = full
      ? `M${c - outer},${c} a${outer},${outer} 0 1,0 ${outer * 2},0 a${outer},${outer} 0 1,0 ${-outer * 2},0 M${c - inner},${c} a${inner},${inner} 0 1,1 ${inner * 2},0 a${inner},${inner} 0 1,1 ${-inner * 2},0 Z`
      : `M${p(outer, a0)} A${outer},${outer} 0 ${large} 1 ${p(outer, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
    return { ...s, d, pct: (s.value / total) * 100 };
  });

  const active = hover !== null ? arcs[hover] : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 shrink-0" role="img" aria-label="Share of sales">
        {arcs.map((a, i) => (
          <path
            key={a.label}
            d={a.d}
            fill={a.color}
            stroke="#ffffff"
            strokeWidth={2}
            fillRule="evenodd"
            opacity={hover === null || hover === i ? 1 : 0.4}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={c} y={c - 4} textAnchor="middle" fontSize={22} fontWeight={800} fill="#0f172a">
          {active ? `${active.pct.toFixed(0)}%` : centerValue}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
          {active ? "of sales" : centerLabel}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {arcs.map((a, i) => (
          <li
            key={a.label}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1 text-sm ${hover === i ? "bg-slate-50" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: a.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={a.label}>
              {a.label}
            </span>
            <span className="tabular-nums font-bold text-slate-900">{money(a.value)}</span>
            <span className="w-10 text-right tabular-nums text-xs font-semibold text-slate-500">{a.pct.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Price line: average price charged per month, with list price (and cost, office) as reference lines. */
function PriceLine({
  months,
  list,
  cost,
  money,
}: {
  months: MonthRow[];
  list: number;
  cost: number | null;
  money: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = months.map((m, i) => ({ i, v: m.avgPrice }));
  const values = points.filter((p) => p.v !== null).map((p) => p.v as number);
  if (values.length === 0) return <Empty>No paid sales in this period.</Empty>;

  const W = 720;
  const H = 200;
  const pad = { l: 52, r: 70, t: 14, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const refs = [list, cost || 0].filter((v) => v > 0);
  const hi = Math.max(...values, ...refs);
  const lo = Math.min(...values, ...refs);
  const span = Math.max(hi - lo, hi * 0.2, 1);
  const top = hi + span * 0.15;
  const bottom = Math.max(0, lo - span * 0.25);
  const x = (i: number) => pad.l + (innerW * i) / Math.max(1, months.length - 1);
  const y = (v: number) => pad.t + innerH - ((v - bottom) / (top - bottom)) * innerH;

  // Line segments between consecutive months with sales.
  const segments: string[] = [];
  let current = "";
  points.forEach((p) => {
    if (p.v === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(p.i)},${y(p.v)} `;
  });
  if (current) segments.push(current);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Average price charged by month">
        {[bottom, (bottom + top) / 2, top].map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(tk) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>
              {tk.toFixed(tk < 10 ? 2 : 0)}
            </text>
          </g>
        ))}
        {list > 0 && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(list)} y2={y(list)} stroke="#475569" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={W - pad.r + 6} y={y(list) + 4} fontSize={11} fontWeight={700} fill="#334155">
              List
            </text>
          </g>
        )}
        {cost !== null && cost > 0 && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(cost)} y2={y(cost)} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="2 4" />
            <text x={W - pad.r + 6} y={y(cost) + 4} fontSize={11} fontWeight={700} fill="#64748b">
              Cost
            </text>
          </g>
        )}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p) =>
          p.v === null ? null : (
            <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={hover === p.i ? 5.5 : 4} fill={SERIES[0]} stroke="#ffffff" strokeWidth={2} />
          )
        )}
        {months.map((m, i) => (
          <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - innerW / months.length / 2} y={pad.t} width={innerW / months.length} height={innerH} fill="transparent" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
              {m.label}
            </text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH} stroke="#cbd5e1" strokeWidth={1} />}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="font-extrabold text-slate-900">{months[hover].label}</div>
          {months[hover].avgPrice !== null ? (
            <>
              <div className="tabular-nums text-slate-700">Average {money(months[hover].avgPrice as number)}</div>
              {list > 0 && <div className="tabular-nums text-slate-500">List {money(list)}</div>}
            </>
          ) : (
            <div className="text-slate-500">No paid sales</div>
          )}
        </div>
      )}
    </div>
  );
}
