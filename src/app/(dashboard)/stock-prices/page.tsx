"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Search, Undo2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { Product } from "@/types";
import { currencyFor, decimalsFor } from "@/lib/currency";
import { useWide } from "@/components/form/EntryForm";

/**
 * Stock & prices (admin / accountant): every product on one screen. Type a
 * quantity to add (+) or take off (−), change any price, then Save all.
 * Enter moves down the same column, like a spreadsheet.
 */

type PriceKey = "list" | "cost" | "p10" | "p50" | "p100";
type Reason = "received" | "correction" | "damage" | "expired" | "return";
interface Draft {
  list?: string;
  cost?: string;
  p10?: string;
  p50?: string;
  p100?: string;
  delta?: string;
  reason?: Reason;
  expiry?: string;
}

const REASONS_IN: { key: Reason; label: string }[] = [
  { key: "received", label: "Stock received" },
  { key: "return", label: "Returned" },
  { key: "correction", label: "Count correction" },
];
const REASONS_OUT: { key: Reason; label: string }[] = [
  { key: "correction", label: "Count correction" },
  { key: "damage", label: "Damaged" },
  { key: "expired", label: "Expired" },
];

const cell =
  "w-full h-9 px-2 text-sm text-right tabular-nums bg-white border border-slate-200 rounded-md focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors";

