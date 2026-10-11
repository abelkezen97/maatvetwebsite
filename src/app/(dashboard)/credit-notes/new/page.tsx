"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { CREDIT_NOTE_REASONS } from "@/types";
import { currencyFor, decimalsFor } from "@/lib/currency";

interface ReturnableLine {
  invoiceItemId: string;
  productId: string;
  productName: string;
  invoicedQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPrice: number;
}

interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  customerId: string;
  companyName?: string;
  customerName?: string;
  country: string;
  grandTotal: number;
  date?: string;
}

function NewCreditNoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get("invoiceId") || "";
  const { isSuperAdmin, isAccountant } = useAuth();
  const isStaff = isSuperAdmin || isAccountant;

  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [lines, setLines] = useState<ReturnableLine[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<string>(CREDIT_NOTE_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setError("Open this page from an invoice (Invoices → Credit note / return).");
      setLoading(false);
      return;
    }
    fetch(`/api/invoices/${invoiceId}/returnable`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Could not load the invoice");
        setInvoice(data.invoice);
        setLines(data.lines || []);
        const r0: Record<string, boolean> = {};
        (data.lines || []).forEach((l: ReturnableLine) => (r0[l.invoiceItemId] = true));
        setRestock(r0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  // Damaged / expired goods are written off by default; other reasons go back to stock.
  useEffect(() => {
    const writeOff = reason === "Damaged" || reason === "Expired";
    const next: Record<string, boolean> = {};
    lines.forEach((l) => (next[l.invoiceItemId] = !writeOff));
    setRestock(next);
  }, [reason, lines]);

  const country = invoice?.country;
  const cur = currencyFor(country);
  const dp = decimalsFor(country);

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = Math.floor(parseFloat(qty[l.invoiceItemId] || "") || 0);
        return sum + Math.max(0, q) * l.unitPrice;
      }, 0),
    [lines, qty]
  );

  const tooMany = lines.filter((l) => (Math.floor(parseFloat(qty[l.invoiceItemId] || "") || 0)) > l.returnableQuantity);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (tooMany.length > 0) {
      setError(`${tooMany[0].productName}: only ${tooMany[0].returnableQuantity} can be credited.`);
      return;
    }
    const items = lines
      .map((l) => ({
        invoiceItemId: l.invoiceItemId,
        quantity: Math.floor(parseFloat(qty[l.invoiceItemId] || "") || 0),
        restock: Boolean(restock[l.invoiceItemId]),
      }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, reason, notes: notes.trim() || undefined, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the credit note");
      setDone(
        data.creditNote.status === "Approved"
          ? `Credit note ${data.creditNote.creditNoteNumber} approved. The invoice and stock are updated.`
          : `Credit note ${data.creditNote.creditNoteNumber} sent for approval.`
      );
      setTimeout(() => router.push("/credit-notes"), 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="New Credit Note"
        description={invoice ? `Against invoice ${invoice.invoiceNumber} · ${invoice.companyName || ""}` : "Return goods or credit part of an invoice"}
        breadcrumbs={[{ label: "Credit Notes", href: "/credit-notes" }, { label: "New" }]}
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1200px] mx-auto space-y-5 text-start">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            <span className="font-semibold">{error}</span>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {done && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{done}</span>
          </div>
        )}

        {loading ? (
          <p className="text-sm font-semibold text-slate-500">Loading invoice...</p>
        ) : invoice ? (
          <form onSubmit={submit} className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">1. Items coming back</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                      <th className="text-start py-2 pe-3">Product</th>
                      <th className="text-end py-2 pe-3">Invoiced</th>
                      <th className="text-end py-2 pe-3">Already credited</th>
                      <th className="text-end py-2 pe-3">Price paid ({cur})</th>
                      <th className="text-end py-2 pe-3 w-32">Quantity</th>
                      <th className="text-center py-2 pe-3">Back to stock</th>
                      <th className="text-end py-2">Credit ({cur})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => {
                      const q = Math.floor(parseFloat(qty[l.invoiceItemId] || "") || 0);
                      const over = q > l.returnableQuantity;
                      return (
                        <tr key={l.invoiceItemId} className={l.returnableQuantity === 0 ? "opacity-50" : ""}>
                          <td className="py-2.5 pe-3 font-bold text-slate-800">{l.productName}</td>
                          <td className="py-2.5 pe-3 text-end text-slate-600">{l.invoicedQuantity}</td>
                          <td className="py-2.5 pe-3 text-end text-slate-500">{l.returnedQuantity}</td>
                          <td className="py-2.5 pe-3 text-end text-slate-600">{l.unitPrice.toFixed(dp)}</td>
                          <td className="py-2.5 pe-3 text-end">
                            <input
                              type="number"
                              min="0"
                              max={l.returnableQuantity}
                              step="1"
                              disabled={l.returnableQuantity === 0}
                              value={qty[l.invoiceItemId] ?? ""}
                              placeholder="0"
                              onChange={(e) => setQty((prev) => ({ ...prev, [l.invoiceItemId]: e.target.value }))}
                              className={`w-24 px-3 py-2 text-end bg-white border rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-accent/15 ${over ? "border-rose-400 text-rose-600" : "border-slate-200 text-slate-800"}`}
                            />
                            <div className="text-[10px] text-slate-400 font-semibold mt-0.5">max {l.returnableQuantity}</div>
                          </td>
                          <td className="py-2.5 pe-3 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(restock[l.invoiceItemId])}
                              onChange={(e) => setRestock((prev) => ({ ...prev, [l.invoiceItemId]: e.target.checked }))}
                              aria-label={`Return ${l.productName} to stock`}
                            />
                          </td>
                          <td className="py-2.5 text-end font-bold text-slate-800">{(Math.max(0, q) * l.unitPrice).toFixed(dp)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                Untick "Back to stock" for goods that can't be resold (damaged or expired); they are written off.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">2. Reason *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/15"
                >
                  {CREDIT_NOTE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 3 bottles broken in delivery"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Credit note total</span>
                <span className="text-2xl font-black text-[#1B2A4A]">{cur} {total.toFixed(dp)}</span>
                <span className="block text-xs font-semibold text-slate-500 mt-1">
                  {isStaff
                    ? "Takes effect immediately: lowers what the customer owes on this invoice; any excess becomes customer credit."
                    : "Goes to an admin or accountant for approval. Nothing changes until it's approved."}
                </span>
              </div>
              <button
                type="submit"
                disabled={saving || total <= 0 || Boolean(done)}
                className="px-6 py-3.5 bg-[#1B2A4A] hover:bg-[#15223c] text-white font-extrabold rounded-xl transition shadow-lg disabled:opacity-50 cursor-pointer text-sm"
              >
                {saving ? "Saving..." : isStaff ? "Create Credit Note" : "Send for Approval"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export default function NewCreditNotePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm font-semibold text-slate-500">Loading...</p>}>
      <NewCreditNoteForm />
    </Suspense>
  );
}
