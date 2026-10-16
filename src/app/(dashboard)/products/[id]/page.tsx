"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Minus,
  Layers,
  X,
} from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { UserCountry } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { ProductInsights } from "@/components/ProductInsights";
import { ProductExpiryLots } from "@/components/ProductExpiryLots";
import { currencyFor, decimalsFor } from "@/lib/currency";

interface ProductDetailData {
  product: {
    id: string;
    productCode?: string;
    sku: string;
    barcode: string;
    name: string;
    category: string;
    price: number;
    sellingPrice: number;
    costPrice?: number;
    unit: string;
    brand: string;
    manufacturer: string;
    description: string;
    isAvailable: boolean;
    createdAt: string;
  };
  stockSummary: {
    uaeStock: number;
    omanStock: number;
    totalStock: number;
  };
  movementStatus: "HIGH MOVING" | "FAST MOVING" | "NORMAL MOVING" | "SLOW MOVING" | "NO RECENT SALES";
  statusReason: string;
  stockStatus: "IN STOCK" | "LOW STOCK" | "OUT OF STOCK";
  stockRisk: string | null;
  salesVelocity: {
    unitsSold7d: number;
    unitsSold30d: number;
    unitsSold90d: number;
    totalUnitsSold: number;
    lastSaleDate: string | null;
    lastCustomer: {
      id: string;
      doctorName: string;
      companyName: string;
      customerName: string;
      date: string;
      quantity: number;
      invoiceNumber: string;
    } | null;
    uniqueCustomersCount: number;
  };
  inventorySummary: {
    openingStock: number;
    stockReceived: number;
    unitsSold: number;
    salesReturns: number;
    adjustmentsIn: number;
    adjustmentsOut: number;
    currentStock: number;
  };
  locationStock: {
    uae: { currentStock: number; unitsSold30d: number; lastSale: string | null } | null;
    oman: { currentStock: number; unitsSold30d: number; lastSale: string | null } | null;
  };
  lastCustomer: {
    id: string;
    doctorName: string;
    companyName: string;
    customerName: string;
    date: string;
    quantity: number;
    invoiceNumber: string;
  } | null;
  recentCustomers: Array<{
    customerId: string;
    doctorName: string;
    companyName: string;
    customerName: string;
    lastPurchaseDate: string;
    quantity: number;
    lastPurchaseNet: number;
    invoiceNumber: string;
  }>;
  recentMovements: Array<{
    id: string;
    date: string;
    createdAt: string;
    movementType: string;
    quantity: number;
    location: string;
    referenceType: string;
    referenceId: string;
    reason: string;
    notes: string;
    createdByName: string;
  }>;
  salesHistory: Array<{
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    date: string;
    customerId: string;
    doctorName: string;
    companyName: string;
    customerName: string;
    country: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;
  const { isSuperAdmin, isAccountant, isSalesperson, profile } = useAuth();
  // There is no global role: stock is managed per country, in the user's own country only.
  const ownCountry: UserCountry = profile?.country === "Oman" ? "Oman" : "UAE";
  const currencyCode = currencyFor(profile?.country);
  const dp = decimalsFor(profile?.country);

  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stock Adjustment Modal states
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjAction, setAdjAction] = useState<"ADD" | "DEDUCT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGE" | "EXPIRY">("ADD");
  const [adjCountry, setAdjCountry] = useState<"UAE" | "Oman">("UAE");
  useEffect(() => {
    setAdjCountry(ownCountry);
  }, [ownCountry]);
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}?t=${Date.now()}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to load product details");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error("Error loading product detail workspace:", err);
      setError(err.message || "Product not found or access denied.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      fetchAnalytics();
    }
  }, [productId]);

  const handleStockAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjQty || isNaN(Number(adjQty)) || Number(adjQty) <= 0) {
      alert("Please enter a valid positive quantity.");
      return;
    }

    setIsSubmittingAdj(true);
    try {
      const res = await fetch("/api/inventory/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          country: adjCountry,
          adjustmentAction: adjAction,
          quantity: Number(adjQty),
          reason: adjReason.trim() || `Manual ${adjAction} by ${profile?.full_name || "Admin"}`,
          notes: adjNotes.trim(),
        }),
      });

      if (res.ok) {
        setIsAdjModalOpen(false);
        setAdjQty("");
        setAdjReason("");
        setAdjNotes("");
        fetchAnalytics();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to process stock adjustment.");
      }
    } catch (err: any) {
      console.error("Error submitting stock adjustment:", err);
      alert(err.message || "Failed to submit stock adjustment.");
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <LoadingSkeleton type="card" count={3} />
        <LoadingSkeleton type="table" count={5} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto font-bold text-2xl">
          !
        </div>
        <h2 className="text-xl font-bold text-slate-900">Product Intelligence Unavailable</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">{error || "Product not found."}</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Products List
        </Link>
      </div>
    );
  }

  const { product, recentMovements } = data;


  return (
    <div className="w-full">
      <PageHeader
        title={product.name}
        description={`Category: ${product.category} · Unit: ${product.unit} ${product.brand ? `· Brand: ${product.brand}` : ""}`}
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: product.name }
        ]}
        action={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Master Price</div>
              <div className="text-2xl font-black text-white font-mono">
                {currencyCode} {product.sellingPrice.toFixed(dp)}
              </div>
            </div>
          </div>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {(isSuperAdmin || isAccountant) && (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                setAdjAction("ADD");
                setIsAdjModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold rounded-xl transition shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Stock
            </button>
            <button
              onClick={() => {
                setAdjAction("DEDUCT");
                setIsAdjModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-extrabold rounded-xl transition shadow-md shadow-slate-800/20 cursor-pointer"
            >
              <Minus className="w-4 h-4" /> Adjust
            </button>
          </div>
        )}

      <ProductExpiryLots productId={productId} canEdit={isSuperAdmin || isAccountant} />

      <ProductInsights productId={productId} />

      {/* RECENT INVENTORY MOVEMENTS LOG */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" /> Recent Inventory Movements Ledger
          </h3>
          <span className="text-xs text-slate-400 font-semibold">{recentMovements.length} Logged Entries</span>
        </div>
        {recentMovements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-5">Movement</th>
                  <th className="py-3 px-5 text-right">Quantity</th>
                  <th className="py-3 px-5">Location</th>
                  <th className="py-3 px-5">Reference</th>
                  <th className="py-3 px-5">Reason / Notes</th>
                  <th className="py-3 px-5">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {recentMovements.map((m) => {
                  const isPositive = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-5 text-slate-500 whitespace-nowrap">
                        {formatDate(m.date)}
                      </td>
                      <td className="py-3 px-5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold tracking-wider">
                          {m.movementType}
                        </span>
                      </td>
                      <td className={`py-3 px-5 text-right font-black ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                        {isPositive ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="py-3 px-5 font-semibold text-slate-700">
                        {m.location}
                      </td>
                      <td className="py-3 px-5 font-mono text-slate-800 font-semibold">
                        {m.referenceId || m.referenceType || "—"}
                      </td>
                      <td className="py-3 px-5 text-slate-600 max-w-xs truncate">
                        {m.reason || m.notes || "—"}
                      </td>
                      <td className="py-3 px-5 text-slate-500 font-medium">
                        {m.createdByName}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 italic">No inventory movements recorded yet.</div>
        )}
      </div>

      {/* SUPER ADMIN STOCK ADJUSTMENT MODAL */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative border border-slate-100">
            <button
              onClick={() => setIsAdjModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-700" /> Stock Adjustment ({product.name})
            </h3>

            <form onSubmit={handleStockAdjustmentSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adjustment Action</label>
                <select
                  value={adjAction}
                  onChange={(e: any) => setAdjAction(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  <option value="ADD">Add Stock (ADJUSTMENT_IN)</option>
                  <option value="DEDUCT">Deduct Stock (ADJUSTMENT_OUT)</option>
                  <option value="DAMAGE">Record Damaged Goods (DAMAGE)</option>
                  <option value="EXPIRY">Record Expired Goods (EXPIRY)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Location / Country</label>
                <select
                  value={adjCountry}
                  onChange={(e: any) => setAdjCountry(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  {ownCountry === "Oman" ? <option value="Oman">Oman Branch</option> : <option value="UAE">UAE Branch</option>}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Quantity ({product.unit}s)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={adjQty}
                  onChange={(e) => setAdjQty(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Reason for adjustment"
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="Additional notes"
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-slate-900 outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdj}
                  className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingAdj ? "Processing..." : "Confirm Stock Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