export default function StockPricesPage() {
  const router = useRouter();
  const { profile, isStaff } = useAuth();
  const wide = useWide();
  const country = profile?.country === "Oman" ? "Oman" : "UAE";
  const cur = currencyFor(country);
  const dp = decimalsFor(country);

  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [showTiers, setShowTiers] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: { name: string; error: string }[] } | null>(null);

  useEffect(() => {
    if (profile && !isStaff) router.replace("/dashboard");
  }, [profile, isStaff, router]);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, iRes] = await Promise.all([fetch(`/api/products?t=${Date.now()}`), fetch(`/api/inventory?t=${Date.now()}`)]);
      const pData = await pRes.json();
      const iData = await iRes.json();
      setProducts(((pData.products || []) as Product[]).filter((p) => p.isAvailable !== false).sort((a, b) => a.name.localeCompare(b.name)));
      const m = new Map<string, number>();
      (iData.summaries || []).forEach((s: any) => m.set(String(s.productId), country === "Oman" ? Number(s.omanStock) || 0 : Number(s.uaeStock) || 0));
      setStock(m);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (isStaff) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, country]);

  const current = (p: Product, k: PriceKey): number | undefined =>
    k === "list" ? p.sellingPrice ?? p.price : k === "cost" ? p.costPrice : k === "p10" ? p.price10 : k === "p50" ? p.price50 : p.price100;
  const fmtNum = (v: number | undefined) => (v === undefined || v === null ? "" : String(Number(v.toFixed(dp))));

  const priceChanged = (p: Product, k: PriceKey) => {
    const d = drafts[p.id]?.[k];
    if (d === undefined) return false;
    return d.trim() !== fmtNum(current(p, k));
  };
  const deltaOf = (p: Product) => {
    const n = parseInt(drafts[p.id]?.delta || "", 10);
    return isNaN(n) ? 0 : n;
  };
  const rowChanged = (p: Product) => deltaOf(p) !== 0 || (["list", "cost", "p10", "p50", "p100"] as PriceKey[]).some((k) => priceChanged(p, k));

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const undoRow = (id: string) =>
    setDrafts((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });

  const companies = useMemo(() => Array.from(new Set(products.map((p) => p.manufacturer || "Other"))).sort(), [products]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)) &&
        (!company || (p.manufacturer || "Other") === company) &&
        (!onlyChanged || rowChanged(p))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, company, onlyChanged, drafts]);

  const changedRows = products.filter(rowChanged);
  const problems = changedRows
    .map((p) => {
      const d = deltaOf(p);
      if (d < 0 && (stock.get(p.id) || 0) < -d) return `${p.name}: only ${stock.get(p.id) || 0} in stock`;
      if (priceChanged(p, "list") && !(Number(drafts[p.id]?.list) >= 0 && drafts[p.id]?.list?.trim())) return `${p.name}: enter a list price`;
      for (const k of ["list", "cost", "p10", "p50", "p100"] as PriceKey[]) {
        const v = drafts[p.id]?.[k];
        if (v !== undefined && v.trim() !== "" && !(Number(v) >= 0)) return `${p.name}: prices must be numbers`;
      }
      return null;
    })
    .filter(Boolean) as string[];

  const saveAll = async () => {
    if (changedRows.length === 0 || problems.length > 0) return;
    setSaving(true);
    setResult(null);
    try {
      const changes = changedRows.map((p) => {
        const d = drafts[p.id] || {};
        const prices: Record<string, number | null> = {};
        (["list", "cost", "p10", "p50", "p100"] as PriceKey[]).forEach((k) => {
          if (priceChanged(p, k)) prices[k] = d[k]!.trim() === "" ? null : Number(d[k]);
        });
        const delta = deltaOf(p);
        return {
          productId: p.id,
          name: p.name,
          prices,
          stock: delta ? { delta, reason: d.reason || (delta > 0 ? "received" : "correction"), expiryDate: delta > 0 ? d.expiry || null : null } : undefined,
        };
      });
      const res = await fetch("/api/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.failed) throw new Error(data.error || "Could not save");
      const failedIds = new Set((data.failed || []).map((f: any) => f.productId));
      setDrafts((prev) => {
        const n: Record<string, Draft> = {};
        Object.entries(prev).forEach(([id, v]) => {
          if (failedIds.has(id)) n[id] = v;
        });
        return n;
      });
      setResult({ saved: data.saved || 0, failed: data.failed || [] });
      await load();
    } catch (e: any) {
      setResult({ saved: 0, failed: [{ name: "Save", error: e.message }] });
    } finally {
      setSaving(false);
    }
  };

  // Enter moves to the same column on the next row.
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const el = e.currentTarget;
    const col = el.dataset.col;
    const row = Number(el.dataset.row);
    const next = document.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-row="${row + (e.shiftKey ? -1 : 1)}"]`);
    next?.focus();
    next?.select();
  };

  const priceInput = (p: Product, k: PriceKey, row: number) => {
    const changed = priceChanged(p, k);
    return (
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        data-col={k}
        data-row={row}
        value={drafts[p.id]?.[k] ?? fmtNum(current(p, k))}
        placeholder="—"
        onChange={(e) => setDraft(p.id, { [k]: e.target.value } as Partial<Draft>)}
        onFocus={(e) => e.target.select()}
        onKeyDown={onEnter}
        className={`${cell} ${changed ? "bg-amber-50 border-amber-300 font-semibold" : ""}`}
        aria-label={`${k} price of ${p.name}`}
      />
    );
  };

  const stockEditor = (p: Product, row: number) => {
    const d = deltaOf(p);
    const now = stock.get(p.id) || 0;
    const reasons = d > 0 ? REASONS_IN : REASONS_OUT;
    const reason = drafts[p.id]?.reason && reasons.some((r) => r.key === drafts[p.id]?.reason) ? drafts[p.id]!.reason : reasons[0].key;
    return (
      <div className="space-y-1.5">
        <input
          type="number"
          step="1"
          inputMode="numeric"
          data-col="delta"
          data-row={row}
          value={drafts[p.id]?.delta ?? ""}
          placeholder="+ / −"
          onChange={(e) => setDraft(p.id, { delta: e.target.value })}
          onFocus={(e) => e.target.select()}
          onKeyDown={onEnter}
          className={`${cell} ${d > 0 ? "bg-emerald-50 border-emerald-300 font-semibold" : d < 0 ? "bg-rose-50 border-rose-300 font-semibold" : ""}`}
          aria-label={`Add or remove stock of ${p.name}`}
        />
        {d !== 0 && (
          <div className="wiz-in space-y-1.5">
            <div className={`text-[11px] text-right ${d < 0 && now < -d ? "text-rose-700 font-medium" : "text-slate-500"}`}>
              {now} → {now + d}
            </div>
            <select value={reason} onChange={(e) => setDraft(p.id, { reason: e.target.value as Reason })} className="w-full h-8 px-1.5 text-xs border border-slate-200 rounded-md bg-white">
              {reasons.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            {d > 0 && (
              <label className="block">
                <span className="block text-[10px] text-slate-500">Expiry</span>
                <input
                  type="date"
                  value={drafts[p.id]?.expiry || ""}
                  onChange={(e) => setDraft(p.id, { expiry: e.target.value })}
                  className={`w-full h-8 px-1.5 text-xs border rounded-md ${drafts[p.id]?.expiry ? "border-slate-200" : "border-amber-300 bg-amber-50"}`}
                />
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  if (profile && !isStaff) return null;

  return (
    <div className="w-full">
      <PageHeader title="Stock & prices" breadcrumbs={[{ label: "Products", href: "/products" }, { label: "Stock & prices" }]} />

      <div className="px-4 sm:px-6 lg:px-8 pt-6 max-w-7xl mx-auto text-start">
        <div className="wiz-in flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product or code"
              className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </div>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 h-10 px-3 border border-slate-300 rounded-lg bg-white cursor-pointer">
            <input type="checkbox" checked={showTiers} onChange={(e) => setShowTiers(e.target.checked)} className="accent-[var(--accent)]" />
            Quantity prices
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 h-10 px-3 border border-slate-300 rounded-lg bg-white cursor-pointer">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-[var(--accent)]" />
            Only changed
          </label>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Type <b>+20</b> to add stock or <b>−5</b> to take it off, change any price, then <b>Save all</b>. Enter moves down the column. Prices are in {cur} for {country}.
        </p>

        {result && (
          <div className={`wiz-in mb-4 rounded-lg border px-4 py-3 text-sm flex items-start justify-between gap-3 ${result.failed.length ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
            <div>
              <div className="flex items-center gap-2 font-medium">
                {result.failed.length ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {result.saved} product{result.saved === 1 ? "" : "s"} saved{result.failed.length ? `, ${result.failed.length} not saved` : ""}.
              </div>
              {result.failed.map((f, i) => (
                <div key={i} className="text-xs mt-1">
                  {f.name}: {f.error}
                </div>
              ))}
            </div>
            <button onClick={() => setResult(null)} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <div key={k} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : wide ? (
          <div className="wiz-in bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="text-left font-semibold px-4 py-2.5">Product</th>
                  <th className="text-right font-semibold px-2 py-2.5 w-20">In stock</th>
                  <th className="text-right font-semibold px-2 py-2.5 w-36">Add / remove</th>
                  <th className="text-right font-semibold px-2 py-2.5 w-28">List price</th>
                  <th className="text-right font-semibold px-2 py-2.5 w-28">Cost</th>
                  {showTiers && (
                    <>
                      <th className="text-right font-semibold px-2 py-2.5 w-24">10+</th>
                      <th className="text-right font-semibold px-2 py-2.5 w-24">50+</th>
                      <th className="text-right font-semibold px-2 py-2.5 w-24">100+</th>
                    </>
                  )}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p, row) => {
                  const changed = rowChanged(p);
                  const now = stock.get(p.id) || 0;
                  return (
                    <tr key={p.id} className={`align-top transition-colors ${changed ? "bg-amber-50/40" : "hover:bg-slate-50/60"}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500">{[p.manufacturer, p.sku].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${now <= 0 ? "text-rose-700" : "text-slate-800"}`}>{now}</td>
                      <td className="px-2 py-2">{stockEditor(p, row)}</td>
                      <td className="px-2 py-2">{priceInput(p, "list", row)}</td>
                      <td className="px-2 py-2">{priceInput(p, "cost", row)}</td>
                      {showTiers && (
                        <>
                          <td className="px-2 py-2">{priceInput(p, "p10", row)}</td>
                          <td className="px-2 py-2">{priceInput(p, "p50", row)}</td>
                          <td className="px-2 py-2">{priceInput(p, "p100", row)}</td>
                        </>
                      )}
                      <td className="pr-3 py-2.5 text-right">
                        {changed && (
                          <button type="button" onClick={() => undoRow(p.id)} className="p-1.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100" title="Undo this row" aria-label={`Undo ${p.name}`}>
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No products match.</p>}
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((p, row) => {
              const changed = rowChanged(p);
              const now = stock.get(p.id) || 0;
              return (
                <li key={p.id} className={`wiz-in bg-white border rounded-lg p-4 ${changed ? "border-amber-300" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.manufacturer}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-slate-500">In stock</div>
                      <div className={`font-semibold tabular-nums ${now <= 0 ? "text-rose-700" : "text-slate-900"}`}>{now}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div>
                      <span className="block text-[11px] text-slate-500 mb-1">Add / remove</span>
                      {stockEditor(p, row)}
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 mb-1">List price</span>
                      {priceInput(p, "list", row)}
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 mb-1">Cost</span>
                      {priceInput(p, "cost", row)}
                    </div>
                    {showTiers && (
                      <>
                        <div>
                          <span className="block text-[11px] text-slate-500 mb-1">10+</span>
                          {priceInput(p, "p10", row)}
                        </div>
                        <div>
                          <span className="block text-[11px] text-slate-500 mb-1">50+</span>
                          {priceInput(p, "p50", row)}
                        </div>
                        <div>
                          <span className="block text-[11px] text-slate-500 mb-1">100+</span>
                          {priceInput(p, "p100", row)}
                        </div>
                      </>
                    )}
                  </div>
                  {changed && (
                    <button type="button" onClick={() => undoRow(p.id)} className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                      <Undo2 className="w-3.5 h-3.5" /> Undo
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Save bar */}
        <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mt-6 border-t border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 lg:px-8 pt-3 safe-bottom flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || changedRows.length === 0 || problems.length > 0}
            className="h-10 px-5 text-sm font-semibold text-white bg-accent hover:bg-accent-hover rounded-md shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : changedRows.length ? `Save all (${changedRows.length})` : "Save all"}
          </button>
          {changedRows.length > 0 && (
            <button type="button" onClick={() => setDrafts({})} className="h-10 px-4 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50">
              Discard changes
            </button>
          )}
          <span className="text-xs text-slate-500">
            {problems.length > 0 ? <span className="text-rose-700">{problems[0]}</span> : changedRows.length ? `${changedRows.length} product${changedRows.length === 1 ? "" : "s"} changed` : "No changes yet"}
          </span>
        </div>
      </div>
    </div>
  );
}
