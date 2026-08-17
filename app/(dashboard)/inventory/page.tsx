"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  AlertTriangle,
  Boxes,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  SlidersHorizontal,
  History,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ProductStockSummary, InventoryDashboardMetrics, UserCountry } from "@/types";
import { PageHeader } from "@/components/PageHeader";

export default function InventoryDashboardPage() {
  const { profile, permissions } = useAuth();

  const isSuperAdmin = profile?.role === "super_admin";
  const canViewGlobal = profile?.role === "super_admin" || profile?.role === "accountant";
  const isUaeSalesperson = profile?.role === "salesperson" && profile?.country === "UAE";
  const isOmanSalesperson = profile?.role === "salesperson" && profile?.country === "Oman";

  const [summaries, setSummaries] = useState<ProductStockSummary[]>([]);
  const [metrics, setMetrics] = useState<InventoryDashboardMetrics>({
    totalProducts: 0,
    totalStockUnits: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state (Super Admin only)
  const [showOpeningModal, setShowOpeningModal] = useState<boolean>(false);
  const [showReceivingModal, setShowReceivingModal] = useState<boolean>(false);

  // Modal form states
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<UserCountry>("UAE");
  const [quantityInput, setQuantityInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [submittingModal, setSubmittingModal] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchInventoryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory");
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to load inventory");
      }
      const data = await res.json();
      setSummaries(data.summaries || []);
      setMetrics(
        data.metrics || {
          totalProducts: 0,
          totalStockUnits: 0,
          lowStockProducts: 0,
          outOfStockProducts: 0,
        }
      );
    } catch (err: any) {
      console.error("Failed to fetch inventory:", err);
      setError(err.message || "Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
  }, []);

  // Filtered summaries
  const filteredSummaries = summaries.filter((item) => {
    const matchesSearch =
      item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.productCode && item.productCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCountry =
      countryFilter === "ALL" ||
      (countryFilter === "UAE" && item.uaeStock > 0) ||
      (countryFilter === "Oman" && item.omanStock > 0);

    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;

    return matchesSearch && matchesCountry && matchesStatus;
  });

  // Handle Opening Stock or Stock Received submission
  const handleModalSubmit = async (movementType: "OPENING_STOCK" | "STOCK_RECEIVED") => {
    if (!selectedProductId || !quantityInput || Number(quantityInput) <= 0) {
      setModalError("Please select a product and enter a valid positive quantity.");
      return;
    }

    setSubmittingModal(true);
    setModalError(null);

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          country: selectedCountry,
          movementType,
          quantity: Number(quantityInput),
          reason: reasonInput,
          notes: notesInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save stock movement");
      }

      // Reset modal and refresh table
      setShowOpeningModal(false);
      setShowReceivingModal(false);
      setSelectedProductId("");
      setQuantityInput("");
      setReasonInput("");
      setNotesInput("");
      await fetchInventoryData();
    } catch (err: any) {
      setModalError(err.message || "Failed to record movement");
    } finally {
      setSubmittingModal(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <PageHeader
        title="Inventory & Stock Master"
        description="Real-time stock control, multi-country warehouse isolation & movement history."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/inventory/movements"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition cursor-pointer backdrop-blur-xs"
            >
              <History className="w-4 h-4" />
              Stock Movements Log
            </Link>

            {isSuperAdmin && (
              <>
                <Link
                  href="/inventory/adjustments"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition cursor-pointer backdrop-blur-xs"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Stock Adjustment
                </Link>

                <button
                  onClick={() => {
                    setSelectedProductId(summaries[0]?.productId || "");
                    setModalError(null);
                    setShowReceivingModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  + Stock Received
                </button>

                <button
                  onClick={() => {
                    setSelectedProductId(summaries[0]?.productId || "");
                    setModalError(null);
                    setShowOpeningModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#61989B] hover:bg-[#4e7d80] text-white font-extrabold text-sm transition shadow-md shadow-[#61989B]/20 cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  + Opening Stock
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto space-y-6 pb-12">

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Products</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.totalProducts}</h3>
          </div>
          <span className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Package className="w-6 h-6" />
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {canViewGlobal ? "Total Stock Units" : (isOmanSalesperson ? "Oman Stock Units" : "UAE Stock Units")}
            </p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.totalStockUnits.toLocaleString()}</h3>
          </div>
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Boxes className="w-6 h-6" />
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Stock Products</p>
            <h3 className="text-2xl font-extrabold text-amber-600 mt-1">{metrics.lowStockProducts}</h3>
          </div>
          <span className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Out of Stock</p>
            <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{metrics.outOfStockProducts}</h3>
          </div>
          <span className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <TrendingDown className="w-6 h-6" />
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search code, product, category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition duration-150"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="IN STOCK">In Stock</option>
              <option value="LOW STOCK">Low Stock</option>
              <option value="OUT OF STOCK">Out of Stock</option>
            </select>
          </div>

          <button
            onClick={fetchInventoryData}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition duration-150"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stock Master Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
            Loading live stock calculation engine...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 font-medium">{error}</div>
        ) : filteredSummaries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No products found matching filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Product Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4 text-right">Master Price</th>
                  {(canViewGlobal || isUaeSalesperson) && <th className="py-3.5 px-4 text-right">UAE Stock</th>}
                  {(canViewGlobal || isOmanSalesperson) && <th className="py-3.5 px-4 text-right">Oman Stock</th>}
                  {canViewGlobal && <th className="py-3.5 px-4 text-right">Total Stock</th>}
                  <th className="py-3.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredSummaries.map((item) => (
                  <tr key={item.productId} className="hover:bg-slate-50/50 transition duration-150">
                    <td className="py-3 px-4 font-mono text-slate-500 font-semibold">
                      {item.productCode || "—"}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {item.productName}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{item.category}</td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      {item.masterPrice.toFixed(2)}
                    </td>
                    {(canViewGlobal || isUaeSalesperson) && (
                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        {item.uaeStock}
                      </td>
                    )}
                    {(canViewGlobal || isOmanSalesperson) && (
                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        {item.omanStock}
                      </td>
                    )}
                    {canViewGlobal && (
                      <td className="py-3 px-4 text-right font-extrabold text-indigo-900 text-sm">
                        {item.totalStock} <span className="text-[10px] font-normal text-slate-400">{item.unit}s</span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                      {item.status === "IN STOCK" && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          IN STOCK
                        </span>
                      )}
                      {item.status === "LOW STOCK" && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                          LOW STOCK
                        </span>
                      )}
                      {item.status === "OUT OF STOCK" && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                          OUT OF STOCK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Opening Stock Modal */}
      {showOpeningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Enter Opening Stock</h3>
            <p className="text-xs text-slate-500 mb-4">
              Physical inventory count at the start of tracking. Does not generate fake purchase invoices.
            </p>

            {modalError && (
              <div className="p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {modalError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                >
                  {summaries.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.productName} ({p.productCode || "No Code"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Warehouse Location</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value as UserCountry)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="UAE">UAE</option>
                    <option value="Oman">Oman</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Opening Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 100"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason / Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Physical inventory audit"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional audit comments..."
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOpeningModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition duration-150"
              >
                Cancel
              </button>
              <button
                onClick={() => handleModalSubmit("OPENING_STOCK")}
                disabled={submittingModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition duration-150 disabled:opacity-50"
              >
                {submittingModal ? "Saving..." : "Save Opening Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Received Modal */}
      {showReceivingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Record Stock Received</h3>
            <p className="text-xs text-slate-500 mb-4">
              Add new inventory received from supplier shipments.
            </p>

            {modalError && (
              <div className="p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {modalError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                >
                  {summaries.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.productName} ({p.productCode || "No Code"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Destination Location</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value as UserCountry)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="UAE">UAE Warehouse</option>
                    <option value="Oman">Oman Warehouse</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Received Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 500"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Supplier Shipment / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Supplier Shipment #409"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Delivery receipt notes..."
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowReceivingModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition duration-150"
              >
                Cancel
              </button>
              <button
                onClick={() => handleModalSubmit("STOCK_RECEIVED")}
                disabled={submittingModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition duration-150 disabled:opacity-50"
              >
                {submittingModal ? "Processing..." : "Add Stock Received"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
