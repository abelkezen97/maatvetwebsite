"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ProductStockSummary, UserCountry } from "@/types";

export default function StockAdjustmentPage() {
  const router = useRouter();
  const { profile, permissions } = useAuth();

  const isSuperAdmin = profile?.role === "super_admin";

  const [products, setProducts] = useState<ProductStockSummary[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);

  // Form State
  const [productId, setProductId] = useState<string>("");
  const [location, setLocation] = useState<UserCountry>("UAE");
  const [adjustmentAction, setAdjustmentAction] = useState<"ADD" | "DEDUCT" | "DAMAGE" | "EXPIRY" | "SALE_RETURN">("DEDUCT");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/inventory");
        if (res.ok) {
          const data = await res.json();
          const list: ProductStockSummary[] = data.summaries || [];
          setProducts(list);
          if (list.length > 0) {
            setProductId(list[0].productId);
          }
        }
      } catch (err) {
        console.error("Failed to load products for adjustment:", err);
      } finally {
        setLoadingProducts(false);
      }
    }
    loadData();
  }, []);

  const selectedProductObj = products.find((p) => p.productId === productId);
  const availableStock = selectedProductObj
    ? location === "Oman"
      ? selectedProductObj.omanStock
      : selectedProductObj.uaeStock
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productId) {
      setError("Please select a product.");
      return;
    }
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      setError("Please enter a valid positive quantity.");
      return;
    }
    if (!reason.trim()) {
      setError("Please specify a reason for this stock adjustment.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/inventory/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          country: location,
          adjustmentAction,
          quantity: numQty,
          reason,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit stock adjustment");
      }

      setSuccessMessage(`Stock adjustment recorded successfully! Movement ID: ${data.movement?.id}`);
      setQuantity("");
      setReason("");
      setNotes("");

      // Refresh product stock list
      const refreshRes = await fetch("/api/inventory");
      if (refreshRes.ok) {
        const refData = await refreshRes.json();
        setProducts(refData.summaries || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process stock adjustment");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-100 shadow-sm text-center">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-500 mb-6">
          Only Super Admin has authority to perform manual stock adjustments.
        </p>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Inventory Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <SlidersHorizontal className="w-6 h-6 text-indigo-600" />
              Stock Adjustment Form
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Record physical stock corrections, damage, expiry, or manual inventory additions.
            </p>
          </div>
        </div>
      </div>

      {/* Adjustment Form Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        {error && (
          <div className="p-4 mb-6 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-4 mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMessage}
          </div>
        )}

        {loadingProducts ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            Loading product catalog...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            {/* Product selection & stock indicator */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Select Product *</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-medium"
              >
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productName} ({p.productCode || "No SKU"}) — Master Price: {p.masterPrice.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {/* Location & Available Stock Indicator */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Warehouse Location *</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as UserCountry)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="UAE">UAE Warehouse</option>
                  <option value="Oman">Oman Warehouse</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-center">
                <span className="text-[11px] font-semibold text-slate-500">Current Available Stock ({location}):</span>
                <span className="text-xl font-extrabold text-indigo-900 mt-0.5">
                  {availableStock} <span className="text-xs font-normal text-slate-500">{selectedProductObj?.unit || "units"}</span>
                </span>
              </div>
            </div>

            {/* Adjustment Type */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Adjustment Action *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentAction("DEDUCT")}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    adjustmentAction === "DEDUCT"
                      ? "bg-rose-50 border-rose-300 text-rose-700 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>Deduct Stock</span>
                  <span className="text-[10px] font-normal opacity-70">(-qty)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdjustmentAction("ADD")}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    adjustmentAction === "ADD"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>Add Stock</span>
                  <span className="text-[10px] font-normal opacity-70">(+qty)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdjustmentAction("DAMAGE")}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    adjustmentAction === "DAMAGE"
                      ? "bg-amber-50 border-amber-300 text-amber-800 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>Damaged Stock</span>
                  <span className="text-[10px] font-normal opacity-70">(-qty)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdjustmentAction("EXPIRY")}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    adjustmentAction === "EXPIRY"
                      ? "bg-purple-50 border-purple-300 text-purple-800 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>Expired Stock</span>
                  <span className="text-[10px] font-normal opacity-70">(-qty)</span>
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Adjustment Quantity *</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Reason for Adjustment *</label>
              <input
                type="text"
                placeholder="e.g. Damaged during warehouse handling / Stock audit correction"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Additional Audit Notes</label>
              <textarea
                rows={3}
                placeholder="Details of audit or supervisor authorization..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Link
                href="/inventory"
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition disabled:opacity-50"
              >
                {submitting ? "Submitting Adjustment..." : "Submit Stock Adjustment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
