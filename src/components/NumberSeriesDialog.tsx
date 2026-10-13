"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Hash, X, CheckCircle2, FileText, Receipt as ReceiptIcon } from "lucide-react";
import { BillingSeries, DocumentSeries, SeriesDocType } from "@/types";

interface Slot {
  docType: SeriesDocType;
  billingSeries: BillingSeries;
}

interface Row extends Slot {
  prefix: string;
  /** A series of plain numbers (e.g. 0237) with no prefix. */
  numbersOnly: boolean;
  nextNumber: string;
  padLength: string;
}

const KIND_LABEL: Record<BillingSeries, { title: string; hint: string }> = {
  standard: { title: "UAE-registered", hint: "With company header" },
  oman_reg: { title: "Oman-registered", hint: "Without header" },
};

const TABS: Array<{ key: SeriesDocType; label: string; icon: React.ElementType }> = [
  { key: "invoice", label: "Invoices", icon: FileText },
  { key: "receipt", label: "Receipts", icon: ReceiptIcon },
];

function preview(prefix: string, next: string, pad: string, numbersOnly: boolean): string {
  const n = Math.max(0, Math.floor(Number(next) || 0));
  const p = Math.min(8, Math.max(1, Math.floor(Number(pad) || 4)));
  if (numbersOnly) return String(n).padStart(p, "0");
  return prefix.trim() ? `${prefix.trim()}${String(n).padStart(p, "0")}` : "";
}

const isSet = (r: Row) => r.numbersOnly || !!r.prefix.trim();

const inputClass =
  "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/15";

/** Admin: set a salesman's prefix and next number per document and billing series. */
export function NumberSeriesDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<Row[]>([]);
  const [tab, setTab] = useState<SeriesDocType>("invoice");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/series`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Could not load number series");
        const existing: DocumentSeries[] = data.series || [];
        const loaded: Row[] = (data.slots || []).map((s: Slot) => {
          const found = existing.find((e) => e.docType === s.docType && e.billingSeries === s.billingSeries);
          return {
            ...s,
            prefix: found?.prefix || "",
            numbersOnly: !!found && !String(found.prefix || "").trim(),
            nextNumber: found ? String(found.nextNumber) : "1",
            padLength: found ? String(found.padLength) : "4",
          };
        });
        setRows(loaded);
        setSaved(loaded);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(saved), [rows, saved]);
  const tabDirty = (docType: SeriesDocType) =>
    rows.some((r, i) => r.docType === docType && JSON.stringify(r) !== JSON.stringify(saved[i]));
  const tabCount = (docType: SeriesDocType) =>
    rows.filter((r) => r.docType === docType && isSet(r)).length;

  const update = (i: number, patch: Partial<Row>) => {
    setJustSaved(false);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/series`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series: rows.map((r) => ({
            docType: r.docType,
            billingSeries: r.billingSeries,
            prefix: r.numbersOnly ? "" : r.prefix.trim(),
            numbersOnly: r.numbersOnly,
            nextNumber: Number(r.nextNumber),
            padLength: Number(r.padLength),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setSaved(rows);
      setJustSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#1B2A4A]">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1B2A4A] leading-tight">Number series</h3>
              <p className="text-xs font-semibold text-slate-500">{userName}</p>
            </div>
          </div>
          <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <div role="tablist" className="flex gap-1 border-b border-slate-200">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              const count = tabCount(key);
              return (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition cursor-pointer -mb-px border-b-2 ${
                    active ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {!loading && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        active ? "bg-[#1B2A4A] text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {tabDirty(key) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={save} className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-3 overflow-y-auto">
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-700">{error}</div>
            )}

            {loading ? (
              <p className="text-sm font-semibold text-slate-500 py-6 text-center">Loading...</p>
            ) : (
              rows.map((r, i) => {
                if (r.docType !== tab) return null;
                const kind = KIND_LABEL[r.billingSeries as BillingSeries];
                const next = preview(r.prefix, r.nextNumber, r.padLength, r.numbersOnly);
                return (
                  <div key={`${r.docType}:${r.billingSeries}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="text-sm font-bold text-slate-800 leading-tight">{kind.title}</div>
                        <div className="text-[11px] font-medium text-slate-400">{kind.hint}</div>
                      </div>
                      {next ? (
                        <span className="text-xs font-semibold text-slate-500">
                          Next <span className="font-mono font-black text-[#1B2A4A]">{next}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">Not set</span>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_7rem_5rem] gap-2">
                      <label className="block">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prefix</span>
                        <input
                          type="text"
                          value={r.numbersOnly ? "" : r.prefix}
                          maxLength={12}
                          disabled={r.numbersOnly}
                          placeholder={r.numbersOnly ? "None" : r.billingSeries === "oman_reg" ? "e.g. AM-" : "e.g. A-"}
                          onChange={(e) => update(i, { prefix: e.target.value })}
                          className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Next no.</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={r.nextNumber}
                          onChange={(e) => update(i, { nextNumber: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Digits</span>
                        <input
                          type="number"
                          min="1"
                          max="8"
                          step="1"
                          value={r.padLength}
                          onChange={(e) => update(i, { padLength: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.numbersOnly}
                        onChange={(e) => update(i, { numbersOnly: e.target.checked, prefix: e.target.checked ? "" : r.prefix })}
                      />
                      Numbers only, no prefix (e.g. 0237)
                    </label>
                  </div>
                );
              })
            )}

            {!loading && (
              <p className="text-[11px] font-semibold text-slate-400 leading-relaxed">
                Numbers count up by themselves and skip any that already exist. Leave the prefix empty (and "Numbers only" unticked) if that series isn't used.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
            <span className="text-xs font-bold">
              {justSaved && !dirty ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" /> Saved
                </span>
              ) : dirty ? (
                <span className="text-amber-700">Unsaved changes</span>
              ) : null}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving || loading || !dirty}
                className="px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
