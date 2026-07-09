"use client";

import React, { useMemo, useState, useEffect } from "react";
import { 
  Package, 
  Users, 
  FileText, 
  Activity,
  ArrowRight,
  TrendingUp,
  Award
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { mockQuotes, mockActivity } from "@/lib/mockData";
import { Quote, Product, Customer } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        setProducts(data.products || []);

        const custRes = await fetch("/api/customers");
        const custData = await custRes.json();
        setCustomers(custData.customers || []);

        const quotesRes = await fetch("/api/quotes");
        const quotesData = await quotesRes.json();
        if (Array.isArray(quotesData)) {
          setQuotes(quotesData);
        } else {
          setQuotes(mockQuotes);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setQuotes(mockQuotes);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  // Segment quotes by Salesman role restrictions
  const visibleQuotes = useMemo(() => {
    if (user && user.role === "Salesman") {
      return quotes.filter((q) => q.salesmanName.toLowerCase().trim() === user.name.toLowerCase().trim());
    }
    return quotes;
  }, [quotes, user]);

  // Compute metrics
  const metrics = useMemo(() => {
    const totalProducts = products.length;
    const totalClients = customers.length;
    const totalQuotesCount = visibleQuotes.length;
    
    // Quotes count from today
    const todayStr = new Date().toISOString().split("T")[0];
    const todaysQuotes = visibleQuotes.filter(q => q.date === todayStr).length;

    return {
      totalProducts,
      totalClients,
      totalQuotesCount,
      todaysQuotes
    };
  }, [products, customers, visibleQuotes]);

  // Recent 3 quotes
  const recentQuotes = useMemo(() => {
    return [...visibleQuotes].sort((a, b) => b.quoteNumber.localeCompare(a.quoteNumber)).slice(0, 3);
  }, [visibleQuotes]);

  // Columns for recent quotes table
  const quoteColumns = [
    {
      header: t("quoteNo"),
      accessor: (row: Quote) => (
        <span className="font-bold text-[#1B2A4A]">{row.quoteNumber}</span>
      ),
    },
    {
      header: t("clientCompany"),
      accessor: (row: Quote) => (
        <div>
          <div className="font-bold text-slate-800">{row.customerName}</div>
          <div className="text-xs text-slate-400 font-medium">{row.companyName}</div>
        </div>
      ),
    },
    {
      header: t("grandTotalCol"),
      accessor: (row: Quote) => (
        <span className="font-bold text-slate-900">AED {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      ),
    },

  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader 
        title={t("dashboardTitle")} 
        description={t("dashboardDesc")}
        action={
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15"
          >
            {t("createQuote")}
          </Link>
        }
      />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title={t("totalProducts").toUpperCase()}
          value={loading ? "..." : metrics.totalProducts}
          description="catalogued medicines"
          icon={Package}
          trend={{ value: "12%", isPositive: true }}
        />
        <DashboardCard
          title="ACTIVE CLIENTS"
          value={metrics.totalClients}
          description="veterinary clinics & farms"
          icon={Users}
          trend={{ value: "8%", isPositive: true }}
        />
        <DashboardCard
          title="TOTAL QUOTES"
          value={metrics.totalQuotesCount}
          description="quotations issued total"
          icon={Award}
          trend={{ value: "14%", isPositive: true }}
        />
        <DashboardCard
          title={t("todaysQuotes").toUpperCase()}
          value={metrics.todaysQuotes}
          description="quotations created today"
          icon={FileText}
          trend={{ value: "25%", isPositive: true }}
        />
      </div>

      {/* Recent Quotes Section (Full Width) */}
      <div className="space-y-4 w-full mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t("recentQuotations")}
          </h2>
          <Link
            href="/quotes"
            className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
          >
            {t("viewAllQuotes")} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </Link>
        </div>
        <DataTable
          data={recentQuotes}
          columns={quoteColumns}
          keyExtractor={(row, idx) => row.id || row.quoteNumber || `q-${idx}`}
        />
      </div>
    </div>
  );
}
