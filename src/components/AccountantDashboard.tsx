"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Wallet,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  Landmark,
  ClipboardCheck,
  LayoutGrid,
  Users,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { AccountantOverview } from "@/lib/db/accountantOverview";

type TabKey = "overview" | "receivables" | "cash" | "approvals";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "receivables", label: "Receivables", icon: Users },
  { key: "cash", label: "Cash & Bank", icon: Landmark },
  { key: "approvals", label: "Approvals", icon: ClipboardCheck },
];

const TAB_STORAGE_KEY = "maat.accountantTab";

function shortDate(day?: string | null): string {
  if (!day) return "—";
  const d = new Date(`${String(day).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Office dashboard for the accountant (and admin): one country at a time. */
export function AccountantDashboard({ country, name }: { country: string; name: string }) {
  const { formatCurrency } = useLanguage();
  const money = (n: number) => formatCurrency(n, country);

  const [tab, setTab] = useState<TabKey>("overview");
  const [data, setData] = useState<AccountantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY) as TabKey | null;
      if (saved && TABS.some((t) => t.key === saved)) setTab(saved);
    } catch {
      // storage unavailable
    }
  }, []);

  const chooseTab = (key: TabKey) => {
    setTab(key);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, key);
    } catch {
      // storage unavailable
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/accountant/overview", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the dashboard");
      setData(json);
    } catch (e: any) {
      setError(e.message || "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, url: string, okText: string, body?: any) => {
    setBusy(key);
    setActionMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Action failed");
      setActionMsg({ ok: true, text: okText });
      await load();
    } catch (e: any) {
      setActionMsg({ ok: false, text: e.message || "Action failed" });
    } finally {
      setBusy(null);
    }
  };

  const approvalsCount = data ? data.approvals.expenses.length + data.approvals.handovers.length + data.approvals.creditNotes : 0;

  return (
    <div className="space-y-5">
      {/* Heading row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#1B2A4A]">Accounts — {country}</h2>
          <p className="text-xs font-semibold text-slate-500">
            {data ? `Today ${shortDate(data.today)} · figures in ${country === "Oman" ? "OMR" : "AED"}` : `Hello ${name}`}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1" role="tablist" aria-label="Dashboard sections">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          const badge = t.key === "approvals" && approvalsCount > 0 ? approvalsCount : null;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => chooseTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition cursor-pointer ${
                active ? "bg-[#1B2A4A] text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {badge !== null && (
                <span className={`rounded-full px-1.5 text-[11px] font-extrabold ${active ? "bg-white/20" : "bg-rose-100 text-rose-700"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {actionMsg && (
        <div
          className={`rounded-xl border p-3 text-sm font-semibold ${
            actionMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

      {!data && loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {data && tab === "overview" && <OverviewTab data={data} money={money} goTo={chooseTab} />}
      {data && tab === "receivables" && <ReceivablesTab data={data} money={money} />}
      {data && tab === "cash" && <CashTab data={data} money={money} />}
      {data && tab === "approvals" && <ApprovalsTab data={data} money={money} busy={busy} act={act} />}
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "slate",
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "slate" | "emerald" | "rose" | "teal";
  onClick?: () => void;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    teal: "bg-teal-50 text-[#165B66]",
  } as const;
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-2xs ${
        onClick ? "cursor-pointer transition hover:border-slate-300 hover:shadow-sm" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`rounded-lg p-1.5 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs font-semibold text-slate-500">{sub}</div>}
    </Tag>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-[#1B2A4A]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm font-semibold text-slate-400">{children}</p>;
}

/* ---------------------------------------------------------------- tabs */

function OverviewTab({
  data,
  money,
  goTo,
}: {
  data: AccountantOverview;
  money: (n: number) => string;
  goTo: (t: TabKey) => void;
}) {
  const change = data.sales.lastMonth > 0 ? ((data.sales.month - data.sales.lastMonth) / data.sales.lastMonth) * 100 : null;
  const approvals = data.approvals.expenses.length + data.approvals.handovers.length + data.approvals.creditNotes;
  const maxMethod = Math.max(1, ...data.collections.byMethod.map((m) => m.amount));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Sales this month"
          value={money(data.sales.month)}
          sub={`${data.sales.monthInvoices} invoices${change !== null ? ` · ${change >= 0 ? "+" : ""}${change.toFixed(0)}% vs last month` : ""}`}
          icon={TrendingUp}
          tone="teal"
        />
        <Stat
          label="Collected this month"
          value={money(data.collections.month)}
          sub={`Today ${money(data.collections.today)}`}
          icon={Wallet}
          tone="emerald"
        />
        <Stat
          label="Customers owe"
          value={money(data.receivables.total)}
          sub={`${money(data.receivables.overdue)} overdue · ${data.receivables.customersOwing} customers`}
          icon={CreditCard}
          tone="rose"
          onClick={() => goTo("receivables")}
        />
        <Stat
          label="Cash in hand"
          value={money(data.cash.totalCashInHand)}
          sub={`${data.cash.cheques.count} cheques (${money(data.cash.cheques.amount)}) waiting to clear`}
          icon={Landmark}
          onClick={() => goTo("cash")}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Needs your attention">
          <ul className="divide-y divide-slate-100 text-sm">
            <AttentionRow
              label="Waiting for approval"
              detail={`${data.approvals.expenses.length} expenses · ${data.approvals.handovers.length} handovers · ${data.approvals.creditNotes} credit notes`}
              count={approvals}
              onClick={() => goTo("approvals")}
            />
            <AttentionRow
              label="Cheques waiting to clear"
              detail={`${data.cash.cheques.notAtOffice} not yet handed to the office`}
              count={data.cash.cheques.count}
              onClick={() => goTo("cash")}
            />
            <AttentionRow
              label="Customers overdue"
              detail={`${money(data.receivables.overdue)} past the due date`}
              count={data.receivables.overdueCustomers}
              onClick={() => goTo("receivables")}
            />
          </ul>
        </Panel>

        <Panel title="This month's collections by method" action={<MoreLink href="/receipts">Receipts</MoreLink>}>
          {data.collections.byMethod.length === 0 ? (
            <Empty>No collections yet this month.</Empty>
          ) : (
            <ul className="space-y-3">
              {data.collections.byMethod.map((m) => (
                <li key={m.method}>
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
                    <span>
                      {m.method} <span className="font-semibold text-slate-400">· {m.count}</span>
                    </span>
                    <span className="tabular-nums text-slate-900">{money(m.amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[#256874]" style={{ width: `${(m.amount / maxMethod) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function AttentionRow({ label, detail, count, onClick }: { label: string; detail: string; count: number; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left cursor-pointer group">
        <span
          className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-extrabold tabular-nums ${
            count > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-400"
          }`}
        >
          {count}
        </span>
        <span className="flex-1">
          <span className="block font-bold text-slate-800 group-hover:text-accent">{label}</span>
          <span className="block text-xs font-semibold text-slate-500">{detail}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-accent" />
      </button>
    </li>
  );
}

function ReceivablesTab({ data, money }: { data: AccountantOverview; money: (n: number) => string }) {
  const r = data.receivables;
  const max = Math.max(1, ...r.ageing.map((a) => a.amount));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Customers owe" value={money(r.total)} sub={`${r.customersOwing} customers`} icon={CreditCard} tone="rose" />
        <Stat label="Overdue" value={money(r.overdue)} sub="Past the credit period" icon={AlertTriangle} tone="rose" />
        {r.bySeries ? (
          <Stat
            label="UAE-reg / Oman-reg"
            value={money(r.bySeries.standard)}
            sub={`UAE-registered · Oman-registered ${money(r.bySeries.omanReg)}`}
            icon={CreditCard}
          />
        ) : (
          <Stat label="Open invoices" value={String(r.ageing.reduce((s, a) => s + a.invoices, 0))} icon={CreditCard} />
        )}
      </div>

      <Panel title="Ageing (unpaid invoices by days past due)">
        <ul className="space-y-3">
          {r.ageing.map((a) => (
            <li key={a.key}>
              <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
                <span>
                  {a.label} <span className="font-semibold text-slate-400">· {a.invoices} invoices</span>
                </span>
                <span className="tabular-nums text-slate-900">{money(a.amount)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div
                  className={`h-2.5 rounded-full ${a.key === "current" ? "bg-[#256874]" : a.key === "1-30" ? "bg-amber-400" : "bg-rose-500"}`}
                  style={{ width: `${(a.amount / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Most overdue customers" action={<MoreLink href="/customers">All customers</MoreLink>}>
        {r.topOverdue.length === 0 ? (
          <Empty>No overdue customers.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Salesman</th>
                  <th className="py-2 pr-3 text-right">Overdue</th>
                  <th className="py-2 pr-3 text-right">Total owed</th>
                  <th className="py-2 text-right">Oldest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.topOverdue.map((c) => (
                  <tr key={c.customerId} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-bold text-slate-800">
                      <Link href={`/customers/${c.customerId}`} className="hover:text-accent hover:underline">
                        {c.companyName}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-slate-500">{c.salesmanName}</td>
                    <td className="py-2.5 pr-3 text-right font-extrabold tabular-nums text-rose-700">{money(c.overdue)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-700">{money(c.outstanding)}</td>
                    <td className="py-2.5 text-right text-xs font-bold text-slate-600">{c.oldestDaysOverdue} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CashTab({ data, money }: { data: AccountantOverview; money: (n: number) => string }) {
  const c = data.cash;
  return (
    <div className="space-y-5">
      <Panel title="Cash in hand" action={<MoreLink href="/collection-ledger">Collection ledger</MoreLink>}>
        {c.people.length === 0 ? (
          <Empty>No cash records yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3 text-right">Collected</th>
                  <th className="py-2 pr-3 text-right">Received</th>
                  <th className="py-2 pr-3 text-right">Expenses</th>
                  <th className="py-2 pr-3 text-right">Handed over</th>
                  <th className="py-2 text-right">Cash in hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.people.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 font-bold text-slate-800">{p.name}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{money(p.collected)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{money(p.received)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{money(p.expenses)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{money(p.handedOver)}</td>
                    <td className="py-2.5 text-right font-extrabold tabular-nums text-slate-900">{money(p.cashInHand)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td className="py-2.5 pr-3 text-xs font-extrabold uppercase tracking-wider text-slate-500" colSpan={5}>
                    Total cash in hand
                  </td>
                  <td className="py-2.5 text-right font-extrabold tabular-nums text-slate-900">{money(c.totalCashInHand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs font-semibold text-slate-400">
          Opening balance + cash collected + cash received in handovers − expenses − cash handed over (or deposited).
        </p>
      </Panel>

      <Panel
        title={`Cheques waiting to clear · ${money(c.cheques.amount)}`}
        action={<MoreLink href="/receipts">Receipts</MoreLink>}
      >
        {c.cheques.list.length === 0 ? (
          <Empty>No cheques waiting.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Cheque date</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Cheque / bank</th>
                  <th className="py-2 pr-3">With</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.cheques.list.map((q) => (
                  <tr key={q.receiptId}>
                    <td className="py-2.5 pr-3 text-xs font-bold text-slate-600">{shortDate(q.chequeDate)}</td>
                    <td className="py-2.5 pr-3 font-bold text-slate-800">{q.companyName}</td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-slate-500">
                      {q.chequeNumber || "—"}
                      {q.bankName ? ` · ${q.bankName}` : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-slate-500">{q.atOffice ? "Office" : q.collectedBy}</td>
                    <td className="py-2.5 text-right font-extrabold tabular-nums text-slate-900">{money(q.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ApprovalsTab({
  data,
  money,
  busy,
  act,
}: {
  data: AccountantOverview;
  money: (n: number) => string;
  busy: string | null;
  act: (key: string, url: string, okText: string, body?: any) => Promise<void>;
}) {
  const a = data.approvals;
  const reject = (key: string, url: string, label: string) => {
    const reason = window.prompt(`Reason for rejecting ${label} (optional):`);
    if (reason === null) return;
    act(key, url, `${label} rejected.`, { reason });
  };

  return (
    <div className="space-y-5">
      <Panel title={`Expenses waiting · ${money(a.expensesTotal)}`} action={<MoreLink href="/expenses">All expenses</MoreLink>}>
        {a.expenses.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {a.expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[200px] flex-1">
                  <div className="text-sm font-bold text-slate-800">
                    {e.person} · {e.category}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {shortDate(e.date)} · {e.number}
                    {e.description ? ` · ${e.description}` : ""}
                  </div>
                </div>
                <div className="text-sm font-extrabold tabular-nums text-slate-900">{money(e.amount)}</div>
                <ApproveRejectButtons
                  disabled={busy !== null}
                  busy={busy === e.id}
                  onApprove={() => act(e.id, `/api/expenses/${e.id}/approve`, `Expense ${e.number} approved.`)}
                  onReject={() => reject(e.id, `/api/expenses/${e.id}/reject`, `Expense ${e.number}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Cash handovers to confirm · ${money(a.handoversTotal)}`} action={<MoreLink href="/collection-ledger">Collection ledger</MoreLink>}>
        {a.handovers.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {a.handovers.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[200px] flex-1">
                  <div className="text-sm font-bold text-slate-800">{h.person}</div>
                  <div className="text-xs font-semibold text-slate-500">
                    {shortDate(h.date)} · {h.number}
                    {h.notes ? ` · ${h.notes}` : ""}
                  </div>
                </div>
                <div className="text-sm font-extrabold tabular-nums text-slate-900">{money(h.amount)}</div>
                <ApproveRejectButtons
                  approveLabel="Confirm received"
                  disabled={busy !== null}
                  busy={busy === h.id}
                  onApprove={() => act(h.id, `/api/handovers/${h.id}/approve`, `Handover ${h.number} confirmed.`)}
                  onReject={() => reject(h.id, `/api/handovers/${h.id}/reject`, `Handover ${h.number}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Credit notes waiting" action={<MoreLink href="/credit-notes">Credit notes</MoreLink>}>
        <p className="text-sm font-semibold text-slate-600">
          {a.creditNotes === 0 ? "Nothing waiting." : `${a.creditNotes} credit note${a.creditNotes === 1 ? "" : "s"} waiting for approval.`}
        </p>
      </Panel>
    </div>
  );
}

function ApproveRejectButtons({
  onApprove,
  onReject,
  disabled,
  busy,
  approveLabel = "Approve",
}: {
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
  busy: boolean;
  approveLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
      >
        <CheckCircle2 className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} />
        {approveLabel}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
      >
        <XCircle className="h-3.5 w-3.5" />
        Reject
      </button>
    </div>
  );
}
