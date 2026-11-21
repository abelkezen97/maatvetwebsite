"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";

/** Settings card: when an overdue customer is blocked from credit, and the default credit days. */
export function CreditPolicyCard() {
  const [enabled, setEnabled] = useState(true);
  const [blockAfter, setBlockAfter] = useState("100");
  const [defDays, setDefDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/credit-policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.blockAfterDays === "number") {
          setEnabled(d.blockEnabled !== false);
          setBlockAfter(String(d.blockAfterDays));
          setDefDays(String(d.defaultCreditDays));
        }
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/credit-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockEnabled: enabled, blockAfterDays: Number(blockAfter), defaultCreditDays: Number(defDays) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save");
      setMsg({ ok: true, text: "Saved. The new rule applies to the next invoice." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const input = "w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-accent/15";

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Credit control</h3>
          <p className="text-[11px] text-slate-400 font-semibold">Block credit sales to customers who are far overdue</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[#165B66]" />
        Block credit invoices for overdue customers
      </label>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-slate-700">
        <label className="flex items-center gap-2">
          Block when overdue by
          <input type="number" min={1} value={blockAfter} onChange={(e) => setBlockAfter(e.target.value)} className={input} />
          days
        </label>
        <label className="flex items-center gap-2">
          Credit days if an invoice has none
          <input type="number" min={0} value={defDays} onChange={(e) => setDefDays(e.target.value)} className={input} />
          days
        </label>
      </div>
      <p className="text-xs text-slate-500">
        A salesman cannot make a credit invoice for a blocked customer. Paid-now sales are still allowed. The admin and the accountant are never blocked and can release a customer from the Credit control page.
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && (
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {msg.ok && <CheckCircle2 className="h-4 w-4" />}
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
