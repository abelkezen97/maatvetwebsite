"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { History, ArrowLeft, RefreshCw, Filter, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { InventoryMovement } from "@/types";
import { PageHeader } from "@/components/PageHeader";

export default function StockMovementsPage() {
  const { profile } = useAuth();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");

  const fetchMovements = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/inventory/movements?limit=200";
      if (typeFilter !== "ALL") url += `&movementType=${typeFilter}`;
      if (countryFilter !== "ALL") url += `&country=${countryFilter}`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load movement history");
      }
      const data = await res.json();
      setMovements(data || []);
    } catch (err: any) {
      console.error("Error fetching movement history:", err);
      setError(err.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [typeFilter, countryFilter]);

  const filteredMovements = movements.filter((m) => {
    const term = searchTerm.toLowerCase();
    return (
      (m.productName && m.productName.toLowerCase().includes(term)) ||
      (m.productCode && m.productCode.toLowerCase().includes(term)) ||
      (m.reason && m.reason.toLowerCase().includes(term)) ||
      (m.referenceId && m.referenceId.toLowerCase().includes(term)) ||
      (m.createdByName && m.createdByName.toLowerCase().includes(term))
    );
  });

  return (
    <div className="w-full">
      {/* Page Header */}
      <PageHeader
        title="Stock Movement History"
        description="Permanent immutable inventory audit ledger. Every stock entry, sale, or deduction is logged."
        action={
          <Link
            href="/inventory"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-white text-[#1B2A4A] font-extrabold hover:bg-slate-100 text-sm transition shadow-md cursor-pointer shrink-0"
          >
            View Stock Master
          </Link>
        }
      />

      <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto space-y-6 pb-12">

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search product, reference, user, reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {(profile?.role === "super_admin" || profile?.role === "accountant") && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Location:</span>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Countries</option>
                <option value="UAE">UAE</option>
                <option value="Oman">Oman</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Movement Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Types</option>
              <option value="OPENING_STOCK">OPENING_STOCK</option>
              <option value="STOCK_RECEIVED">STOCK_RECEIVED</option>
              <option value="SALE">SALE</option>
              <option value="SALE_RETURN">SALE_RETURN</option>
              <option value="ADJUSTMENT_IN">ADJUSTMENT_IN</option>
              <option value="ADJUSTMENT_OUT">ADJUSTMENT_OUT</option>
              <option value="DAMAGE">DAMAGE</option>
              <option value="EXPIRY">EXPIRY</option>
            </select>
          </div>

          <button
            onClick={fetchMovements}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            title="Refresh History"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            Loading stock movement ledger...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 font-medium text-xs">{error}</div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No stock movements found matching filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Product</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Movement Type</th>
                  <th className="py-3.5 px-4 text-right">Quantity</th>
                  <th className="py-3.5 px-4">Reference</th>
                  <th className="py-3.5 px-4">Reason / Notes</th>
                  <th className="py-3.5 px-4">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredMovements.map((m) => {
                  const isPositive = m.quantity > 0;
                  const qtyStr = isPositive ? `+${m.quantity}` : `${m.quantity}`;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {m.createdAt ? new Date(m.createdAt).toLocaleString("en-GB") : "—"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {m.productName}
                        {m.productCode && (
                          <span className="block text-[10px] font-mono text-slate-400 font-normal">
                            {m.productCode}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">{m.country}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide ${
                            m.movementType === "OPENING_STOCK" || m.movementType === "STOCK_RECEIVED"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : m.movementType === "SALE"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : m.movementType === "SALE_RETURN"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : m.movementType === "DAMAGE" || m.movementType === "EXPIRY"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {m.movementType}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-extrabold text-sm ${
                          isPositive ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {qtyStr}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                        {m.referenceId || m.referenceType || "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {m.reason || m.notes || "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {m.createdByName || "System"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
