"use client";

import React, { useEffect, useState } from "react";
import { Receipt } from "@/types";
import { useLanguage } from "@/context/LanguageContext";

/**
 * Cheques collected by salespeople that the office has not received yet.
 * Salespeople see their own; admins and accountants see all salespeople of
 * their country and can mark a cheque as received.
 * Cheques are kept apart from cash in hand (the cash ledger counts cash only).
 */
export function ChequesInHand({ canReceive }: { canReceive: boolean }) {
  const { formatCurrency, formatDate } = useLanguage();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/receipts?cheques=in-hand&t=${Date.now()}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markReceived = async (r: Receipt) => {
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${r.id}/cheque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "received" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not mark the cheque as received");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading || rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + (r.amountPaid || 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">
          Cheques in hand ({rows.length})
        </h3>
        <span className="text-sm font-bold text-amber-700">{formatCurrency(total)} to hand over</span>
      </div>
      <p className="text-xs font-semibold text-slate-500">
        Not part of cash in hand. Hand these cheques to the office; they count as paid once cleared.
      </p>
      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
              <th className="text-start py-2 pe-3">Cheque</th>
              <th className="text-start py-2 pe-3">Customer</th>
              {canReceive && <th className="text-start py-2 pe-3">Salesperson</th>}
              <th className="text-start py-2 pe-3">Cheque date</th>
              <th className="text-end py-2 pe-3">Amount</th>
              {canReceive && <th className="py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pe-3 font-bold text-slate-800">
                  #{r.chequeNumber || "-"}
                  {r.bankName && <span className="block text-[11px] font-medium text-slate-400">{r.bankName}</span>}
                </td>
                <td className="py-2 pe-3 text-slate-700 font-semibold">{r.companyName}</td>
                {canReceive && <td className="py-2 pe-3 text-slate-500">{r.createdByName || "-"}</td>}
                <td className="py-2 pe-3 text-slate-500">{r.chequeDate ? formatDate(r.chequeDate) : "-"}</td>
                <td className="py-2 pe-3 text-end font-bold text-slate-800">{formatCurrency(r.amountPaid)}</td>
                {canReceive && (
                  <td className="py-2 text-end">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => markReceived(r)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      {busyId === r.id ? "Saving..." : "Received"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
