"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, X, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { CreditNote, CreditNoteStatus } from "@/types";
import { formatMoney } from "@/lib/currency";

const FILTERS: Array<"All" | CreditNoteStatus> = ["All", "Pending", "Approved", "Rejected"];

const STATUS_STYLE: Record<CreditNoteStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function CreditNotesPage() {
  const { isSuperAdmin, isAccountant } = useAuth();
  const isStaff = isSuperAdmin || isAccountant;

  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [filter, setFilter] = useState<"All" | CreditNoteStatus>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<CreditNote | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/credit-notes?t=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load credit notes");
      setNotes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => (filter === "All" ? notes : notes.filter((n) => n.status === filter)), [notes, filter]);
  const pendingCount = notes.filter((n) => n.status === "Pending").length;

  const act = async (note: CreditNote, action: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/credit-notes/${note.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: action === "reject" ? rejectReason.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the credit note");
      setMessage(
        action === "approve"
          ? `${note.creditNoteNumber} approved. Invoice balance and stock updated.`
          : `${note.creditNoteNumber} rejected.`
      );
      setOpen(null);
      setRejectReason("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Credit Notes"
        description="Returns and price corrections against invoices"
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1400px] mx-auto space-y-5 text-start">
        <p className="text-xs font-semibold text-slate-500">
          To create one, open Invoices → Actions → <span className="font-bold">Credit note / return</span>.
        </p>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            <span className="font-semibold">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}
        {message && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 font-bold">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</span>
            <button onClick={() => setMessage(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition cursor-pointer ${
                filter === f ? "bg-[#1B2A4A] text-white border-[#1B2A4A]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {f}
              {f === "Pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                <th className="text-start p-4">Number</th>
                <th className="text-start p-4">Date</th>
                <th className="text-start p-4">Invoice</th>
                <th className="text-start p-4">Customer</th>
                <th className="text-start p-4">Reason</th>
                <th className="text-end p-4">Total</th>
                <th className="text-start p-4">Status</th>
                <th className="text-start p-4">Requested by</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="p-6 text-center text-slate-500 font-semibold">Loading...</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-slate-500 font-semibold">No credit notes.</td></tr>
              ) : (
                shown.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/60">
                    <td className="p-4 font-bold text-[#1B2A4A]">{n.creditNoteNumber}</td>
                    <td className="p-4 text-slate-600">{n.creditDate}</td>
                    <td className="p-4 text-slate-700 font-semibold">{n.invoiceNumber || "—"}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{n.companyName || "—"}</div>
                      {n.customerName && <div className="text-xs text-slate-500">{n.customerName}</div>}
                    </td>
                    <td className="p-4 text-slate-600">{n.reason}</td>
                    <td className="p-4 text-end font-bold text-slate-800">{formatMoney(n.total, n.country)}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_STYLE[n.status as CreditNoteStatus]}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600">{n.requestedByName || "—"}</td>
                    <td className="p-4 text-end">
                      <button
                        onClick={() => { setOpen(n); setRejectReason(""); }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {isStaff && n.status === "Pending" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-[#1B2A4A]">{open.creditNoteNumber}</h3>
                <p className="text-xs font-semibold text-slate-500">
                  Invoice {open.invoiceNumber} · {open.companyName} · {open.reason}
                </p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                  <th className="text-start py-2">Product</th>
                  <th className="text-end py-2">Qty</th>
                  <th className="text-end py-2">Unit</th>
                  <th className="text-end py-2">Total</th>
                  <th className="text-start py-2 ps-3">Goods</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(open.items || []).map((it) => (
                  <tr key={it.id}>
                    <td className="py-2 font-semibold text-slate-800">{it.productName || "Product"}</td>
                    <td className="py-2 text-end">{it.quantity}</td>
                    <td className="py-2 text-end">{formatMoney(it.unitPrice, open.country)}</td>
                    <td className="py-2 text-end font-bold">{formatMoney(it.lineTotal, open.country)}</td>
                    <td className="py-2 ps-3 text-xs font-bold">
                      {it.restock ? <span className="text-emerald-700">Back to stock</span> : <span className="text-rose-700">Written off</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between items-center border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total credit</span>
              <span className="text-xl font-black text-[#1B2A4A]">{formatMoney(open.total, open.country)}</span>
            </div>

            {open.notes && <p className="text-sm text-slate-600"><span className="font-bold">Notes:</span> {open.notes}</p>}
            {open.status === "Rejected" && open.rejectionReason && (
              <p className="text-sm text-rose-700"><span className="font-bold">Rejected:</span> {open.rejectionReason}</p>
            )}

            {isStaff && open.status === "Pending" && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (only needed if rejecting)"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => act(open, "reject")}
                    disabled={busy}
                    className="px-5 py-2.5 rounded-xl border border-rose-200 text-rose-700 font-bold text-sm hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => act(open, "approve")}
                    disabled={busy}
                    className="px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white font-extrabold text-sm hover:bg-[#15223c] disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? "Saving..." : "Approve"}
                  </button>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  Approving lowers what the customer owes on this invoice (any excess becomes customer credit) and returns "Back to stock" items to inventory.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
