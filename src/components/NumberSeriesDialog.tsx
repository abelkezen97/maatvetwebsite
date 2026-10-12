"use client";

import React, { useEffect, useState } from "react";
import { Hash, X, CheckCircle2 } from "lucide-react";
import { BillingSeries, DocumentSeries, SeriesDocType } from "@/types";

interface Slot {
  docType: SeriesDocType;
  billingSeries: BillingSeries;
}

interface Row extends Slot {
  prefix: string;
  nextNumber: string;
  padLength: string;
}

const SLOT_TITLE: Record<string, { title: string; hint: string }> = {
  "invoice:standard": { title: "Invoices (UAE-registered)", hint: "Printed with the company header" },
  "invoice:oman_reg": { title: "Invoices (Oman-registered)", hint: "Printed without the header" },
  "receipt:standard": { title: "Receipts (UAE-registered)", hint: "Payments for UAE-registered invoices" },
  "receipt:oman_reg": { title: "Receipts (Oman-registered)", hint: "Payments for Oman-registered invoices" },
};

function preview(prefix: string, next: string, pad: string): string {
  const n = Math.max(0, Math.floor(Number(next) || 0));
  const p = Math.min(8, Math.max(1, Math.floor(Number(pad) || 4)));
  return prefix.trim() ? `${prefix.trim()}${String(n).padStart(p, "0")}` : "—";
}

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/series`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Could not load number series");
        const existing: DocumentSeries[] = data.series || [];
        setRows(
          (data.slots || []).map((s: Slot) => {
            const found = existing.find((e) => e.docType === s.docType && e.billingSeries === s.billingSeries);
            return {
              ...s,
              prefix: found?.prefix || "",
              nextNumber: found ? String(found.nextNumber) : "1",
              padLength: found ? String(found.padLength) : "4",
            };
          })
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const update = (i: number, patch: Partial<Row>) => {
    setSaved(false);
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
            prefix: r.prefix.trim(),
            nextNumber: Number(r.nextNumber),
            padLength: Number(r.padLength),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#1B2A4A]">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1B2A4A]">Number series</h3>
              <p className="text-xs font-semibold text-slate-500">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs font-semibold text-slate-500">
          Each new document takes the next number and counts up by itself. Numbers that already exist (for example imported from the old software) are skipped. Leave the prefix empty if a series isn't used.
        </p>

        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-700">{error}</div>}
        {saved && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4" /> Saved.
          </div>
        )}

        {loading ? (
          <p className="text-sm font-semibold text-slate-500">Loading...</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            {rows.map((r, i) => {
              const meta = SLOT_TITLE[`${r.docType}:${r.billingSeries}`];
              return (
                <div key={`${r.docType}:${r.billingSeries}`} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-bold text-slate-800">{meta?.title}</div>
                      <div className="text-[11px] font-semibold text-slate-400">{meta?.hint}</div>
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      Next: <span className="font-black text-[#1B2A4A]">{preview(r.prefix, r.nextNumber, r.padLength)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prefix</span>
                      <input
                        type="text"
                        value={r.prefix}
                        maxLength={12}
                        placeholder="e.g. A-"
                        onChange={(e) => update(i, { prefix: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/15"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Next number</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={r.nextNumber}
                        onChange={(e) => update(i, { nextNumber: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/15"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Digits</span>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        step="1"
                        value={r.padLength}
                        onChange={(e) => update(i, { padLength: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/15"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 cursor-pointer">
                Close
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-bold hover:bg-[#15223c] shadow-md cursor-pointer disabled:opacity-60">
                {saving ? "Saving..." : "Save series"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
