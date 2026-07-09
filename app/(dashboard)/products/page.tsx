"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Product } from "@/types";
import { Package, RefreshCw, Plus, X, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function ProductsPage() {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncSource, setSyncSource] = useState("");

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products?t=${Date.now()}`);
      const data = await res.json();
      setProducts(data.products || []);
      setSyncSource(data.source || "fallback");
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("name", formName);
    formData.append("price", formPrice || "0");

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setFormSuccess(true);
        setTimeout(() => {
          setIsModalOpen(false);
          setFormName("");
          setFormPrice("");
          setFormSuccess(false);
          loadProducts();
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to submit product:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      header: "Product Details",
      accessor: (row: Product) => (
        <div className="flex items-center gap-3 py-1">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
            <Package className="w-5 h-5 stroke-[1.5]" />
          </div>
          <div>
            <div className="font-bold text-slate-800 line-clamp-1">{row.name}</div>
            <div className="text-[11px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wide">
              {row.category}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Unit Price",
      accessor: (row: Product) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900">
            {row.price > 0 ? `AED ${row.price.toFixed(2)}` : "Contract Price"}
          </span>
          {row.price10 && row.price10 < row.price && (
            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">
              10+ Pcs: AED {row.price10.toFixed(2)}
            </span>
          )}
        </div>
      ),
      className: "w-44",
    },
    {
      header: "Availability",
      accessor: (row: Product) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
            row.isAvailable !== false
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          {row.isAvailable !== false
            ? (language === "en" ? "Available" : "متوفر")
            : (language === "en" ? "Out of Stock" : "غير متوفر")}
        </span>
      ),
      className: "w-40",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products Catalog"
        description="Live inventory records synced from central databases and clinic sheets."
        action={
          <button
            onClick={loadProducts}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition focus:outline-none focus:ring-2 focus:ring-accent/15 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Sync Catalog
          </button>
        }
      />

      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <SearchInput
          placeholder="Search by SKU, product name, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
          className="max-w-md"
        />
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            {filteredProducts.length} Items
          </div>
        </div>
      </div>

      {/* Inventory table / loader */}
      {loading ? (
        <LoadingSkeleton type="table" count={5} />
      ) : (
        <DataTable
          data={filteredProducts}
          columns={columns}
          keyExtractor={(row) => row.id}
          emptyTitle="No veterinary products found"
          emptyDescription="Try adjusting your keywords or sync the catalog database."
        />
      )}

      {/* Add Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            {formSuccess ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4 animate-bounce" />
                <h3 className="text-lg font-bold text-slate-900">Medicine Added!</h3>
                <p className="text-sm text-slate-500 mt-1">Inventory catalog has been updated.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                  <h3 className="text-lg font-bold text-slate-900">Add New Medicine</h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* Name field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Medicine Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Meloxicam 20mg/ml"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  {/* Price field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Unit Price (AED)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 45.00"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  {/* Modal Action buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-5 py-3 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !formName}
                      className="px-5 py-3 text-sm font-bold text-white bg-[#1B2A4A] hover:bg-[#15223c] rounded-xl transition disabled:opacity-50"
                    >
                      {isSubmitting ? "Adding..." : "Add Product"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
