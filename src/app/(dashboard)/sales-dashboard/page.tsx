"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { currencyFor, decimalsFor } from "@/lib/currency";
import { Delta, KpiTile, RankBars, ShareBar, fmtMoney } from "@/components/charts/PerfCharts";
import { Bars, Card, PeriodBar, TableWrap, Td, Th, presets } from "@/components/charts/DashCharts";

export default function SalesDashboardPage() {
  const { profile, isStaff, loading } = useAuth();
  const init = presets()[0];
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const cur = currencyFor(profile?.country);
  const dp = decimalsFor(profile?.country);

  const load = useCallback(async (f: string, t: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/sales?from=${f}&to=${t}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load");
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && isStaff) load(from, to);
  }, [loading, isStaff, from, to, load]);

  if (loading || !profile) return null;
  if (!isStaff) {
    return (
      <div className="w-full">
        <PageHeader title="Sales dashboard" />
        <p className="px-6 py-8 text-sm font-semibold text-slate-500">Only the admin or the accountant can open this page.</p>
      </div>
    );
  }
  const k = data?.kpis;
  const money = (n: number, d = 0) => fmtMoney(n, cur, d);
  const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}%` : "new");

  return (
    <div className="w-full">
      <PageHeader title="Sales dashboard" description="Products, customers and salesmen for any period, compared with the period before it." />
      <div className="px-6 py-5 md:py-6 max-w-[1400px] mx-auto space-y-5 text-start">
        <PeriodBar from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
        {busy && !data && <p className="text-sm font-semibold text-slate-500">Loading…</p>}

        {data && k && (
          <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <p className="mb-3 text-xs font-semibold text-slate-500">
              {data.period.from} to {data.period.to} ({data.period.days} days), compared with {data.period.prevFrom} to {data.period.prevTo}.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Net sales" value={money(k.net)} delta={<Delta now={k.net} prev={k.prevNet} />} sub={k.credits > 0 ? `after ${money(k.credits)} credit notes` : undefined} />
              <KpiTile label="Invoices" value={String(k.invoices)} delta={<Delta now={k.invoices} prev={k.prevInvoices} />} sub={`avg ${money(k.avgInvoice)}`} delay={40} />
              <KpiTile label="Units sold" value={k.qty.toLocaleString()} delta={<Delta now={k.qty} prev={k.prevQty} />} delay={80} />
              <KpiTile label="Average selling price" value={money(k.avgPrice, dp)} delta={<Delta now={k.avgPrice} prev={k.prevAvgPrice} />} sub="per unit, free units left out" delay={120} />
            </div>
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Customers who bought" value={String(k.activeCustomers)} delta={<Delta now={k.activeCustomers} prev={k.prevActiveCustomers} />} />
              <KpiTile label="New customers" value={String(k.newCustomers)} sub="first purchase in this period" delay={40} />
              <KpiTile label="Stopped buying" value={String(k.stoppedCustomers)} sub="bought last period, nothing now" delay={80} />
              <KpiTile label="Products sold" value={String(data.productCount)} delay={120} />
            </div>

            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title="Net sales by month" note="Last six months, after credit notes.">
                <Bars items={data.trend.map((t: any) => ({ label: t.label, a: t.value }))} series={["Net sales"]} currency={cur} />
              </Card>
              <Card title="Sales by company" note="Share of sales value by the company the product comes from.">
                <ShareBar parts={data.companies.map((c: any) => ({ label: c.name, value: c.value }))} currency={cur} />
              </Card>
            </div>

            <Card title="Product performance" note="Top products by sales value. Average price is what was actually charged per unit." className="mt-5">
              <TableWrap>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <Th>Product</Th>
                    <Th>Company</Th>
                    <Th right>Units</Th>
                    <Th right>Sales</Th>
                    <Th right>Avg price</Th>
                    <Th right>vs last period</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.map((p: any) => (
                    <tr key={p.id}>
                      <Td strong>{p.name}</Td>
                      <Td>{p.company}</Td>
                      <Td right>{p.qty.toLocaleString()}</Td>
                      <Td right strong>{money(p.value)}</Td>
                      <Td right>{p.avgPrice.toFixed(dp)}</Td>
                      <Td right className={p.prevValue > 0 && p.value < p.prevValue ? "text-rose-700" : p.prevValue > 0 ? "text-emerald-700" : "text-slate-500"}>{pct(p.value, p.prevValue)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>

            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title="Top customers" note="Invoiced in the period.">
                <RankBars rows={data.customers.map((c: any) => ({ key: c.id, label: c.name, value: c.value, sub: `${c.invoices} invoice${c.invoices === 1 ? "" : "s"}${c.prevValue > 0 ? ` · last period ${money(c.prevValue)}` : " · new this period"}` }))} currency={cur} max={10} />
              </Card>
              <Card title="Customers who stopped buying" note="Bought in the previous period, nothing in this one. Worth a call.">
                {data.stopped.length === 0 ? (
                  <p className="text-sm text-slate-400">None. Every customer from last period bought again.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.stopped.map((c: any) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <Link href={`/customers/${c.id}`} className="font-semibold text-[#1B2A4A] hover:text-accent">{c.name}</Link>
                        <span className="tabular-nums text-slate-500">was {money(c.prevValue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card title="Salesmen" note="Net sales (after their credit notes), invoices and customers served." className="mt-5">
              <TableWrap>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <Th>Salesman</Th>
                    <Th right>Net sales</Th>
                    <Th right>Invoices</Th>
                    <Th right>Customers</Th>
                    <Th right>Avg invoice</Th>
                    <Th right>vs last period</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.salesmen.map((s: any) => (
                    <tr key={s.id}>
                      <Td strong>{s.name}</Td>
                      <Td right strong>{money(s.net)}</Td>
                      <Td right>{s.invoices}</Td>
                      <Td right>{s.customers}</Td>
                      <Td right>{money(s.avgInvoice)}</Td>
                      <Td right className={s.prevNet > 0 && s.net < s.prevNet ? "text-rose-700" : s.prevNet > 0 ? "text-emerald-700" : "text-slate-500"}>{pct(s.net, s.prevNet)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
