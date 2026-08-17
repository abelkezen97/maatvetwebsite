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
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { ActionDropdown } from "@/components/ActionDropdown";
import { printInvoiceThermalBill } from "@/lib/thermalPrintHelper";

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const cleanStr = dateStr.trim();
    const hasTime = cleanStr.includes("T") || /\s+\d+/.test(cleanStr);
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) return dateStr;

    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const formattedDate = `${day} ${month} ${year}`;

    if (hasTime) {
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = String(hours).padStart(2, "0");
      return `${formattedDate} ${formattedHours}:${minutes} ${ampm}`;
    }
    return formattedDate;
  } catch (e) {
    return dateStr;
  }
}

export default function DashboardPage() {
  const { t } = useLanguage();
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
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

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
      header: "Invoice Ref",
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
      header: "Customer",
      accessor: (row: Invoice) => (
        <div>
          <div className="font-bold text-slate-800">{row.companyName || row.customerName}</div>
          {row.customerName && row.companyName && (
            <div className="text-xs text-slate-400 font-medium">Dr: {row.customerName}</div>
          )}
        </div>
      ),
    },
    {
      header: "Salesperson",
      accessor: (row: Invoice) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
          {row.salesmanName || "Salesperson"}
        </span>
      ),
      className: "w-44",
    },
    {
      header: "Grand Total",
      accessor: (row: Invoice) => (
        <span className="font-extrabold text-slate-900">
          {row.country === "Oman" ? "OMR" : "AED"} {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      className: "w-36 text-right",
    },
    {
      header: "Status",
      accessor: (row: Invoice) => (
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${
          row.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
        }`}>
          {row.status}
        </span>
      ),
      className: "w-28 text-center",
    },
    {
      header: "Date",
      accessor: (row: Invoice) => formatDisplayDate(row.date),
      className: "w-32",
    },
    {
      header: "Actions",
      accessor: (row: Invoice) => (
        <ActionDropdown
          options={[
            { label: "View Details", onClick: () => setSelectedInvoice(row) },
            { label: "Print Bill (80mm)", onClick: () => printInvoiceThermalBill(row) },
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
      header: "Quote Ref",
      accessor: (row: Quote) => (
        <span className="font-bold text-[#1B2A4A]">{row.quoteNumber}</span>
      ),
      className: "w-36",
    },
    {
      header: "Customer",
      accessor: (row: Quote) => (
        <div>
          <div className="font-bold text-slate-800">{row.companyName || row.customerName}</div>
          {row.customerName && row.companyName && (
            <div className="text-xs text-slate-400 font-medium">Dr: {row.customerName}</div>
          )}
        </div>
      ),
    },
    {
      header: "Salesperson",
      accessor: (row: Quote) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
          {row.salesmanName || "Salesperson"}
        </span>
      ),
      className: "w-44",
    },
    {
      header: "Grand Total",
      accessor: (row: Quote) => (
        <span className="font-bold text-slate-900">
          {row.country === "Oman" ? "OMR" : "AED"} {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      className: "w-36 text-right",
    },
    {
      header: "Status",
      accessor: (row: Quote) => (
        <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {row.status}
        </span>
      ),
      className: "w-28 text-center",
    },
    {
      header: "Date",
      accessor: (row: Quote) => formatDisplayDate(row.date),
      className: "w-32",
    },
    {
      header: "Actions",
      accessor: (row: Quote) => (
        <ActionDropdown
          options={[
            { label: "View Details", onClick: () => setSelectedQuote(row) },
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
      header: "Receipt Ref",
      accessor: (row: any) => (
        <span className="font-bold text-emerald-700">{row.receiptNumber}</span>
      ),
      className: "w-36",
    },
    {
      header: "Customer",
      accessor: (row: any) => (
        <div>
          <div className="font-bold text-slate-800">{row.companyName || row.customerName}</div>
        </div>
      ),
    },
    {
      header: "Salesperson",
      accessor: (row: any) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
          {row.createdByName || row.salesmanName || "Salesperson"}
        </span>
      ),
      className: "w-44",
    },
    {
      header: "Amount Paid",
      accessor: (row: any) => (
        <span className="font-extrabold text-emerald-600">
          {row.country === "Oman" ? "OMR" : "AED"} {(Number(row.amountPaid) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      className: "w-36 text-right",
    },
    {
      header: "Method",
      accessor: (row: any) => (
        <span className="text-xs font-bold text-slate-700">
          {row.paymentMethod || "Cash"}
        </span>
      ),
      className: "w-28 text-center",
    },
    {
      header: "Date",
      accessor: (row: any) => formatDisplayDate(row.paymentDate || row.createdAt),
      className: "w-32",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Dashboard Page Header */}
      <PageHeader 
        title="Dashboard" 
        description={
          isAdminOrAccountant
            ? "High-level operational metrics, credit exposure, and cross-salesperson business overview."
            : t("dashboardDesc")
        }
        action={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#1B2A4A] text-white font-bold hover:bg-[#15223c] transition shadow-md shadow-[#1B2A4A]/15 cursor-pointer text-sm"
            >
              {t("createInvoice") || "Create Invoice"}
            </Link>
            <Link
              href="/quotes/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15 cursor-pointer text-sm"
            >
              {t("createQuote")}
            </Link>
          </div>
        }
      />

      {/* SUPER ADMIN / ACCOUNTANT 4-KPI OPERATIONS BANNER */}
      {isAdminOrAccountant ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            title="TODAY'S SALES"
            value={loading ? "..." : `AED ${metrics.todaySalesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Issued invoices today"
            icon={TrendingUp}
          />
          <DashboardCard
            title="MONTHLY SALES"
            value={loading ? "..." : `AED ${metrics.monthlySalesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Running month invoice sales"
            icon={TrendingUp}
          />
          <DashboardCard
            title="OUTSTANDING RECEIVABLES"
            value={loading ? "..." : `AED ${metrics.outstandingSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Net customer credit balance"
            icon={CreditCard}
          />
          <DashboardCard
            title="PAYMENTS RECEIVED"
            value={loading ? "..." : `AED ${metrics.totalPaymentsReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Total collected receipts"
            icon={DollarSign}
          />
        </div>
      ) : (
        /* SALESPERSON SIMPLE FOCUSED KPIS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            title="MY SALES TODAY"
            value={loading ? "..." : `AED ${metrics.todaySalesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Tax invoices issued today"
            icon={TrendingUp}
          />
          <DashboardCard
            title="MY COLLECTION TODAY"
            value={loading ? "..." : `AED ${metrics.todayCollectionSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Payment receipts collected today"
            icon={DollarSign}
          />
          <DashboardCard
            title="MONTHLY SALE"
            value={loading ? "..." : `AED ${metrics.monthlySalesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Running month invoice sales"
            icon={TrendingUp}
          />
          <DashboardCard
            title="OUTSTANDING"
            value={loading ? "..." : `AED ${metrics.outstandingSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            description="Net pending balance to collect"
            icon={CreditCard}
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
                  Recent Invoices
                </h2>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Latest tax invoices issued across assigned territories and salespersons
                </p>
              </div>
              <Link
                href="/invoices"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                View All Invoices &rarr;
              </Link>
            </div>
            <DataTable
              data={recentInvoices}
              columns={invoiceColumns}
              keyExtractor={(row, idx) => row.id || row.invoiceNumber || `inv-${idx}`}
              onRowClick={(row) => setSelectedInvoice(row)}
              emptyTitle="No recent invoices found"
              emptyDescription="No invoice records available in the business system."
            />
          </div>

          {/* Recent Quotations Operational Table */}
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#1B2A4A] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  Recent Quotations
                </h2>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Active price quotes and proposals issued to customers
                </p>
              </div>
              <Link
                href="/quotes"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                View All Quotations &rarr;
              </Link>
            </div>
            <DataTable
              data={recentQuotes}
              columns={quoteColumns}
              keyExtractor={(row, idx) => row.id || row.quoteNumber || `q-${idx}`}
              onRowClick={(row) => setSelectedQuote(row)}
              emptyTitle="No recent quotations"
              emptyDescription="No quotation records available."
            />
          </div>

          {/* Recent Receipts Operational Table */}
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#1B2A4A] flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Recent Receipts & Payments
                </h2>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Latest customer repayments and cash/bank collections
                </p>
              </div>
              <Link
                href="/receipts"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                View All Receipts &rarr;
              </Link>
            </div>
            <DataTable
              data={recentReceiptsList}
              columns={receiptColumns}
              keyExtractor={(row, idx) => row.id || row.receiptNumber || `rec-${idx}`}
              emptyTitle="No recent receipts"
              emptyDescription="No payment receipt records logged yet."
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
                My Recent Invoices
              </h2>
              <Link
                href="/invoices"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                View All &rarr;
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
                My Recent Quotations
              </h2>
              <Link
                href="/quotes"
                className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
              >
                View All &rarr;
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


      {/* Quote Detail Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Quotation Details</h3>
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
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Customer</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{selectedQuote.customerName}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{selectedQuote.companyName}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Date & Agent</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{formatDisplayDate(selectedQuote.date)}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{selectedQuote.salesmanName}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Quote Items</span>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Product</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center">Qty</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Price</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {selectedQuote.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {item.productName}
                            {item.discount < item.price && (
                              <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                (Base: AED {(item.price ?? 0).toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-center font-medium">{item.quantity}</td>
                          <td className="px-4 py-3 text-slate-500 text-right font-medium">AED {(item.discount ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-slate-800 text-right font-bold">AED {(item.total ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Calculation summary */}
              <div className="flex flex-col items-end gap-1.5 border-t border-slate-100 pt-4 text-sm font-semibold">
                <div className="flex w-64 justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>AED {(selectedQuote.subtotal ?? 0).toFixed(2)}</span>
                </div>
                {(selectedQuote.discountTotal ?? 0) > 0 && (
                  <div className="flex w-64 justify-between text-slate-500">
                    <span>Discount Total:</span>
                    <span className="text-emerald-600">-AED {(selectedQuote.discountTotal ?? 0).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex w-64 justify-between text-base font-bold text-slate-900 border-t border-slate-100 pt-2 mt-1">
                  <span>Grand Total:</span>
                  <span>AED {(selectedQuote.grandTotal ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              {selectedQuote.notes && (
                <div className="border-l-4 border-accent bg-[#61989B]/5 p-3.5 rounded-r-xl">
                  <span className="block text-xs font-bold text-[#61989B] uppercase tracking-wider mb-1">Remarks / Remarks</span>
                  <p className="text-sm text-slate-600 italic font-medium">"{selectedQuote.notes}"</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="px-5 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition focus:outline-none"
                >
                  Close
                </button>
                <button
                  onClick={() => shareQuoteToWhatsApp(selectedQuote)}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md shadow-emerald-600/10 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  Share via WhatsApp
                </button>
                <button
                  onClick={() => generateQuotePDF(selectedQuote)}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-primary hover:bg-[#15223c] rounded-xl transition shadow-md shadow-primary/10"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Invoice Details</h3>
                <span className="text-xs font-semibold text-slate-400">Ref: {selectedInvoice.invoiceNumber}</span>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-6">
              {/* Status banner */}
              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Invoice Status</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold border ${
                      selectedInvoice.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {selectedInvoice.status === "Credit" && selectedInvoice.creditDays
                        ? `Credit (${selectedInvoice.creditDays} Days)`
                        : selectedInvoice.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top metadata grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm border border-slate-100">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Customer</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{selectedInvoice.customerName}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{selectedInvoice.companyName}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Date & Agent</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{formatDisplayDate(selectedInvoice.date)}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{selectedInvoice.salesmanName}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Invoice Items</span>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Product</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center">Qty</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Price</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {selectedInvoice.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {item.productName}
                            {item.discount < item.price && (
                              <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                (Base: AED {(item.price ?? 0).toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-center font-medium">{item.quantity}</td>
                          <td className="px-4 py-3 text-slate-500 text-right font-medium">AED {(item.discount ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-slate-800 text-right font-bold">AED {(item.total ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Calculation summary */}
              <div className="flex flex-col items-end gap-1.5 border-t border-slate-100 pt-4 text-sm font-semibold">
                <div className="flex w-64 justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>AED {(selectedInvoice.subtotal ?? 0).toFixed(2)}</span>
                </div>
                {(selectedInvoice.discountTotal ?? 0) > 0 && (
                  <div className="flex w-64 justify-between text-slate-500">
                    <span>Discount Total:</span>
                    <span className="text-emerald-600">-AED {(selectedInvoice.discountTotal ?? 0).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex w-64 justify-between text-base font-bold text-slate-900 border-t border-slate-100 pt-2 mt-1">
                  <span>Grand Total:</span>
                  <span>AED {(selectedInvoice.grandTotal ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              {selectedInvoice.notes && (
                <div className="border-l-4 border-accent bg-[#61989B]/5 p-3.5 rounded-r-xl">
                  <span className="block text-xs font-bold text-[#61989B] uppercase tracking-wider mb-1">Remarks</span>
                  <p className="text-sm text-slate-600 italic font-medium">"{selectedInvoice.notes}"</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="px-5 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition focus:outline-none"
                >
                  Close
                </button>
                <button
                  onClick={() => shareInvoiceToWhatsApp(selectedInvoice)}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md shadow-emerald-600/10 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  Share via WhatsApp
                </button>
                <button
                  onClick={() => generateInvoicePDF(selectedInvoice)}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-primary hover:bg-[#15223c] rounded-xl transition shadow-md shadow-primary/10"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

