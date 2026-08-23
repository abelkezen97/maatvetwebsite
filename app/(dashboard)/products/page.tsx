"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Product, ProductCategory, ProductStockSummary } from "@/types";
import {
  Package,
  RefreshCw,
  Plus,
  X,
  CheckCircle2,
  Eye,
  Edit2,
  Trash2,
  Filter,
  Layers,
  Ban,
  AlertTriangle,
  DollarSign,
  Info,
  Download,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateProductsPdf } from "@/lib/utils/exportProductsPdf";

export default function ProductsPage() {
  const router = useRouter();
  const { t, translateBusinessText, formatCurrency } = useLanguage();
  const { profile, isSuperAdmin, isAccountant, isSalesperson } = useAuth();

  // Primary data states
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [stockSummaries, setStockSummaries] = useState<ProductStockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedBrand, setSelectedBrand] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL"); // ALL, ACTIVE, INACTIVE

  // Drawer & Modal states
  const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPriceProduct, setEditingPriceProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Super Admin Form field states
  const [formName, setFormName] = useState("");
  const [formProductCode, setFormProductCode] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formCategory, setFormCategory] = useState("General");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formUnit, setFormUnit] = useState("Item");
  const [formDescription, setFormDescription] = useState("");
  const [formSellingPrice, setFormSellingPrice] = useState("");
  const [formPrice10, setFormPrice10] = useState("");
  const [formPrice50, setFormPrice50] = useState("");
  const [formPrice100, setFormPrice100] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Accountant Price Edit Form state
  const [accSellingPrice, setAccSellingPrice] = useState("");
  const [accPrice10, setAccPrice10] = useState("");
  const [accPrice50, setAccPrice50] = useState("");
  const [accPrice100, setAccPrice100] = useState("");

  // Category Creation state
  const [newCategoryName, setNewCategoryName] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  // Load products, categories & inventory stock from Supabase API
  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, invRes] = await Promise.all([
        fetch(`/api/products?t=${Date.now()}`),
        fetch(`/api/categories?t=${Date.now()}`),
        fetch(`/api/inventory?t=${Date.now()}`),
      ]);

      const prodData = await prodRes.json();
      const catData = await catRes.json();
      const invData = await invRes.json();

      setProducts(prodData.products || []);
      setCategories(catData.categories || []);
      setStockSummaries(invData.summaries || []);
    } catch (err) {
      console.error("Failed to load products database:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // PDF Export Handler
  const handleDownloadPdf = async () => {
    setIsPdfGenerating(true);
    try {
      const stockMap = new Map<string, ProductStockSummary>();
      stockSummaries.forEach((s) => {
        stockMap.set(s.productId, s);
      });

      const pdfProductsList: ProductStockSummary[] = filteredProducts.map((p) => {
        const stockEntry = stockMap.get(p.id);
        const uaeStock = stockEntry ? stockEntry.uaeStock : 0;
        const omanStock = stockEntry ? stockEntry.omanStock : 0;
        const totalStock = stockEntry ? stockEntry.totalStock : uaeStock + omanStock;
        const status = stockEntry
          ? stockEntry.status
          : totalStock > 10
          ? "IN STOCK"
          : totalStock > 0
          ? "LOW STOCK"
          : "OUT OF STOCK";

        return {
          productId: p.id,
          productCode: p.sku || p.productCode || "—",
          productName: p.name,
          category: p.category || "General",
          masterPrice: p.price ?? p.sellingPrice ?? 0,
          unit: p.unit || "Item",
          uaeStock,
          omanStock,
          totalStock,
          status,
        };
      });

      generateProductsPdf({
        products: pdfProductsList,
        userRole: profile?.role,
        userCountry: profile?.country,
        searchFilter: searchQuery,
        categoryFilter: selectedCategory,
      });
    } catch (error) {
      console.error("Error generating Products PDF:", error);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // Filtered products logic
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Global Search
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.brand && p.brand.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query));

      // Category filter
      const matchesCategory =
        selectedCategory === "ALL" || p.category === selectedCategory || p.categoryId === selectedCategory;

      // Brand filter
      const matchesBrand = selectedBrand === "ALL" || p.brand === selectedBrand;

      // Status filter
      const matchesStatus =
        selectedStatus === "ALL" ||
        (selectedStatus === "ACTIVE" && p.isAvailable !== false) ||
        (selectedStatus === "INACTIVE" && p.isAvailable === false);

      return matchesSearch && matchesCategory && matchesBrand && matchesStatus;
    });
  }, [products, searchQuery, selectedCategory, selectedBrand, selectedStatus]);

  // Handlers for Add/Edit/Delete product
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormName("");
    setFormProductCode("");
    setFormSku("");
    setFormBarcode("");
    setFormCategory("General");
    setFormCategoryId("");
    setFormBrand("");
    setFormUnit("Item");
    setFormDescription("");
    setFormSellingPrice("");
    setFormPrice10("");
    setFormPrice50("");
    setFormPrice100("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name || "");
    setFormProductCode(product.productCode || "");
    setFormSku(product.sku || "");
    setFormBarcode(product.barcode || "");
    setFormCategory(product.category || "General");
    setFormCategoryId(product.categoryId || "");
    setFormBrand(product.brand || "");
    setFormUnit(product.unit || "Item");
    setFormDescription(product.description || "");
    setFormSellingPrice(String(product.price ?? product.sellingPrice ?? ""));
    setFormPrice10(product.price10 ? String(product.price10) : "");
    setFormPrice50(product.price50 ? String(product.price50) : "");
    setFormPrice100(product.price100 ? String(product.price100) : "");
    setFormIsActive(product.isAvailable !== false);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        name: formName.trim(),
        productCode: formProductCode.trim(),
        sku: formSku.trim(),
        barcode: formBarcode.trim(),
        category: formCategory,
        categoryId: formCategoryId || undefined,
        brand: formBrand.trim(),
        unit: formUnit,
        description: formDescription.trim(),
        sellingPrice: Number(formSellingPrice) || 0,
        price10: formPrice10 ? Number(formPrice10) : undefined,
        price50: formPrice50 ? Number(formPrice50) : undefined,
        price100: formPrice100 ? Number(formPrice100) : undefined,
        isAvailable: formIsActive,
      };

      const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
      const method = editingProduct ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save product");
      }
    } catch (err: any) {
      console.error("Error saving product:", err);
      alert(err.message || "Failed to save product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      if (res.ok) {
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete product");
      }
    } catch (err: any) {
      console.error("Failed to delete product:", err);
    }
  };

  // Table Columns Definition
  const columns = [
    {
      header: t("medName") || "Product",
      accessor: (row: Product) => (
        <div className="flex items-center gap-3 py-1 min-w-[200px]">
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 shrink-0 shadow-xs">
            <Package className="w-5 h-5 stroke-[1.5]" />
          </div>
          <div>
            <Link
              href={`/products/${row.id}`}
              className="font-bold text-slate-900 line-clamp-1 hover:text-accent transition cursor-pointer"
            >
              {translateBusinessText(row.name)}
            </Link>
            {row.description && (
              <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{translateBusinessText(row.description)}</div>
            )}
          </div>
        </div>
      ),
      className: "min-w-[220px]",
    },
    {
      header: t("categories") || "Category",
      accessor: (row: Product) => (
        <span className="inline-flex items-center text-xs font-semibold text-slate-700 bg-slate-100/90 border border-slate-200/80 px-2.5 py-1 rounded-lg whitespace-nowrap shadow-2xs">
          {translateBusinessText(row.category)}
        </span>
      ),
      className: "whitespace-nowrap min-w-[170px]",
    },
    {
      header: t("unitPrice") || "Selling Price",
      accessor: (row: Product) => (
        <span className="font-bold text-slate-900 text-xs whitespace-nowrap">
          {formatCurrency(row.price)}
        </span>
      ),
      className: "whitespace-nowrap min-w-[120px]",
    },
    {
      header: t("statusCol") || "Status",
      accessor: (row: Product) => (
        <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${
          row.isAvailable !== false
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {row.isAvailable !== false ? t("statusActive") : t("statusInactive")}
        </span>
      ),
      className: "whitespace-nowrap min-w-[100px]",
    },
    {
      header: t("actionsCol") || "Actions",
      accessor: (row: Product) => (
        <div className="flex items-center gap-1.5 justify-end">
          <Link
            href={`/products/${row.id}`}
            title={t("view") || "View Product"}
            className="p-2 rounded-xl text-slate-500 hover:text-accent hover:bg-slate-100 transition duration-150 cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </Link>
          {isSuperAdmin && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEditModal(row);
                }}
                title="Edit Product"
                className="p-2 rounded-xl text-slate-500 hover:text-accent hover:bg-slate-100 transition duration-150 cursor-pointer"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteProduct(row.id);
                }}
                title="Delete Product"
                className="p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition duration-150 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
      className: "w-36 text-center",
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title={t("productsTitle")}
        description={t("productsDesc")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {isSuperAdmin && (
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#61989B] hover:bg-[#4b7a7c] text-white font-extrabold text-sm transition shadow-md shadow-[#61989B]/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Add Product
              </button>
            )}

            <button
              onClick={handleDownloadPdf}
              disabled={isPdfGenerating || loading || products.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              title="Download Full Products & Stock Catalog as PDF"
            >
              <Download className={`w-4 h-4 ${isPdfGenerating ? "animate-bounce" : ""}`} />
              {isPdfGenerating ? "Generating PDF..." : "Download PDF"}
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition cursor-pointer backdrop-blur-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {t("syncCatalog")}
            </button>
          </div>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <SearchInput
            placeholder={t("searchProductsPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
          />
        </div>

        {/* Data Table */}
        {loading ? (
          <LoadingSkeleton type="table" />
        ) : (
          <DataTable
            data={filteredProducts}
            columns={columns}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => router.push(`/products/${row.id}`)}
          />
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-2xl relative text-left border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-3 text-[#1B2A4A]">
                <div className="p-2 bg-slate-100 rounded-xl">
                  <Package className="w-5 h-5 text-[#1B2A4A]" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingProduct ? "Edit Product" : "Add New Product"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tricodex 50ml"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TRICO-050"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Barcode
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 629100029301"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      setFormCategory(e.target.value);
                      const matched = categories.find((c) => c.name === e.target.value);
                      setFormCategoryId(matched?.id || "");
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  >
                    <option value="General">General</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Unit Type
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  >
                    <option value="Item">Item</option>
                    <option value="Vial">Vial</option>
                    <option value="Bottle">Bottle</option>
                    <option value="Box">Box</option>
                    <option value="Pack">Pack</option>
                    <option value="Kg">Kg</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Brand
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maat Vet"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Selling Price (AED) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formSellingPrice}
                    onChange={(e) => setFormSellingPrice(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition font-bold"
                  />
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Tiered Volume Pricing (Optional)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        10+ Qty Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formPrice10}
                        onChange={(e) => setFormPrice10(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        50+ Qty Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formPrice50}
                        onChange={(e) => setFormPrice50(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        100+ Qty Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formPrice100}
                        onChange={(e) => setFormPrice100(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter product description or specifications..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#61989B]/20 transition"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Available in Catalog
                  </span>
                  <button
                    type="button"
                    onClick={() => setFormIsActive(!formIsActive)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formIsActive ? "bg-[#61989B]" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        formIsActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-3 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] transition disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
