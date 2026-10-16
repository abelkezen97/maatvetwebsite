"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Pencil, Plus, X } from "lucide-react";
import { ExpiryLot } from "@/types";
import { expiryState, NEAR_EXPIRY_MONTHS } from "@/lib/db/expiry";

/**
 * A product's stock by expiry date. Everyone sees it; the admin and
 * accountant can add stock at an expiry date, correct a date (which also
 * confirms it) and correct the quantity left.
 */

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No date";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());

const STATE = {
  expired: { label: "Expired", cls: "bg-rose-100 text-rose-800" },
  near: { label: `Within ${NEAR_EXPIRY_MONTHS} months`, cls: "bg-amber-100 text-amber-900" },
  ok: { label: "OK", cls: "bg-emerald-50 text-emerald-800" },
  unknown: { label: "No date", cls: "bg-slate-100 text-slate-600" },
};

export function ProductExpiryLots({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [lots, setLots] = useState<ExpiryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ expiry: string; qty: string }>({ expiry: "", qty: "" });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/lots?productId=${encodeURIComponent(productId)}&all=1&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => setLots(d.lots || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, [productId]);

  const t = today();
  const live = lots.filter((l) => l.qtyRemaining > 0);
  const total = live.reduce((s, l) => s + l.qtyRemaining, 0);
  const near = live.filter((l) => expiryState(l.expiryDate, t) === "near").reduce((s, l) => s + l.qtyRemaining, 0);
  const expired = live.filter((l) => expiryState(l.expiryDate, t) === "expired").reduce((s, l) => s + l.qtyRemaining, 0);

  const save = async (lot: ExpiryLot) => {
    setBusy(true);
    setError(null);
    try {
      const body: any = {};
      if (form.expiry && form.expiry !== lot.expiryDate) body.expiryDate = form.expiry;
      if (form.qty !== "" && Number(form.qty) !== lot.qtyRemaining) body.qtyRemaining = Number(form.qty);
      if (!body.expiryDate && lot.needsCheck) body.confirm = true;
      const res = await fetch(`/api/lots/${lot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save");
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, expiryDate: form.expiry, qty: Number(form.qty) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save");
      setAdding(false);
      setForm({ expiry: "", qty: "" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const input = "h-9 px-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";

  return (
    <section className="wiz-in bg-white border border-slate-200 rounded-2xl shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 md:px-7 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-accent-light text-accent grid place-items-center">
            <CalendarClock className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-900">Stock by expiry date</h2>
            <p className="text-sm text-slate-500">
              {total} in stock{near > 0 ? ` · ${near} within ${NEAR_EXPIRY_MONTHS} months` : ""}
              {expired > 0 ? ` · ${expired} expired` : ""}
            </p>
          </div>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditing(null);
              setForm({ expiry: "", qty: "" });
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-accent bg-accent-light hover:bg-accent hover:text-white rounded-xl px-3.5 py-2 transition"
          >
            <Plus className="w-4 h-4" /> Add stock at an expiry date
          </button>
        )}
      </header>
      <div className="px-5 md:px-7 py-4">
        {error && <p className="text-sm text-rose-700 mb-3">{error}</p>}
        {adding && (
          <div className="wiz-in flex flex-wrap items-end gap-3 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <label className="block">
              <span className="block text-xs text-slate-500 mb-1">Expiry date</span>
              <input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} className={input} />
            </label>
            <label className="block">
              <span className="block text-xs text-slate-500 mb-1">Quantity received</span>
              <input type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className={`${input} w-28 text-right`} />
            </label>
            <button type="button" disabled={busy || !form.expiry || !(Number(form.qty) > 0)} onClick={add} className="h-9 px-4 text-sm font-semibold text-white bg-accent rounded-lg disabled:opacity-40">
              {busy ? "Saving…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 px-3 text-sm text-slate-600">
              Cancel
            </button>
            <p className="basis-full text-xs text-slate-500">This records the expiry of stock you are adding. Add the stock itself with Add Stock as usual.</p>
          </div>
        )}
        {loading ? (
          <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ) : lots.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No expiry dates recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lots.map((l) => {
              const st = expiryState(l.expiryDate, t);
              const s = STATE[st];
              const isEditing = editing === l.id;
              return (
                <li key={l.id} className={`py-3 ${l.qtyRemaining <= 0 ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-slate-900 w-32">{fmt(l.expiryDate)}</span>
                    <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${s.cls}`}>
                      {s.label}
                      {st !== "unknown" && l.daysToExpiry !== null && st !== "ok" ? ` · ${l.daysToExpiry < 0 ? `${-l.daysToExpiry} days ago` : `${l.daysToExpiry} days`}` : ""}
                    </span>
                    {l.needsCheck && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5" title={l.notes}>
                        <AlertTriangle className="w-3 h-3" /> Date to confirm
                      </span>
                    )}
                    <span className="ml-auto text-sm tabular-nums">
                      <span className="font-semibold text-slate-900">{l.qtyRemaining}</span>
                      <span className="text-slate-500"> left{l.qtySold > 0 ? ` · ${l.qtySold} sold` : ""}</span>
                    </span>
                    {canEdit && !isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(l.id);
                          setAdding(false);
                          setForm({ expiry: l.expiryDate || "", qty: String(l.qtyRemaining) });
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent-light"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <div className="wiz-in flex flex-wrap items-end gap-3 mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">Expiry date</span>
                        <input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} className={input} />
                      </label>
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">Quantity left</span>
                        <input type="number" min="0" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className={`${input} w-24 text-right`} />
                      </label>
                      <button type="button" disabled={busy} onClick={() => save(l)} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-accent rounded-lg disabled:opacity-40">
                        <CheckCircle2 className="w-4 h-4" /> {busy ? "Saving…" : l.needsCheck ? "Save and confirm" : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="h-9 px-2 text-slate-500" aria-label="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                      {l.notes && <p className="basis-full text-xs text-slate-500">{l.notes}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
