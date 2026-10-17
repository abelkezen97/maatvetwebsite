"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Info,
  Lightbulb,
  Package,
  Percent,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { PerformanceReport, PerfPeriodKind, Tone } from "@/lib/performance/types";
import { DayBars, Delta, Donut, KpiTile, Meter, OTHER, RankBars, SERIES, ShareBar, fmtMoney, fmtPct } from "@/components/charts/PerfCharts";

const TONE: Record<Tone, { icon: any; box: string; iconCls: string; word: string }> = {
  good: { icon: CheckCircle2, box: "border-emerald-200 bg-emerald-50/50", iconCls: "text-emerald-600", word: "Good" },
  warn: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50/50", iconCls: "text-amber-600", word: "Watch" },
  bad: { icon: XCircle, box: "border-rose-200 bg-rose-50/50", iconCls: "text-rose-600", word: "Act" },
  info: { icon: Info, box: "border-slate-200 bg-white", iconCls: "text-slate-500", word: "Note" },
};

function todayGulf() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
}

function Section({ icon: Icon, title, subtitle, children, delay = 0 }: { icon: any; title: string; subtitle?: string; children: React.ReactNode; delay?: number }) {
  return (
    <section className="wiz-in bg-white border border-slate-200 rounded-2xl shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <header className="flex items-center gap-3 px-5 md:px-7 pt-5 pb-4 border-b border-slate-100">
        <span className="w-10 h-10 rounded-xl bg-accent-light text-accent grid place-items-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-base md:text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </header>
      <div className="px-5 md:px-7 py-5 md:py-6">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function PerformancePage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth() as any;
  const isAdmin = profile?.role === "super_admin";

  const [kind, setKind] = useState<PerfPeriodKind>("month");
  const [date, setDate] = useState(todayGulf());
  const [salesman, setSalesman] = useState("");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && profile && !isAdmin) router.replace("/dashboard");
  }, [authLoading, profile, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ period: kind, date });
    if (salesman) q.set("salesman", salesman);
    fetch(`/api/performance?${q.toString()}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load the report");
        return d;
      })
      .then((d) => {
        if (cancelled) return;
        setReport(d);
        // Default to the only salesman when there is just one.
        if (!salesman && d.salesmen?.length === 1) setSalesman(d.salesmen[0].id);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, date, salesman, isAdmin]);

  const r = report;
  const cur = r?.currency || "AED";
  const m = (n: number) => fmtMoney(n, cur);
  const month = date.slice(0, 7);
  const half = Number(date.slice(8, 10)) <= 15 ? 1 : 2;

  const downloadPdf = async () => {
    if (!r) return;
    setPdfBusy(true);
    try {
      const { buildPerformancePDF } = await import("@/lib/pdfPerformanceHelper");
      const doc = buildPerformancePDF(r, profile?.full_name || "");
      const who = (r.salesman.name || "All").replace(/[^A-Za-z0-9]+/g, "-");
      doc.save(`MAAT-PERFORMANCE-${who}-${r.period.from}${r.period.to !== r.period.from ? `_${r.period.to}` : ""}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  const pricingParts = useMemo(() => {
    if (!r) return [];
    return [
      { label: "At list price", value: r.pricing.atList.value, note: `${r.pricing.atList.lines} lines` },
      { label: "Below list (discount)", value: r.pricing.below.value, note: `${r.pricing.below.lines} lines · ${m(r.pricing.below.given)} given` },
      { label: "Above list", value: r.pricing.above.value, note: `${r.pricing.above.lines} lines · ${m(r.pricing.above.earned)} extra` },
      { label: "FOC (at list value)", value: r.pricing.foc.listValue, note: `${r.pricing.foc.units} units` },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  if (!authLoading && profile && !isAdmin) return null;

  return (
    <div className="w-full">
      <PageHeader title="Salesman performance" breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Performance" }]} />

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6 text-start">
        {/* Controls */}
        <div className="wiz-in flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4 bg-white border border-slate-200 rounded-2xl p-4">
          <div>
            <span className="block text-xs text-slate-500 mb-1.5">Report</span>
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden" role="radiogroup" aria-label="Report period">
              {([
                ["day", "Daily"],
                ["half", "Half-monthly"],
                ["month", "Monthly"],
              ] as const).map(([k, l], i) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`h-10 px-4 text-sm transition-colors ${i > 0 ? "border-l border-slate-300" : ""} ${kind === k ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {kind === "day" && (
              <label className="block">
                <span className="block text-xs text-slate-500 mb-1.5">Day</span>
                <input type="date" value={date} max={todayGulf()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </label>
            )}
            {kind !== "day" && (
              <label className="block">
                <span className="block text-xs text-slate-500 mb-1.5">Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setDate(`${e.target.value}-${kind === "half" && half === 2 ? "16" : "01"}`)}
                  className="h-10 px-3 border border-slate-300 rounded-lg text-sm"
                />
              </label>
            )}
            {kind === "half" && (
              <div>
                <span className="block text-xs text-slate-500 mb-1.5">Half</span>
                <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
                  {[1, 2].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDate(`${month}-${h === 1 ? "01" : "16"}`)}
                      className={`h-10 px-4 text-sm ${h === 2 ? "border-l border-slate-300" : ""} ${half === h ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {h === 1 ? "1st–15th" : "16th–end"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="block">
              <span className="block text-xs text-slate-500 mb-1.5">Salesman</span>
              <select value={salesman} onChange={(e) => setSalesman(e.target.value)} className="h-10 px-3 pr-8 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="">All salesmen</option>
                {(r?.salesmen || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={downloadPdf}
            disabled={!r || loading || pdfBusy}
            className="lg:ml-auto h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> {pdfBusy ? "Preparing…" : "Download PDF"}
          </button>
        </div>

        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">{error}</div>}

        {loading && !r && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {r && (
          <div className={`space-y-6 transition-opacity ${loading ? "opacity-50" : ""}`} key={`${r.period.from}-${r.salesman.id}`}>
            {/* Title */}
            <div className="wiz-in">
              <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
                {r.salesman.name} · {r.period.label}
              </h1>
              <p className="text-sm text-slate-500">
                Compared with {r.period.prevLabel}
                {r.period.to > r.today ? ` · period still running, ${r.period.daysElapsed} working days so far` : ""}
              </p>
            </div>

            {/* Headline */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiTile label="Sales" value={m(r.sales.value)} delta={<Delta now={r.sales.value} prev={r.sales.prevValue} />} sub={`${r.sales.invoices} invoices`} />
              <KpiTile label="Collected" value={m(r.collections.total)} delta={<Delta now={r.collections.total} prev={r.collections.prevTotal} />} sub={`${fmtPct(r.efficiency.collectionRate)} of sales`} delay={60} />
              <KpiTile label="Expenses" value={m(r.expenses.total)} delta={<Delta now={r.expenses.total} prev={r.expenses.prevTotal} invert />} sub={`${fmtPct(r.expenses.ratioToSales)} of sales`} delay={120} />
              <KpiTile label="Overdue today" value={m(r.outstanding.overdue)} sub={`${r.outstanding.overdueInvoices} invoices · ${m(r.outstanding.total)} unpaid in all`} delay={180} />
            </div>

            {/* Insights */}
            <Section icon={Lightbulb} title="What stands out" subtitle="Worked out from the figures below">
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {r.insights.map((ins, i) => {
                  const t = TONE[ins.tone];
                  const Icon = t.icon;
                  return (
                    <li key={i} className={`wiz-in flex gap-3 rounded-xl border p-4 ${t.box}`} style={{ animationDelay: `${i * 50}ms` }}>
                      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${t.iconCls}`} aria-label={t.word} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{ins.title}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{ins.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>

            {/* Sales */}
            <Section icon={TrendingUp} title="Sales" subtitle={`${r.sales.invoices} invoices · ${r.sales.units.toLocaleString()} units · ${r.sales.customers} customers (${r.sales.newCustomers} new)`}>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
                <div className="space-y-6 min-w-0">
                  {r.period.kind !== "day" ? (
                    <Sub title="Sales per day">
                      <DayBars days={r.sales.byDay} currency={cur} />
                    </Sub>
                  ) : (
                    <Sub title="Invoices of the day">
                      {r.sales.invoiceList.length === 0 ? (
                        <p className="text-sm text-slate-400">No invoices on this day.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-slate-500 border-b border-slate-100">
                              <th className="text-left font-medium pb-2">Invoice</th>
                              <th className="text-left font-medium pb-2">Customer</th>
                              <th className="text-left font-medium pb-2">Status</th>
                              <th className="text-right font-medium pb-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {r.sales.invoiceList.map((iv) => (
                              <tr key={iv.number}>
                                <td className="py-2 font-medium text-slate-900">{iv.number}</td>
                                <td className="py-2 text-slate-700">{iv.customer}</td>
                                <td className="py-2 text-slate-500">{iv.status}</td>
                                <td className="py-2 text-right tabular-nums">{m(iv.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </Sub>
                  )}
                  <Sub title="Top customers">
                    <RankBars
                      rows={r.sales.topCustomers.map((c) => ({ label: c.isNew ? `${c.name} · new` : c.name, value: c.value, sub: `${c.invoices} invoices` }))}
                      currency={cur}
                    />
                  </Sub>
                </div>
                <div className="space-y-6">
                  <Sub title="Paid at sale vs on credit">
                    <ShareBar
                      parts={[
                        { label: "Paid at sale", value: r.sales.paidAtSale },
                        { label: "On credit", value: r.sales.onCredit },
                      ]}
                      currency={cur}
                    />
                  </Sub>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Average invoice</dt>
                      <dd className="font-semibold text-slate-900">{m(r.sales.avgInvoice)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Selling days</dt>
                      <dd className="font-semibold text-slate-900">
                        {r.sales.activeDays}
                        {r.period.kind !== "day" && <span className="font-normal text-slate-500"> of {r.period.daysElapsed} working days</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Per selling day</dt>
                      <dd className="font-semibold text-slate-900">{m(r.efficiency.salesPerActiveDay)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">New customers</dt>
                      <dd className="font-semibold text-slate-900">{r.sales.newCustomers}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </Section>

            {/* Collections */}
            <Section icon={Wallet} title="Collections" subtitle={`${m(r.collections.total)} from ${r.collections.receipts} receipts, by payment date`}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <Sub title="On time or late">
                    <ShareBar
                      parts={[
                        { label: "On time (by due date)", value: r.collections.onTime },
                        { label: "Late (after due date)", value: r.collections.late },
                        { label: "Advance (not on an invoice)", value: r.collections.advance },
                        { label: "Cheques not cleared", value: r.collections.chequesPending },
                      ]}
                      currency={cur}
                      colors={[SERIES[2], SERIES[1], SERIES[0], SERIES[3]]}
                    />
                  </Sub>
                  <Sub title="How late were the late ones">
                    <RankBars rows={r.collections.lateBuckets.map((b) => ({ label: b.label, value: b.value }))} currency={cur} color={SERIES[1]} />
                  </Sub>
                </div>
                <div className="space-y-6">
                  <Meter
                    label={`Collected within 100 days (commission)`}
                    value={r.efficiency.within100Rate}
                    good={90}
                    warn={70}
                    note={`${m(r.collections.within100)} within, ${m(r.collections.after100)} after`}
                  />
                  <Meter label="Collected vs sold" value={r.efficiency.collectionRate} good={90} warn={60} note={`${m(r.collections.total)} collected · ${m(r.sales.value)} sold`} />
                  <Sub title="By payment method">
                    <ShareBar parts={r.collections.byMethod.map((x) => ({ label: x.label, value: x.value }))} currency={cur} />
                  </Sub>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-500">Unpaid today</div>
                      <div className="font-semibold text-slate-900">{m(r.outstanding.total)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Of which overdue</div>
                      <div className="font-semibold text-rose-700">{m(r.outstanding.overdue)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Past 100 days</div>
                      <div className="font-semibold text-slate-900">{m(r.outstanding.over100)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Oldest unpaid</div>
                      <div className="font-semibold text-slate-900">{r.outstanding.oldestDays} days</div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Products */}
            <Section icon={Package} title="Companies and products" subtitle={`${r.products.companies.length} companies · ${r.products.productsSold} products sold`}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Sub title="Sales by company (tap one to see its products)">
                  {r.products.companies.length === 0 ? (
                    <p className="text-sm text-slate-400">Nothing sold in this period.</p>
                  ) : (
                    <ul className="space-y-2">
                      {r.products.companies.map((c, i) => {
                        const open = openCompany === c.name;
                        const top = r.products.companies[0].value || 1;
                        return (
                          <li key={c.name} className="wiz-in" style={{ animationDelay: `${i * 40}ms` }}>
                            <button type="button" onClick={() => setOpenCompany(open ? null : c.name)} className="w-full text-left group">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                                <span className="flex items-start gap-1.5 text-slate-800 leading-snug break-words min-w-0 flex-1 basis-40">
                                  <ChevronDown className={`w-4 h-4 mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                                  <span className="min-w-0 break-words">{c.name}</span>
                                </span>
                                <span className="whitespace-nowrap tabular-nums ml-auto pl-5 sm:pl-0">
                                  <span className="font-semibold text-slate-900">{fmtPct(c.share)}</span>
                                  <span className="text-slate-500"> · {m(c.value)} · {c.units} units</span>
                                </span>
                              </div>
                              <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (c.value / top) * 100)}%`, background: i < SERIES.length ? SERIES[i] : OTHER }} />
                              </div>
                            </button>
                            {open && (
                              <ul className="wiz-in mt-2 ml-6 pl-3 border-l-2 border-slate-100 space-y-1.5">
                                {c.products.map((p) => (
                                  <li key={p.name} className="flex items-start justify-between gap-3 text-xs">
                                    <span className="text-slate-700 leading-snug break-words min-w-0">{p.name}</span>
                                    <span className="text-slate-500 whitespace-nowrap tabular-nums">
                                      {p.units} units · {m(p.value)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Sub>
                <Sub title="Products that moved most (by units)">
                  <RankBars
                    rows={r.products.topProducts.map((p) => ({ label: p.name, value: p.units, sub: `${p.company} · ${m(p.value)}`, key: p.name }))}
                    valueLabel={(v) => `${v} units`}
                    color={SERIES[2]}
                    max={10}
                  />
                </Sub>
              </div>
            </Section>

            {/* Pricing */}
            <Section icon={Percent} title="Price discipline" subtitle="Each line compared with the product's list price">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <Sub title="Sales by price charged">
                    <ShareBar parts={pricingParts} currency={cur} colors={[SERIES[0], SERIES[1], SERIES[2], SERIES[3]]} />
                  </Sub>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <dt className="text-xs text-slate-500">Discount given</dt>
                      <dd className="font-semibold text-slate-900">{m(r.pricing.below.given)}</dd>
                      <dd className="text-xs text-slate-500">{fmtPct(r.efficiency.discountRate)} of list value</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <dt className="text-xs text-slate-500">FOC given</dt>
                      <dd className="font-semibold text-slate-900">
                        {r.pricing.foc.units} units · {m(r.pricing.foc.listValue)}
                      </dd>
                      <dd className="text-xs text-slate-500">{fmtPct(r.efficiency.focRate)} of list value</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <dt className="text-xs text-slate-500">Earned above list</dt>
                      <dd className="font-semibold text-slate-900">{m(r.pricing.above.earned)}</dd>
                      <dd className="text-xs text-slate-500">{r.pricing.above.lines} lines</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <dt className="text-xs text-slate-500">Gross margin over cost</dt>
                      <dd className="font-semibold text-slate-900">{r.pricing.grossMargin === null ? "—" : m(r.pricing.grossMargin)}</dd>
                      <dd className="text-xs text-slate-500">{r.pricing.grossMarginPct === null ? "no cost prices" : `${fmtPct(r.pricing.grossMarginPct)} of sales`}</dd>
                    </div>
                  </dl>
                </div>
                <div className="space-y-6">
                  <Sub title="Most discounted products">
                    <RankBars rows={r.pricing.topDiscounted.map((p) => ({ label: p.name, value: p.given, sub: `${p.units} units sold below list` }))} currency={cur} color={SERIES[1]} />
                  </Sub>
                  <Sub title="Most given free (FOC)">
                    <RankBars rows={r.pricing.topFoc.map((p) => ({ label: p.name, value: p.listValue, sub: `${p.units} units` }))} currency={cur} color={SERIES[3]} />
                  </Sub>
                </div>
              </div>
            </Section>

            {/* Expenses */}
            <Section icon={ShoppingBag} title="Expenses" subtitle={`${m(r.expenses.total)} · ${fmtPct(r.expenses.ratioToSales)} of sales${r.expenses.pending > 0 ? ` · ${m(r.expenses.pending)} awaiting approval` : ""}`}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Sub title="By category">
                  {r.expenses.total <= 0 ? (
                    <p className="text-sm text-slate-400">No expenses in this period.</p>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <Donut
                        parts={r.expenses.byCategory.slice(0, 5).concat(
                          r.expenses.byCategory.length > 5 ? [{ label: "Others", value: r.expenses.byCategory.slice(5).reduce((s, x) => s + x.value, 0) }] : []
                        )}
                        centerTop={fmtMoney(r.expenses.total, cur)}
                        centerBottom="spent"
                      />
                      <div className="w-full">
                        <ShareBar
                          parts={r.expenses.byCategory.slice(0, 5).concat(
                            r.expenses.byCategory.length > 5 ? [{ label: "Others", value: r.expenses.byCategory.slice(5).reduce((s, x) => s + x.value, 0) }] : []
                          )}
                          currency={cur}
                          colors={[...SERIES, OTHER]}
                        />
                      </div>
                    </div>
                  )}
                </Sub>
                <div className="space-y-6">
                  <Sub title="By person">
                    <RankBars rows={r.expenses.byPerson.map((p) => ({ label: p.label, value: p.value, sub: `${p.count} expenses` }))} currency={cur} color={SERIES[4]} />
                  </Sub>
                  <Meter label="Expenses as share of sales" value={r.expenses.ratioToSales} good={5} warn={10} invert note={`Petrol ${m(r.expenses.petrol)}`} />
                </div>
              </div>
            </Section>

            {/* Efficiency */}
            <Section icon={BarChart3} title="Productivity and efficiency" subtitle="Green is good, amber needs watching, red needs action">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                <Meter label="Collected vs sold" value={r.efficiency.collectionRate} good={90} warn={60} />
                <Meter label="Collections on time" value={r.efficiency.onTimeRate} good={80} warn={50} />
                <Meter label="Collected within 100 days" value={r.efficiency.within100Rate} good={90} warn={70} />
                {r.period.kind !== "day" && <Meter label="Days with sales" value={r.efficiency.activeDayRate} good={70} warn={45} note={`${r.sales.activeDays} of ${r.period.daysElapsed} working days`} />}
                <Meter label="Discount given (of list value)" value={r.efficiency.discountRate} good={3} warn={8} invert />
                <Meter label="FOC given (of list value)" value={r.efficiency.focRate} good={3} warn={8} invert />
                <Meter label="Expenses (of sales)" value={r.efficiency.expenseRate} good={5} warn={10} invert />
              </div>
              <p className="text-xs text-slate-400 mt-5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Unpaid and overdue figures are as of today; everything else is for {r.period.label}. List prices are today&apos;s.
              </p>
            </Section>
            <div className="h-2" />
          </div>
        )}
      </div>
    </div>
  );
}
