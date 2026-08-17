"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Flame,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Building2,
  User,
  Clock,
  Plus,
  Minus,
  RefreshCw,
  DollarSign,
  Layers,
  ShieldAlert,
  FileText,
  X,
  ExternalLink,
  History,
  ShoppingCart,
  MapPin,
  Tag,
  Ban,
} from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";

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

  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stock Adjustment Modal states
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjAction, setAdjAction] = useState<"ADD" | "DEDUCT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGE" | "EXPIRY">("ADD");
  const [adjCountry, setAdjCountry] = useState<"UAE" | "Oman">("UAE");
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
          reason: adjReason.trim() || `Manual ${adjAction} by ${profile?.full_name || "Super Admin"}`,
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

  const { product, stockSummary, movementStatus, statusReason, stockStatus, stockRisk, salesVelocity, inventorySummary, locationStock, lastCustomer, recentCustomers, recentMovements, salesHistory } = data;

  const canViewGlobal = profile?.role === "super_admin" || profile?.role === "accountant";
  const isUaeSalesperson = profile?.role === "salesperson" && profile?.country === "UAE";
  const isOmanSalesperson = profile?.role === "salesperson" && profile?.country === "Oman";

  const getVelocityBadge = (status: string) => {
    switch (status) {
      case "HIGH MOVING":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200/80",
          icon: <Flame className="w-4 h-4 text-amber-600 animate-pulse" />,
          label: "🔥 HIGH MOVING",
        };
      case "FAST MOVING":
        return {
          bg: "bg-purple-50 text-purple-700 border-purple-200/80",
          icon: <Zap className="w-4 h-4 text-purple-600" />,
          label: "⚡ FAST MOVING",
        };
      case "NORMAL MOVING":
        return {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
          icon: <TrendingUp className="w-4 h-4 text-emerald-600" />,
          label: "NORMAL MOVING",
        };
      case "SLOW MOVING":
        return {
          bg: "bg-blue-50 text-blue-700 border-blue-200/80",
          icon: <Clock className="w-4 h-4 text-blue-600" />,
          label: "SLOW MOVING",
        };
      default:
        return {
          bg: "bg-slate-100 text-slate-600 border-slate-200",
          icon: <Ban className="w-4 h-4 text-slate-400" />,
          label: "NO RECENT SALES",
        };
    }
  };

  const velocityBadge = getVelocityBadge(movementStatus);

  const getStockBadge = (status: string) => {
    switch (status) {
      case "IN STOCK":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "LOW STOCK":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "OUT OF STOCK":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

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
                AED {product.sellingPrice.toFixed(2)}
              </div>
            </div>
          </div>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {isSuperAdmin && (
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

      {/* PRODUCT MOVEMENT STATUS & STOCK RISK */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MOVEMENT VELOCITY BANNER */}
        <div className={`md:col-span-2 border p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs ${velocityBadge.bg}`}>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-white/80 shadow-2xs border border-white/60">
              {velocityBadge.icon}
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider opacity-80">Movement Velocity</div>
              <div className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2 mt-0.5">
                {velocityBadge.label}
              </div>
              <p className="text-xs font-medium mt-1 opacity-90">{statusReason}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getStockBadge(stockStatus)}`}>
              {stockStatus}
            </span>
          </div>
        </div>

        {/* STOCK RISK CALLOUT */}
        <div className="border border-slate-200/80 bg-white p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Stock Risk Assessment</div>
          {stockRisk ? (
            <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-xl text-amber-800 text-xs font-bold flex items-start gap-2.5 mt-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div>REPLENISHMENT ALERT</div>
                <div className="font-semibold text-amber-700 mt-0.5">{stockRisk}</div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200/90 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 mt-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Stock level is healthy relative to current sales velocity.</span>
            </div>
          )}
        </div>
      </div>

      {/* STOCK SUMMARY CARDS */}
      <div className={`grid grid-cols-1 ${canViewGlobal ? "sm:grid-cols-3" : "sm:grid-cols-1 max-w-md"} gap-4`}>
        {(canViewGlobal || isUaeSalesperson) && (
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
              <span>UAE Stock</span>
              <MapPin className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2">
              {stockSummary.uaeStock.toLocaleString()} <span className="text-sm font-medium text-slate-400">{product.unit}s</span>
            </div>
          </div>
        )}

        {(canViewGlobal || isOmanSalesperson) && (
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
              <span>Oman Stock</span>
              <MapPin className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2">
              {stockSummary.omanStock.toLocaleString()} <span className="text-sm font-medium text-slate-400">{product.unit}s</span>
            </div>
          </div>
        )}

        {canViewGlobal && (
          <div className="bg-slate-900 text-white border border-slate-800 p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
              <span>Total Combined Stock</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-3xl font-black text-white mt-2">
              {stockSummary.totalStock.toLocaleString()} <span className="text-sm font-medium text-slate-400">{product.unit}s</span>
            </div>
          </div>
        )}
      </div>

      {/* SALES PERFORMANCE METRICS GRID */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-slate-500" /> Sales Velocity Breakdown (Confirmed Invoices)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-xs font-medium text-slate-500">7 Days Sold</div>
            <div className="text-xl font-black text-slate-900 mt-1">{salesVelocity.unitsSold7d} <span className="text-xs font-medium text-slate-400">units</span></div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-xs font-medium text-slate-500">30 Days Sold</div>
            <div className="text-xl font-black text-slate-900 mt-1">{salesVelocity.unitsSold30d} <span className="text-xs font-medium text-slate-400">units</span></div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-xs font-medium text-slate-500">90 Days Sold</div>
            <div className="text-xl font-black text-slate-900 mt-1">{salesVelocity.unitsSold90d} <span className="text-xs font-medium text-slate-400">units</span></div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-xs font-medium text-slate-500">Total Lifetime Sold</div>
            <div className="text-xl font-black text-slate-900 mt-1">{salesVelocity.totalUnitsSold} <span className="text-xs font-medium text-slate-400">units</span></div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-xs font-medium text-slate-500">Purchasing Customers</div>
            <div className="text-xl font-black text-slate-900 mt-1">{salesVelocity.uniqueCustomersCount} <span className="text-xs font-medium text-slate-400">buyers</span></div>
          </div>
        </div>
      </div>

      {/* INVENTORY SUMMARY BREAKDOWN LEDGER */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-500" /> Inventory Movements Summary Ledger
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-center">
            <div className="text-xs font-semibold text-slate-400">Opening</div>
            <div className="text-lg font-black text-slate-800 mt-1">+{inventorySummary.openingStock}</div>
          </div>
          <div className="p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl text-center">
            <div className="text-xs font-semibold text-emerald-700">Received</div>
            <div className="text-lg font-black text-emerald-800 mt-1">+{inventorySummary.stockReceived}</div>
          </div>
          <div className="p-3 bg-rose-50/60 border border-rose-200/60 rounded-xl text-center">
            <div className="text-xs font-semibold text-rose-700">Units Sold</div>
            <div className="text-lg font-black text-rose-800 mt-1">-{inventorySummary.unitsSold}</div>
          </div>
          <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-xl text-center">
            <div className="text-xs font-semibold text-blue-700">Returns</div>
            <div className="text-lg font-black text-blue-800 mt-1">+{inventorySummary.salesReturns}</div>
          </div>
          <div className="p-3 bg-indigo-50/60 border border-indigo-200/60 rounded-xl text-center">
            <div className="text-xs font-semibold text-indigo-700">Adjust. In</div>
            <div className="text-lg font-black text-indigo-800 mt-1">+{inventorySummary.adjustmentsIn}</div>
          </div>
          <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl text-center">
            <div className="text-xs font-semibold text-amber-700">Adjust. Out</div>
            <div className="text-lg font-black text-amber-800 mt-1">-{inventorySummary.adjustmentsOut}</div>
          </div>
          <div className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl text-center col-span-2 sm:col-span-1">
            <div className="text-xs font-semibold text-slate-400">Current Stock</div>
            <div className="text-lg font-black text-white mt-1">{inventorySummary.currentStock}</div>
          </div>
        </div>
      </div>

      {/* COUNTRY / LOCATION BREAKDOWN & LAST CUSTOMER SPOTLIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LOCATION BREAKDOWN */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" /> Country Stock & Performance
          </h3>
          <div className={`grid grid-cols-1 ${canViewGlobal ? "sm:grid-cols-2" : "sm:grid-cols-1"} gap-4`}>
            {/* UAE LOCATION */}
            {locationStock.uae && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                  <span>🇦🇪 UAE Branch</span>
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-semibold">Active</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Current Stock:</span>
                    <strong className="text-slate-900 font-bold">{locationStock.uae.currentStock} {product.unit}s</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Units Sold (30 Days):</span>
                    <strong className="text-slate-900 font-bold">{locationStock.uae.unitsSold30d} units</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Last Sale Date:</span>
                    <strong className="text-slate-900 font-bold">{formatDate(locationStock.uae.lastSale)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* OMAN LOCATION */}
            {locationStock.oman && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                  <span>🇴🇲 Oman Branch</span>
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md font-semibold">Active</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Current Stock:</span>
                    <strong className="text-slate-900 font-bold">{locationStock.oman.currentStock} {product.unit}s</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Units Sold (30 Days):</span>
                    <strong className="text-slate-900 font-bold">{locationStock.oman.unitsSold30d} units</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Last Sale Date:</span>
                    <strong className="text-slate-900 font-bold">{formatDate(locationStock.oman.lastSale)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LAST CUSTOMER SPOTLIGHT CARD */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-3 flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" /> Last Customer Purchased
          </h3>

          {lastCustomer ? (
            <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl space-y-2">
              <Link
                href={`/customers/${lastCustomer.id}`}
                className="font-bold text-slate-900 hover:text-cyan-600 transition flex items-center justify-between text-sm group"
              >
                <span>{lastCustomer.doctorName || lastCustomer.companyName}</span>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-cyan-600" />
              </Link>
              {lastCustomer.companyName && lastCustomer.doctorName && (
                <div className="text-xs text-slate-500 font-medium">{lastCustomer.companyName}</div>
              )}
              <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block">Purchase Date:</span>
                  <span className="font-bold text-slate-700">{formatDate(lastCustomer.date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Quantity Sold:</span>
                  <span className="font-bold text-slate-700">{lastCustomer.quantity} {product.unit}s</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block">Invoice Reference:</span>
                  <span className="font-mono font-bold text-slate-800">{lastCustomer.invoiceNumber}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200/50">
              No confirmed sales recorded for this product yet.
            </div>
          )}
        </div>
      </div>

      {/* RECENT CUSTOMERS LIST */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" /> Recent Customers Who Purchased
          </h3>
          <span className="text-xs text-slate-400 font-semibold">{recentCustomers.length} Unique Buyers</span>
        </div>
        {recentCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                  <th className="py-3 px-5">Customer</th>
                  <th className="py-3 px-5">Last Purchase Net</th>
                  <th className="py-3 px-5">Qty</th>
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-5">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {recentCustomers.map((cust) => (
                  <tr key={cust.customerId} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5">
                      <Link
                        href={`/customers/${cust.customerId}`}
                        className="font-bold text-slate-900 hover:text-cyan-600 transition flex items-center gap-1.5"
                      >
                        {cust.doctorName || cust.companyName}
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </Link>
                      {cust.companyName && cust.doctorName && (
                        <div className="text-[11px] text-slate-400">{cust.companyName}</div>
                      )}
                    </td>
                    <td className="py-3 px-5 font-bold text-slate-800">
                      AED {cust.lastPurchaseNet.toFixed(2)}
                    </td>
                    <td className="py-3 px-5 font-semibold text-slate-700">
                      {cust.quantity}
                    </td>
                    <td className="py-3 px-5 text-slate-500 whitespace-nowrap">
                      {formatDate(cust.lastPurchaseDate)}
                    </td>
                    <td className="py-3 px-5 font-mono text-slate-600">
                      {cust.invoiceNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 italic">No customer sales recorded.</div>
        )}
      </div>

      {/* SALES HISTORY TABLE */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" /> Confirmed Sales History
          </h3>
          <span className="text-xs text-slate-400 font-semibold">{salesHistory.length} Invoices</span>
        </div>
        {salesHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                  <th className="py-3 px-5">Invoice</th>
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-5">Customer</th>
                  <th className="py-3 px-5">Country</th>
                  <th className="py-3 px-5 text-right">Quantity</th>
                  <th className="py-3 px-5 text-right">Unit Price (Historical)</th>
                  <th className="py-3 px-5 text-right">Discount</th>
                  <th className="py-3 px-5 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {salesHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-mono font-bold text-slate-900">
                      {item.invoiceNumber}
                    </td>
                    <td className="py-3 px-5 text-slate-500 whitespace-nowrap">
                      {formatDate(item.date)}
                    </td>
                    <td className="py-3 px-5">
                      {item.customerId ? (
                        <Link
                          href={`/customers/${item.customerId}`}
                          className="font-bold text-slate-800 hover:text-cyan-600 transition"
                        >
                          {item.doctorName || item.companyName}
                        </Link>
                      ) : (
                        <span className="text-slate-600">{item.doctorName}</span>
                      )}
                    </td>
                    <td className="py-3 px-5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.country === "Oman" ? "bg-purple-50 text-purple-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {item.country}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right font-bold text-slate-900">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-5 text-right font-bold text-slate-800">
                      AED {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-5 text-right text-slate-500">
                      {item.discount > 0 ? `AED ${item.discount.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-3 px-5 text-right font-black text-slate-900">
                      AED {item.lineTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 italic">No sales history available.</div>
        )}
      </div>

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
                  <option value="UAE">UAE Branch</option>
                  <option value="Oman">Oman Branch</option>
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
