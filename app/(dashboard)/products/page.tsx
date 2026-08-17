"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Product, ProductCategory } from "@/types";
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
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ProductsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const { isSuperAdmin, isAccountant, isSalesperson } = useAuth();

  // Primary data states
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Load products & categories from Supabase API
  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch(`/api/products?t=${Date.now()}`),
        fetch(`/api/categories?t=${Date.now()}`),
      ]);

      const prodData = await prodRes.json();
      const catData = await catRes.json();

      setProducts(prodData.products || []);
      setCategories(catData.categories || []);
    } catch (err) {
      console.error("Failed to load products database:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Extract unique brands for filter dropdown
  const uniqueBrands = useMemo(() => {
    const brandsSet = new Set<string>();
    products.forEach((p) => {
      if (p.brand && p.brand.trim()) {
        brandsSet.add(p.brand.trim());
      }
    });
    return Array.from(brandsSet).sort();
  }, [products]);

  // Stat calculations
  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.isAvailable !== false).length;
    const inactive = total - active;
    const categoryCount = categories.length || new Set(products.map((p) => p.category)).size;
    return { total, active, inactive, categoryCount };
  }, [products, categories]);

  // Filtered products logic
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Global Search
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.productCode && p.productCode.toLowerCase().includes(query)) ||
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

  // Reset modal form
  const resetForm = () => {
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
    setFormSuccess(false);
  };

  // Open Super Admin Edit modal
  const openEditModal = (product: Product) => {
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
    setFormSellingPrice(product.price !== undefined ? String(product.price) : "0");
    setFormPrice10(product.price10 !== undefined ? String(product.price10) : "");
    setFormPrice50(product.price50 !== undefined ? String(product.price50) : "");
    setFormPrice100(product.price100 !== undefined ? String(product.price100) : "");
    setFormIsActive(product.isAvailable !== false);
    setIsModalOpen(true);
  };

  // Open Accountant Price Edit modal
  const openPriceEditModal = (product: Product) => {
    setEditingPriceProduct(product);
    setAccSellingPrice(product.price !== undefined ? String(product.price) : "0");
    setAccPrice10(product.price10 !== undefined ? String(product.price10) : "");
    setAccPrice50(product.price50 !== undefined ? String(product.price50) : "");
    setAccPrice100(product.price100 !== undefined ? String(product.price100) : "");
    setIsPriceModalOpen(true);
  };

  // Create or Update Product handler (Super Admin)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        category: formCategory.trim() || "General",
        categoryId: formCategoryId || undefined,
        brand: formBrand.trim(),
        unit: formUnit.trim() || "Item",
        description: formDescription.trim(),
        sellingPrice: formSellingPrice !== "" ? parseFloat(formSellingPrice) : 0,
        price: formSellingPrice !== "" ? parseFloat(formSellingPrice) : 0,
        price10: formPrice10 !== "" ? parseFloat(formPrice10) : undefined,
        price50: formPrice50 !== "" ? parseFloat(formPrice50) : undefined,
        price100: formPrice100 !== "" ? parseFloat(formPrice100) : undefined,
        isActive: formIsActive,
        isAvailable: formIsActive,
      };

      if (editingProduct) {
        if (editingProduct.sku) payload.sku = editingProduct.sku;
        if (editingProduct.barcode) payload.barcode = editingProduct.barcode;
      }

      let res: Response;
      if (editingProduct) {
        res = await fetch(`/api/products/${editingProduct.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setFormSuccess(true);
        setTimeout(() => {
          setIsModalOpen(false);
          resetForm();
          loadData();
        }, 1000);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to save product in database.");
      }
    } catch (err) {
      console.error("Failed to submit product:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Price Edit submit handler (Accountant & Super Admin)
  const handlePriceFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriceProduct) return;

    setIsSubmitting(true);
    try {
      const payload = {
        sellingPrice: accSellingPrice !== "" ? parseFloat(accSellingPrice) : 0,
        price: accSellingPrice !== "" ? parseFloat(accSellingPrice) : 0,
        price10: accPrice10 !== "" ? parseFloat(accPrice10) : undefined,
        price50: accPrice50 !== "" ? parseFloat(accPrice50) : undefined,
        price100: accPrice100 !== "" ? parseFloat(accPrice100) : undefined,
      };

      const res = await fetch(`/api/products/${editingPriceProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsPriceModalOpen(false);
        setEditingPriceProduct(null);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to update product prices.");
      }
    } catch (err) {
      console.error("Failed to update product prices:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Category Creation submit handler (Super Admin)
  const handleCategoryCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (res.ok) {
        setNewCategoryName("");
        setIsCategoryModalOpen(false);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to create product category.");
      }
    } catch (err) {
      console.error("Failed to create category:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Soft Delete handler (Super Admin only)
  const handleSoftDelete = async () => {
    if (!deletingProduct) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/products/${deletingProduct.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === deletingProduct.id ? { ...p, isAvailable: false } : p))
        );
        setDeletingProduct(null);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to deactivate product");
      }
    } catch (err) {
      console.error("Error soft deleting product:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Table Columns Definition
  const columns = [
    {
      header: "Product",
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
              {row.name}
            </Link>
            {row.description && (
              <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{row.description}</div>
            )}
          </div>
        </div>
      ),
      className: "min-w-[220px]",
    },
    {
      header: "Category",
      accessor: (row: Product) => (
        <span className="inline-flex items-center text-xs font-semibold text-slate-700 bg-slate-100/90 border border-slate-200/80 px-2.5 py-1 rounded-lg whitespace-nowrap shadow-2xs">
          {row.category}
        </span>
      ),
      className: "whitespace-nowrap min-w-[170px]",
    },
    {
      header: "Brand",
      accessor: (row: Product) => (
        <span className="text-xs text-slate-600 font-medium whitespace-nowrap">{row.brand || "—"}</span>
      ),
      className: "whitespace-nowrap min-w-[150px]",
    },
    {
      header: "Unit",
      accessor: (row: Product) => (
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{row.unit}</span>
      ),
      className: "whitespace-nowrap min-w-[80px]",
    },
    {
      header: "Selling Price",
      accessor: (row: Product) => (
        <span className="font-bold text-slate-900 text-xs whitespace-nowrap">
          AED {row.price.toFixed(2)}
        </span>
      ),
      className: "whitespace-nowrap min-w-[120px]",
    },
    {
      header: "10+",
      accessor: (row: Product) => (
        <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
          {row.price10 !== undefined ? `AED ${row.price10.toFixed(2)}` : "—"}
        </span>
      ),
      className: "whitespace-nowrap min-w-[90px]",
    },
    {
      header: "50+",
      accessor: (row: Product) => (
        <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
          {row.price50 !== undefined ? `AED ${row.price50.toFixed(2)}` : "—"}
        </span>
      ),
      className: "whitespace-nowrap min-w-[90px]",
    },
    {
      header: "100+",
      accessor: (row: Product) => (
        <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
          {row.price100 !== undefined ? `AED ${row.price100.toFixed(2)}` : "—"}
        </span>
      ),
      className: "whitespace-nowrap min-w-[90px]",
    },
    {
      header: "Actions",
      accessor: (row: Product) => (
        <div className="flex items-center gap-1.5 justify-end">
          {/* View Product Intelligence Detail Page (All Roles) */}
          <Link
            href={`/products/${row.id}`}
            title="View Product Intelligence"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </Link>

          {/* Super Admin Full Edit */}
          {isSuperAdmin && (
            <button
              onClick={() => openEditModal(row)}
              title="Edit Product"
              className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 transition cursor-pointer"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}

          {/* Accountant Price-Only Edit */}
          {isAccountant && (
            <button
              onClick={() => openPriceEditModal(row)}
              title="Edit Prices"
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 transition cursor-pointer flex items-center gap-1"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Edit Prices
            </button>
          )}

          {/* Super Admin Soft Delete / Deactivate */}
          {isSuperAdmin && row.isAvailable !== false && (
            <button
              onClick={() => setDeletingProduct(row)}
              title="Deactivate Product"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
      className: "w-36 text-right",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* PAGE HEADER */}
      <PageHeader
        title="Products"
        description={
          isSuperAdmin
            ? "Manage product catalogue, tiered pricing, and category structures."
            : isAccountant
            ? "View product catalogue and update tier prices."
            : "Browse product catalogue and standard selling rates."
        }
        action={
          <div className="flex items-center gap-3">
            {/* Refresh */}
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            {/* Category Management (Super Admin only) */}
            {isSuperAdmin && (
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition shadow-xs cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                + Category
              </button>
            )}

            {/* New Product (Super Admin only) */}
            {isSuperAdmin && (
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B2A4A] hover:bg-[#15223c] text-white font-semibold text-xs shadow-md transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                + New Product
              </button>
            )}
          </div>
        }
      />

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Products</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.total}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Package className="w-6 h-6 stroke-[1.75]" />
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Categories</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.categoryCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Layers className="w-6 h-6 stroke-[1.75]" />
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
          {/* Global Search */}
          <SearchInput
            placeholder="Search by Product Name, Brand, or Category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            className="w-full lg:max-w-md"
          />

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-slate-500">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-xs font-bold text-slate-500">Brand:</span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Brands</option>
                {uniqueBrands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* PRODUCTS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8">
            <LoadingSkeleton type="table" count={6} />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 mx-auto mb-4">
              <Package className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No Products Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No product items matched your search query or filter selections.
            </p>
          </div>
        ) : (
          <DataTable data={filteredProducts} columns={columns} keyExtractor={(item) => item.id} />
        )}
      </div>

      {/* SUPER ADMIN CREATE / EDIT MODAL */}
      {isModalOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingProduct ? "Edit Product Details" : "Create New Product"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingProduct ? "Update product metadata and pricing." : "Add a new product to catalogue."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. BIOLAC 100ml"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      setFormCategory(e.target.value);
                      const catObj = categories.find((c) => c.name === e.target.value);
                      if (catObj) setFormCategoryId(catObj.id);
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
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
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="e.g. MAAT Vet"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="e.g. Bottle, Box, Item"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>
              </div>

              {/* Tier Pricing */}
              <div className="pt-2">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">
                  Tier Pricing (AED)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Standard Price *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formSellingPrice}
                      onChange={(e) => setFormSellingPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-accent/15 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">10+ Qty Price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formPrice10}
                      onChange={(e) => setFormPrice10(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-accent/15"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">50+ Qty Price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formPrice50}
                      onChange={(e) => setFormPrice50(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-accent/15"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">100+ Qty Price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formPrice100}
                      onChange={(e) => setFormPrice100(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-accent/15"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Product description and usage notes..."
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Active Status</span>
                <select
                  value={formIsActive ? "active" : "inactive"}
                  onChange={(e) => setFormIsActive(e.target.value === "active")}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1B2A4A] hover:bg-[#15223c] rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Saving..." : editingProduct ? "Update Product" : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACCOUNTANT RESTRAINED PRICE EDIT MODAL */}
      {isPriceModalOpen && editingPriceProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Product Prices</h3>
                  <p className="text-xs text-slate-500 font-semibold">{editingPriceProduct.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPriceModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePriceFormSubmit} className="space-y-4">
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Selling Price (AED) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={accSellingPrice}
                    onChange={(e) => setAccSellingPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    10+ Quantity Price (AED)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={accPrice10}
                    onChange={(e) => setAccPrice10(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    50+ Quantity Price (AED)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={accPrice50}
                    onChange={(e) => setAccPrice50(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    100+ Quantity Price (AED)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={accPrice100}
                    onChange={(e) => setAccPrice100(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !accSellingPrice}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Updating..." : "Save Prices"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPER ADMIN CATEGORY CREATION MODAL */}
      {isCategoryModalOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Add Product Category</h3>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCategoryCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Antibiotics, Supplements"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newCategoryName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Creating..." : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SOFT DELETE CONFIRMATION DIALOG */}
      {deletingProduct && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Deactivate Product?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Are you sure you want to set <strong className="text-slate-800">{deletingProduct.name}</strong> as inactive?
            </p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSoftDelete}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "Deactivating..." : "Confirm Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT DETAILS SIDE DRAWER */}
      {selectedProductDetails && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white max-w-md w-full h-full p-6 shadow-2xl border-l border-slate-200 overflow-y-auto animate-in slide-in-from-right duration-200 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 line-clamp-1">{selectedProductDetails.name}</h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                        selectedProductDetails.isAvailable !== false
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {selectedProductDetails.isAvailable !== false ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProductDetails(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* General Information Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  General Information
                </h4>
                <div className="bg-slate-50 p-4 rounded-xl space-y-2.5 border border-slate-200/60 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/40">
                    <span className="text-slate-500 font-semibold">Category:</span>
                    <span className="font-bold text-slate-800">{selectedProductDetails.category}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/40">
                    <span className="text-slate-500 font-semibold">Brand:</span>
                    <span className="font-medium text-slate-800">{selectedProductDetails.brand || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/40">
                    <span className="text-slate-500 font-semibold">Unit:</span>
                    <span className="font-medium text-slate-800">{selectedProductDetails.unit}</span>
                  </div>
                  {selectedProductDetails.sku && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500 font-semibold">SKU:</span>
                      <span className="font-mono text-slate-800">{selectedProductDetails.sku}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Pricing Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  Tiered Pricing
                </h4>
                <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200/60 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/40">
                    <span className="text-slate-500 font-semibold">Standard Selling Price:</span>
                    <span className="font-extrabold text-slate-900">AED {selectedProductDetails.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/40">
                    <span className="text-slate-500 font-semibold">10+ Quantity Rate:</span>
                    <span className="font-bold text-emerald-600">
                      {selectedProductDetails.price10 !== undefined ? `AED ${selectedProductDetails.price10.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/40">
                    <span className="text-slate-500 font-semibold">50+ Quantity Rate:</span>
                    <span className="font-bold text-emerald-600">
                      {selectedProductDetails.price50 !== undefined ? `AED ${selectedProductDetails.price50.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-semibold">100+ Quantity Rate:</span>
                    <span className="font-bold text-emerald-600">
                      {selectedProductDetails.price100 !== undefined ? `AED ${selectedProductDetails.price100.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedProductDetails.description && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/60 leading-relaxed">
                    {selectedProductDetails.description}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100 flex gap-3">
              {isSuperAdmin && (
                <button
                  onClick={() => {
                    const prod = selectedProductDetails;
                    setSelectedProductDetails(null);
                    openEditModal(prod);
                  }}
                  className="w-full py-2.5 bg-[#1B2A4A] text-white text-xs font-bold rounded-xl hover:bg-[#15223c] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Product
                </button>
              )}
              {isAccountant && (
                <button
                  onClick={() => {
                    const prod = selectedProductDetails;
                    setSelectedProductDetails(null);
                    openPriceEditModal(prod);
                  }}
                  className="w-full py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" />
                  Edit Prices
                </button>
              )}
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="w-full py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
