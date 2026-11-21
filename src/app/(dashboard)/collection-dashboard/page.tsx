"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { currencyFor } from "@/lib/currency";
import { Delta, KpiTile, ShareBar, fmtMoney } from "@/components/charts/PerfCharts";
import { Bars, Card, PeriodBar, TableWrap, Td, Th, presets } from "@/components/charts/DashCharts";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function CollectionDashboardPage() {
  const { profile, isStaff, loading } = useAuth();
  const init = presets()[0];
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const cur = currencyFor(profile?.country);

  const load = useCallback(async (f: string, t: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/collections?from=${f}&to=${t}`, { cache: "no-store" });
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
        <PageHeader title="Collection dashboard" />
        <p className="px-6 py-8 text-sm font-semibold text-slate-500">Only the admin or the accountant can open this page.</p>
      </div>
    );
  }
  const k = data?.kpis;
  const money = (n: number) => fmtMoney(n, cur, 0);
  const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}%` : "new");

  return (
    <div className="w-full">
      <PageHeader title="Collection dashboard" description="What was collected, who collected it, how fast customers pay and what is expected next." />
      <div className="px-6 py-5 md:py-6 max-w-[1400px] mx-auto space-y-5 text-start">
        <PeriodBar from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
        {busy && !data && <LoadingSkeleton type="dashboard" />}

        {data && k && (
          <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <p className="mb-3 text-xs font-semibold text-slate-500">
              {data.period.from} to {data.period.to} ({data.period.days} days), compared with {data.period.prevFrom} to {data.period.prevTo}. Cheques count once cleared.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Collected" value={money(k.collected)} delta={<Delta now={k.collected} prev={k.prevCollected} />} sub={`${k.receipts} receipts`} />
              <KpiTile label="Invoiced" value={money(k.invoiced)} delta={<Delta now={k.invoiced} prev={k.prevInvoiced} />} delay={40} />
              <KpiTile label="Collected ÷ invoiced" value={k.collectionRate === null ? "—" : `${k.collectionRate}%`} sub="above 100% means old debt is being recovered" delay={80} />
              <KpiTile label="Average days to pay" value={k.avgDaysToPay === null ? "—" : `${k.avgDaysToPay} days`} sub="from invoice date, by amount" delay={120} />
            </div>
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Owed to us now" value={money(k.openNow)} delay={0} />
              <KpiTile label="Overdue now" value={money(k.overdueNow)} sub={k.openNow > 0 ? `${Math.round((k.overdueNow / k.openNow) * 100)}% of what is owed` : undefined} delay={40} />
              <KpiTile label="Falls due in 30 days" value={money(k.dueNext30)} delay={80} />
              <KpiTile label="Cheques not cleared yet" value={money(k.pendingCheques)} sub={`${k.pendingChequeCount} cheques`} delay={120} />
            </div>

            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title="Cash flow by week" note="Invoiced against collected, week by week in this period.">
                <Bars items={data.weeks.map((w: any) => ({ label: w.label, a: w.invoiced, b: w.collected }))} series={["Invoiced", "Collected"]} currency={cur} />
              </Card>
              <Card title="Collected by month" note="Last six months, against what was invoiced.">
                <Bars items={data.trend.map((t: any) => ({ label: t.label, a: t.invoiced, b: t.value }))} series={["Invoiced", "Collected"]} currency={cur} />
              </Card>
            </div>

            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title="How customers paid" note="Cleared payments in the period.">
                <ShareBar parts={data.byMethod.map((m: any) => ({ label: m.label, value: m.value }))} currency={cur} />
              </Card>
              <Card title="Collection by salesman" note="Who recorded the payments, with what is still open on their invoices.">
                <TableWrap>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <Th>Salesman</Th>
                      <Th right>Collected</Th>
                      <Th right>Receipts</Th>
                      <Th right>vs last period</Th>
                      <Th right>Still open</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.salesmen.map((s: any) => (
                      <tr key={s.id}>
                        <Td strong>{s.name}</Td>
                        <Td right strong>{money(s.collected)}</Td>
                        <Td right>{s.receipts}</Td>
                        <Td right className={s.prevCollected > 0 && s.collected < s.prevCollected ? "text-rose-700" : s.prevCollected > 0 ? "text-emerald-700" : "text-slate-500"}>{pct(s.collected, s.prevCollected)}</Td>
                        <Td right>{money(s.openNow)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </Card>
            </div>

            <Card title="Customer payment tracking" note="Customers who paid in the period and how many days they took from the invoice date." className="mt-5">
              <TableWrap>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <Th>Customer</Th>
                    <Th right>Paid</Th>
                    <Th right>Receipts</Th>
                    <Th right>Average days to pay</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.customers.map((c: any) => (
                    <tr key={c.id}>
                      <Td strong>
                        <Link href={`/customers/${c.id}`} className="hover:text-accent">{c.name}</Link>
                      </Td>
                      <Td right strong>{money(c.collected)}</Td>
                      <Td right>{c.receipts}</Td>
                      <Td right className={c.avgDays !== null && c.avgDays > 90 ? "text-rose-700 font-semibold" : ""}>{c.avgDays === null ? "—" : `${c.avgDays} days`}</Td>
                    </tr>
                  ))}
                  {data.customers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">No payments in this period.</td>
                    </tr>
                  )}
                </tbody>
              </TableWrap>
              <p className="mt-3 text-xs text-slate-500">
                Customers that are far overdue are on the <Link href="/credit-control" className="font-semibold text-accent">Credit control</Link> page.
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
