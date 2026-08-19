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
        </div>
      ),
      className: "w-28 text-center",
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title={t("productsTitle")}
        description={t("productsDesc")}
        action={
          <div className="flex flex-wrap items-center gap-3">
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
    </div>
  );
}
