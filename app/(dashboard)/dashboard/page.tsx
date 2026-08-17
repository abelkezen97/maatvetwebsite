"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Quote, Product, Customer, Invoice } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { 
  Package, 
  Users, 
  FileText, 
  Activity,
  ArrowRight,
  TrendingUp,
  Award,
  Eye,
  Download,
  MessageCircle,
  Pencil,
  X,
  CheckCircle,
  DollarSign,
  CreditCard
} from "lucide-react";
import { buildPDF, buildInvoicePDF } from "@/lib/pdfHelper";
import { InvoiceDetailModal } from "@/components/InvoiceDetailModal";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { ActionDropdown } from "@/components/ActionDropdown";
import { printInvoiceThermalBill } from "@/lib/thermalPrintHelper";

export default function DashboardPage() {
  const { t, translateBusinessText, formatCurrency, formatDate, isRtl } = useLanguage();
  const { user, profile } = useAuth();
  const router = useRouter();

  const isAdminOrAccountant = profile?.role === "super_admin" || profile?.role === "accountant";

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [salespeopleCount, setSalespeopleCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [prodRes, custRes, quotesRes, invRes, recRes, spRes] = await Promise.all([
          fetch("/api/products").then((r) => r.json()).catch(() => ({ products: [] })),
          fetch("/api/customers").then((r) => r.json()).catch(() => ({ customers: [] })),
          fetch("/api/quotes").then((r) => r.json()).catch(() => []),
          fetch("/api/invoices").then((r) => r.json()).catch(() => []),
          fetch("/api/receipts").then((r) => r.json()).catch(() => []),
          fetch("/api/salespeople").then((r) => r.json()).catch(() => ({ salespeople: [] })),
        ]);

        if (prodRes && Array.isArray(prodRes.products)) setProducts(prodRes.products);
        if (custRes && Array.isArray(custRes.customers)) setCustomers(custRes.customers);
        if (Array.isArray(quotesRes)) setQuotes(quotesRes);
        if (Array.isArray(recRes)) setReceipts(recRes);
        if (spRes && Array.isArray(spRes.salespeople)) setSalespeopleCount(spRes.salespeople.length);

        if (Array.isArray(invRes)) {
          const parsedInvoices = invRes.map((item: any) => {
            if (item && Array.isArray(item.items)) return item;
            if (item.invoiceJson) {
              try { return JSON.parse(item.invoiceJson); } catch (e) {}
            }
            return {
              id: item.invoiceNumber || `inv-${Date.now()}`,
              invoiceNumber: item.invoiceNumber || "",
              customerName: item.customerName || "",
              companyName: item.companyName || "",
              salesmanName: item.salesmanName || "",
              date: item.date || "",
              grandTotal: parseFloat(item.grandTotal) || 0,
              status: item.status || "Credit",
              items: [],
              subtotal: parseFloat(item.grandTotal) || 0,
              discountTotal: 0,
              taxTotal: 0,
            };
          });
          setInvoices(parsedInvoices);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // Calculate Admin KPIs
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];

    // 1. Today's Sales
    const todayInvoices = invoices.filter((inv) => inv.date && String(inv.date).startsWith(todayStr));
    const todaySalesSum = todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    // Today's Collections (Receipts collected today)
    const todayReceipts = receipts.filter((rec) => rec.paymentDate && String(rec.paymentDate).startsWith(todayStr));
    const todayCollectionSum = todayReceipts.reduce((sum, rec) => sum + (Number(rec.amountPaid) || 0), 0);

    // 2. Monthly Sales (Running Month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthlyInvoices = invoices.filter((inv) => {
      if (!inv.date) return false;
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    const monthlySalesSum = monthlyInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    // 3. Outstanding Receivables
    const outstandingSum = customers.reduce((sum, c) => sum + Math.max(0, c.pendingBillwiseAmount || 0), 0);

    // 4. Credit Invoices
    const creditInvoicesList = invoices.filter((inv) => inv.status === "Credit");
    const creditInvoicesCount = creditInvoicesList.length;
    const creditInvoicesSum = creditInvoicesList.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    // 5. Payments Received
    const totalPaymentsReceived = receipts.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0);

    // 6. Active Customers
    const activeCustomersCount = customers.filter((c) => c.is_active !== false).length;

    // 7. Active Salespersons
    const activeSalespersonsCount = salespeopleCount || customers.reduce((acc, c) => {
      if (c.assignedSalesmanName) acc.add(c.assignedSalesmanName);
      return acc;
    }, new Set<string>()).size;

    return {
      todaySalesSum,
      todayCollectionSum,
      monthlySalesSum,
      outstandingSum,
      creditInvoicesCount,
      creditInvoicesSum,
      totalPaymentsReceived,
      activeCustomersCount,
      activeSalespersonsCount,
    };
  }, [invoices, customers, receipts, salespeopleCount]);

  // Operational Recent Records
  const recentInvoices = useMemo(() => {
    return [...invoices]
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.invoiceNumber.localeCompare(a.invoiceNumber);
      })
      .slice(0, 5);
  }, [invoices]);

  const recentQuotes = useMemo(() => {
    return [...quotes]
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.quoteNumber.localeCompare(a.quoteNumber);
      })
      .slice(0, 5);
  }, [quotes]);

  const recentReceiptsList = useMemo(() => {
    return [...receipts]
      .sort((a, b) => {
        const timeA = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
        const timeB = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return (b.receiptNumber || "").localeCompare(a.receiptNumber || "");
      })
      .slice(0, 5);
  }, [receipts]);

  const shareQuoteToWhatsApp = async (quote: Quote) => {
    const doc = buildPDF(quote);
    const pdfBlob = doc.output("blob");
    const fileName = `MAAT-QUOTE-${quote.quoteNumber}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Quotation ${quote.quoteNumber}`,
          text: `Please find attached our quotation Ref: ${quote.quoteNumber} for ${quote.companyName || quote.customerName}.`,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Error sharing PDF via native share:", err);
        }
      }
    } else {
      doc.save(fileName);
      const message = `Please find attached our quotation Ref: ${quote.quoteNumber} for ${quote.companyName || quote.customerName}.`;
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
    }
  };

  const generateQuotePDF = (quote: Quote) => {
    const doc = buildPDF(quote);
    doc.save(`MAAT-QUOTE-${quote.quoteNumber}.pdf`);
  };

  const shareInvoiceToWhatsApp = async (invoice: Invoice) => {
    const doc = buildInvoicePDF(invoice);
    const pdfBlob = doc.output("blob");
    const fileName = `MAAT-INVOICE-${invoice.invoiceNumber}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Invoice ${invoice.invoiceNumber}`,
          text: `Please find attached our Invoice Ref: ${invoice.invoiceNumber} for ${invoice.companyName || invoice.customerName}.`,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Error sharing PDF via native share:", err);
        }
      }
    } else {
      doc.save(fileName);
      const message = `Please find attached our Invoice Ref: ${invoice.invoiceNumber} for ${invoice.companyName || invoice.customerName}.`;
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
    }
  };

  const generateInvoicePDF = (invoice: Invoice) => {
    const doc = buildInvoicePDF(invoice);
    doc.save(`MAAT-INVOICE-${invoice.invoiceNumber}.pdf`);
  };

  // Operational Invoice Columns with ownership
  const invoiceColumns = [
    {
      header: t("invoiceNo") || "Invoice Ref",
      accessor: (row: Invoice) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#1B2A4A]">{row.invoiceNumber}</span>
          {row.country && (
            <span className="text-[10px] text-slate-400 font-semibold">{row.country}</span>
          )}
        </div>
      ),
      className: "w-36",
    },
    {
      header: t("clientCompany") || "Customer",
      accessor: (row: Invoice) => (
        <div>
          <div className="font-bold text-slate-800">{translateBusinessText(row.companyName || row.customerName)}</div>
          {row.customerName && row.companyName && (
            <div className="text-xs text-slate-400 font-medium">{translateBusinessText(row.customerName)}</div>
          )}
        </div>
      ),
    },
    {
      header: t("salespersonCol") || "Salesperson",
      accessor: (row: Invoice) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
          {translateBusinessText(row.salesmanName || "Salesperson")}
        </span>
      ),
      className: "w-44",
    },
    {
      header: t("grandTotalCol") || "Grand Total",
      accessor: (row: Invoice) => (
        <span className="font-extrabold text-slate-900">
          {formatCurrency(row.grandTotal)}
        </span>
      ),
      className: "w-36 text-start",
    },
    {
      header: t("statusCol") || "Status",
      accessor: (row: Invoice) => (
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${
          row.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
        }`}>
          {translateBusinessText(row.status)}
        </span>
      ),
      className: "w-28 text-center",
    },
    {
      header: t("dateCol") || "Date",
      accessor: (row: Invoice) => formatDate(row.date),
      className: "w-32",
    },
    {
      header: t("actionsCol") || "Actions",
      accessor: (row: Invoice) => (
        <ActionDropdown
          options={[
            { label: t("view") || "View Details", onClick: () => setSelectedInvoice(row) },
            { label: t("print") || "Print Bill (80mm)", onClick: () => printInvoiceThermalBill(row) },
            { label: "Download PDF", onClick: () => generateInvoicePDF(row) },
            { label: "Share via WhatsApp", onClick: () => shareInvoiceToWhatsApp(row) },
          ]}
        />
      ),
      className: "w-28 text-center",
    },
  ];

  // Operational Quote Columns with ownership
  const quoteColumns = [
    {
      header: t("quoteNo") || "Quote Ref",
      accessor: (row: Quote) => (
        <span className="font-bold text-[#1B2A4A]">{row.quoteNumber}</span>
      ),
      className: "w-36",
    },
    {
      header: t("clientCompany") || "Customer",
      accessor: (row: Quote) => (
        <div>
          <div className="font-bold text-slate-800">{translateBusinessText(row.companyName || row.customerName)}</div>
          {row.customerName && row.companyName && (
            <div className="text-xs text-slate-400 font-medium">{translateBusinessText(row.customerName)}</div>
          )}
        </div>
      ),
    },
    {
      header: t("salespersonCol") || "Salesperson",
      accessor: (row: Quote) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
          {translateBusinessText(row.salesmanName || "Salesperson")}
        </span>
      ),
      className: "w-44",
    },
    {
      header: t("grandTotalCol") || "Grand Total",
      accessor: (row: Quote) => (
        <span className="font-bold text-slate-900">
          {formatCurrency(row.grandTotal)}
        </span>
      ),
      className: "w-36 text-start",
    },
    {
      header: t("statusCol") || "Status",
      accessor: (row: Quote) => (
        <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {translateBusinessText(row.status)}
        </span>
      ),
      className: "w-28 text-center",
    },
    {
      header: t("dateCol") || "Date",
      accessor: (row: Quote) => formatDate(row.date),
      className: "w-32",
    },
    {
      header: t("actionsCol") || "Actions",
      accessor: (row: Quote) => (
        <ActionDropdown
          options={[
            { label: t("view") || "View Details", onClick: () => setSelectedQuote(row) },
            { label: "Download PDF", onClick: () => generateQuotePDF(row) },
            { label: "Share via WhatsApp", onClick: () => shareQuoteToWhatsApp(row) },
          ]}
        />
      ),
      className: "w-28 text-center",
    },
  ];

  // Operational Receipt Columns with ownership
  const receiptColumns = [
    {
      header: t("receiptNo") || "Receipt Ref",
      accessor: (row: any) => (
        <span className="font-bold text-emerald-700">{row.receiptNumber}</span>
      ),
      className: "w-36",
    },
    {
      header: t("clientCompany") || "Customer",
      accessor: (row: any) => (
        <div>
          <div className="font-bold text-slate-800">{translateBusinessText(row.companyName || row.customerName)}</div>
        </div>
      ),
    },
    {
      header: t("salespersonCol") || "Salesperson",
      accessor: (row: any) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
          {translateBusinessText(row.createdByName || row.salesmanName || "Salesperson")}
        </span>
      ),
      className: "w-44",
    },
    {
      header: t("paidCol") || "Amount Paid",
      accessor: (row: any) => (
        <span className="font-extrabold text-emerald-600">
          {formatCurrency(row.amountPaid)}
        </span>
      ),
      className: "w-36 text-start",
    },
    {
      header: t("paymentMethodCol") || "Method",
      accessor: (row: any) => (
        <span className="text-xs font-bold text-slate-700">
          {translateBusinessText(row.paymentMethod || "Cash")}
        </span>
      ),
      className: "w-28 text-center",
    },
    {
      header: t("dateCol") || "Date",
      accessor: (row: any) => formatDate(row.paymentDate || row.createdAt),
      className: "w-32",
    },
  ];

  return (
    <div className="w-full">
      {/* Dashboard Full-Width Page Header */}
      <PageHeader 
        title={t("dashboardTitle")} 
        description={
          isAdminOrAccountant
            ? t("dashboardDesc")
            : t("dashboardDesc")
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/invoices/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-white text-[#1B2A4A] font-extrabold hover:bg-slate-100 transition-all duration-150 shadow-md cursor-pointer text-sm shrink-0"
            >
              {t("createInvoice")}
            </Link>
            <Link
              href="/quotes/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#165B66] text-white font-extrabold hover:bg-[#124750] transition-all duration-150 shadow-md shadow-[#165B66]/20 cursor-pointer text-sm shrink-0"
            >
              {t("createQuote")}
            </Link>
          </div>
        }
      />

      {/* Main Dashboard Content Area */}
      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {/* SUPER ADMIN / ACCOUNTANT 4-KPI OPERATIONS BANNER */}
        {isAdminOrAccountant ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <DashboardCard
              title={t("todaysSales")}
              value={loading ? "..." : formatCurrency(metrics.todaySalesSum)}
              description={t("currentMonthSalesDesc")}
              icon={TrendingUp}
              theme="teal"
            />
            <DashboardCard
              title={t("thisMonthSales")}
              value={loading ? "..." : formatCurrency(metrics.monthlySalesSum)}
              description={t("currentMonthSalesDesc")}
              icon={Activity}
              theme="indigo"
            />
            <DashboardCard
              title={t("todaysCollections")}
              value={loading ? "..." : formatCurrency(metrics.totalPaymentsReceived)}
              description={t("totalPendingBalanceDesc")}
              icon={DollarSign}
              theme="emerald"
            />
            <DashboardCard
              title={t("pendingCreditAmount")}
              value={loading ? "..." : formatCurrency(metrics.outstandingSum)}
              description={t("totalPendingBalanceDesc")}
              icon={CreditCard}
              theme="rose"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <DashboardCard
              title={t("todaysSales")}
              value={loading ? "..." : formatCurrency(metrics.todaySalesSum)}
              description={t("currentMonthSalesDesc")}
              icon={TrendingUp}
              theme="teal"
            />
            <DashboardCard
              title={t("todaysCollections")}
              value={loading ? "..." : formatCurrency(metrics.todayCollectionSum)}
              description={t("totalPendingBalanceDesc")}
              icon={DollarSign}
              theme="emerald"
            />
            <DashboardCard
              title={t("thisMonthSales")}
              value={loading ? "..." : formatCurrency(metrics.monthlySalesSum)}
              description={t("currentMonthSalesDesc")}
              icon={Activity}
              theme="indigo"
            />
            <DashboardCard
              title={t("pendingCreditAmount")}
              value={loading ? "..." : formatCurrency(metrics.outstandingSum)}
              description={t("totalPendingBalanceDesc")}
              icon={CreditCard}
              theme="amber"
            />
          </div>
        )}

      {/* OPERATIONAL TABLES SECTION */}
      {isAdminOrAccountant ? (
        <div className="space-y-8">
          {/* Recent Invoices Operational Table */}
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#1B2A4A] flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-accent" />
                  {t("recentInvoices")}
                </h2>
              </div>
              <Link
                href="/invoices"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                {t("viewAllInvoices")} &rarr;
              </Link>
            </div>
            <DataTable
              data={recentInvoices}
              columns={invoiceColumns}
              keyExtractor={(row, idx) => row.id || row.invoiceNumber || `inv-${idx}`}
              onRowClick={(row) => setSelectedInvoice(row)}
            />
          </div>

          {/* Recent Quotations Operational Table */}
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#1B2A4A] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  {t("recentQuotations")}
                </h2>
              </div>
              <Link
                href="/quotes"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                {t("viewAllQuotes")} &rarr;
              </Link>
            </div>
            <DataTable
              data={recentQuotes}
              columns={quoteColumns}
              keyExtractor={(row, idx) => row.id || row.quoteNumber || `q-${idx}`}
              onRowClick={(row) => setSelectedQuote(row)}
            />
          </div>

          {/* Recent Receipts Operational Table */}
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#1B2A4A] flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  {t("recentReceipts")}
                </h2>
              </div>
              <Link
                href="/receipts"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                {t("viewAllReceipts")} &rarr;
              </Link>
            </div>
            <DataTable
              data={recentReceiptsList}
              columns={receiptColumns}
              keyExtractor={(row, idx) => row.id || row.receiptNumber || `rec-${idx}`}
            />
          </div>
        </div>
      ) : (
        /* SALESPERSON SIMPLE TABLES VIEW */
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                {t("recentInvoices")}
              </h2>
              <Link
                href="/invoices"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                {t("viewAllInvoices")} &rarr;
              </Link>
            </div>
            <DataTable
              data={recentInvoices}
              columns={invoiceColumns}
              keyExtractor={(row, idx) => row.id || row.invoiceNumber || `inv-${idx}`}
              onRowClick={(row) => setSelectedInvoice(row)}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                {t("recentQuotations")}
              </h2>
              <Link
                href="/quotes"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                {t("viewAllQuotes")} &rarr;
              </Link>
            </div>
            <DataTable
              data={recentQuotes}
              columns={quoteColumns}
              keyExtractor={(row, idx) => row.id || row.quoteNumber || `q-${idx}`}
              onRowClick={(row) => setSelectedQuote(row)}
            />
          </div>
        </div>
      )}
      </div>

      {/* Quote Detail Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto text-start">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t("summaryHeader")}</h3>
                <span className="text-xs font-semibold text-slate-400">Ref: {selectedQuote.quoteNumber}</span>
              </div>
              <button
                onClick={() => setSelectedQuote(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-6">
              {/* Top metadata grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm border border-slate-100">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">{t("clientCompany")}</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{translateBusinessText(selectedQuote.customerName)}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{translateBusinessText(selectedQuote.companyName)}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">{t("dateCol")} & {t("salespersonCol")}</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{formatDate(selectedQuote.date)}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{translateBusinessText(selectedQuote.salesmanName)}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">{t("itemsHeader")}</span>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-start text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-start">{t("medName")}</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center">{t("qtyHeader")}</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-start">{t("unitPrice")}</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-start">{t("subtotalHeader")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {selectedQuote.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-semibold text-slate-700 text-start">
                            {translateBusinessText(item.productName)}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-center font-medium">{item.quantity}</td>
                          <td className="px-4 py-3 text-slate-500 text-start font-medium">{formatCurrency(item.discount || item.price)}</td>
                          <td className="px-4 py-3 text-slate-800 text-start font-bold">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Calculation summary */}
              <div className="flex flex-col items-end gap-1.5 border-t border-slate-100 pt-4 text-sm font-semibold">
                <div className="flex w-64 justify-between text-slate-500">
                  <span>{t("subtotalHeader")}:</span>
                  <span>{formatCurrency(selectedQuote.subtotal)}</span>
                </div>
                {(selectedQuote.discountTotal ?? 0) > 0 && (
                  <div className="flex w-64 justify-between text-slate-500">
                    <span>{t("discountTotalLabel")}:</span>
                    <span className="text-emerald-600">-{formatCurrency(selectedQuote.discountTotal)}</span>
                  </div>
                )}
                <div className="flex w-64 justify-between text-base font-bold text-slate-900 border-t border-slate-100 pt-2 mt-1">
                  <span>{t("grandTotalCol")}:</span>
                  <span>{formatCurrency(selectedQuote.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="px-5 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                >
                  {t("close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onPrintThermal={printInvoiceThermalBill}
        />
      )}
    </div>
  );
}
