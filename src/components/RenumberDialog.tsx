"use client";

import React, { useState } from "react";
import { Hash, X } from "lucide-react";

/**
 * Admin / accountant: change the number of an existing invoice or receipt.
 * The series carries on after the new number when it is past the current one.
 */
export function RenumberDialog({
  docType,
  id,
  current,
  onClose,
  onDone,
}: {
  docType: "invoice" | "receipt";
  id: string;
  current: string;
  onClose: () => void;
  onDone: (newNumber: string, previous: string) => void;
}) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = docType === "invoice" ? "invoice" : "receipt";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const number = value.trim();
    if (!number || number === current) return onClose();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/renumber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, id, number }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change the number");
      onDone(data.number || number, current);
    } catch (err: any) {
      setError(err.message || "Could not change the number");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <form onSubmit={save} className="wiz-in bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden text-start" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <span className="w-11 h-11 rounded-xl bg-accent-light text-accent grid place-items-center">
              <Hash className="w-5 h-5" />
            </span>
            <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Change {label} number</h3>
          <p className="text-sm text-slate-500 mt-1">
            Now <span className="font-medium text-slate-700">{current}</span>. New {label}s will continue after the new number if it is higher.
          </p>
          <label className="block mt-4">
            <span className="block text-sm text-slate-600 mb-1.5">New number</span>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full h-11 px-3 border border-slate-300 rounded-md text-base font-semibold text-slate-900 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>
          {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end bg-slate-50 border-t border-slate-100 px-6 py-4">
          <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-slate-400">
            Cancel
          </button>
          <button type="submit" disabled={busy || !value.trim()} className="px-5 py-2.5 text-sm font-semibold text-white bg-accent hover:bg-accent-hover rounded-xl disabled:opacity-50">
            {busy ? "Saving…" : "Change number"}
          </button>
        </div>
      </form>
    </div>
  );
}
