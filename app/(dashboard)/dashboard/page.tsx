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
import { mockQuotes, mockInvoices } from "@/lib/mockData";

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
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    // 1. Instant local load
    let localQuotes: Quote[] = [];
    let localInvoices: Invoice[] = [];
    try {
      const qStr = localStorage.getItem("maat_quotes");
      localQuotes = qStr ? JSON.parse(qStr) : mockQuotes;
      if (localQuotes.length > 0) setQuotes(localQuotes);

      const iStr = localStorage.getItem("maat_invoices");
      localInvoices = iStr ? JSON.parse(iStr) : mockInvoices;
      if (localInvoices.length > 0) setInvoices(localInvoices);
    } catch (e) {}

    async function loadDashboardData() {
      try {
        const [prodRes, custRes, quotesRes, invRes] = await Promise.all([
          fetch("/api/products").then((r) => r.json()).catch(() => ({ products: [] })),
          fetch("/api/customers").then((r) => r.json()).catch(() => ({ customers: [] })),
          fetch("/api/quotes").then((r) => r.json()).catch(() => []),
          fetch("/api/invoices").then((r) => r.json()).catch(() => []),
        ]);

        if (prodRes.products) setProducts(prodRes.products);
        if (custRes.customers) setCustomers(custRes.customers);

        let finalQuotes = [...localQuotes];
        if (Array.isArray(quotesRes) && quotesRes.length > 0) {
          const merged = [...quotesRes];
          localQuotes.forEach((lq) => {
            if (lq.quoteNumber && !merged.some((rq) => rq.quoteNumber === lq.quoteNumber)) {
              merged.unshift(lq);
            }
          });
          finalQuotes = merged;
        }
        setQuotes(finalQuotes);
        localStorage.setItem("maat_quotes", JSON.stringify(finalQuotes));

        let finalInvoices = [...localInvoices];
        if (Array.isArray(invRes) && invRes.length > 0) {
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
              status: item.status || "Unpaid",
              items: [],
              subtotal: parseFloat(item.grandTotal) || 0,
              discountTotal: 0,
              taxTotal: 0,
            };
          });

          const mergedInvs = [...parsedInvoices];
          localInvoices.forEach((li) => {
            if (li.invoiceNumber && !mergedInvs.some((ri) => ri.invoiceNumber === li.invoiceNumber)) {
              mergedInvs.unshift(li);
            }
          });
          finalInvoices = mergedInvs;
        }
        setInvoices(finalInvoices);
        localStorage.setItem("maat_invoices", JSON.stringify(finalInvoices));
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // Segment quotes & invoices by Salesman role restrictions
  const visibleQuotes = useMemo(() => {
    if (user && user.role === "Salesman") {
      return quotes.filter((q) => q.salesmanName.toLowerCase().trim() === user.name.toLowerCase().trim());
    }
    return quotes;
  }, [quotes, user]);

  const visibleInvoices = useMemo(() => {
    if (user && user.role === "Salesman") {
      return invoices.filter((i) => i.salesmanName.toLowerCase().trim() === user.name.toLowerCase().trim());
    }
    return invoices;
  }, [invoices, user]);

  // Compute metrics
  const metrics = useMemo(() => {
    const totalProducts = products.length;
    const totalClients = customers.length;

    // 1. Calculate running month total invoice sales
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    const thisMonthInvoices = visibleInvoices.filter((inv) => {
      if (!inv.date) return false;
      const invDate = new Date(inv.date);
      if (isNaN(invDate.getTime())) return false;
      return invDate.getFullYear() === currentYear && invDate.getMonth() === currentMonth;
    });

    const thisMonthSales = thisMonthInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    // 2. Calculate Pending Billwise Amount total from Customers
    const pendingCreditAmount = customers.reduce((sum, c) => sum + (c.pendingBillwiseAmount || 0), 0);

    return {
      totalProducts,
      totalClients,
      thisMonthSales,
      pendingCreditAmount,
    };
  }, [products, customers, visibleInvoices]);

  // Recent 3 quotes
  const recentQuotes = useMemo(() => {
    return [...visibleQuotes].sort((a, b) => b.quoteNumber.localeCompare(a.quoteNumber)).slice(0, 3);
  }, [visibleQuotes]);

  // Recent 3 invoices
  const recentInvoices = useMemo(() => {
    return [...visibleInvoices].sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber)).slice(0, 3);
  }, [visibleInvoices]);

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
      header: "Date",
      accessor: (row: Quote) => formatDisplayDate(row.date),
      className: "w-44",
    },
    {
      header: t("grandTotalCol"),
      accessor: (row: Quote) => (
        <span className="font-bold text-slate-900">AED {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      ),
    },
    {
      header: "Actions",
      accessor: (row: Quote) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedQuote(row);
            }}
            title="View Details"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-800 transition cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              generateQuotePDF(row);
            }}
            title="Download PDF"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-800 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              shareQuoteToWhatsApp(row);
            }}
            title="Share via WhatsApp"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-800 transition cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/quotes/new?edit=${row.quoteNumber}`);
            }}
            title="Edit Quote"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-[#61989B] transition cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // Columns for recent invoices table
  const invoiceColumns = [
    {
      header: "Invoice Number",
      accessor: (row: Invoice) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#1B2A4A]">{row.invoiceNumber}</span>
          {row.quoteNumber && (
            <span className="text-[10px] text-slate-400 font-semibold">From Quote: {row.quoteNumber}</span>
          )}
        </div>
      ),
    },
    {
      header: t("clientCompany"),
      accessor: (row: Invoice) => (
        <div>
          <div className="font-bold text-slate-800">{row.customerName}</div>
          <div className="text-xs text-slate-400 font-medium">{row.companyName}</div>
        </div>
      ),
    },
    {
      header: "Date",
      accessor: (row: Invoice) => formatDisplayDate(row.date),
      className: "w-44",
    },
    {
      header: t("grandTotalCol"),
      accessor: (row: Invoice) => (
        <span className="font-bold text-slate-900">AED {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      ),
    },
    {
      header: "Status",
      accessor: (row: Invoice) => {
        let badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
        if (row.status === "Paid") badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";

        const label = row.status === "Credit" && row.creditDays
          ? `Credit (${row.creditDays} Days)`
          : row.status;

        return (
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold border ${badgeColor}`}>
            {label}
          </span>
        );
      },
      className: "w-36 text-center",
    },
    {
      header: "Actions",
      accessor: (row: Invoice) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedInvoice(row);
            }}
            title="View Details"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-800 transition cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              generateInvoicePDF(row);
            }}
            title="Download PDF"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-800 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              shareInvoiceToWhatsApp(row);
            }}
            title="Share via WhatsApp"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-800 transition cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/invoices/new?edit=${row.invoiceNumber}`);
            }}
            title="Edit Invoice"
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-amber-600 transition cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
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
          <div className="flex flex-wrap gap-3">
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-bold hover:bg-[#15223c] transition shadow-md shadow-primary/15"
            >
              {t("createInvoice") || "Create Invoice"}
            </Link>
            <Link
              href="/quotes/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15"
            >
              {t("createQuote")}
            </Link>
          </div>
        }
      />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title={t("totalProducts").toUpperCase()}
          value={loading ? "..." : metrics.totalProducts}
          description={t("cataloguedMedicines")}
          icon={Package}
          trend={{ value: "12%", isPositive: true }}
        />
        <DashboardCard
          title={t("activeClients").toUpperCase()}
          value={loading ? "..." : metrics.totalClients}
          description={t("veterinaryClinicsFarms")}
          icon={Users}
          trend={{ value: "8%", isPositive: true }}
        />
        <DashboardCard
          title={(t("thisMonthSales") || "THIS MONTH SALES").toUpperCase()}
          value={loading ? "..." : `AED ${metrics.thisMonthSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          description={t("currentMonthSalesDesc") || "total invoice sales for running month"}
          icon={TrendingUp}
          trend={{ value: "18%", isPositive: true }}
        />
        <DashboardCard
          title={(t("pendingCreditAmount") || "PENDING CREDIT AMOUNT").toUpperCase()}
          value={loading ? "..." : `AED ${metrics.pendingCreditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          description={t("totalPendingBalanceDesc") || "total customer credit outstanding"}
          icon={CreditCard}
          trend={{ value: "5%", isPositive: false }}
        />
      </div>

      {/* Recent Invoices Section */}
      <div className="space-y-4 w-full mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            {t("recentInvoices") || "Recent Invoices"}
          </h2>
          <Link
            href="/invoices"
            className="text-xs font-bold text-accent hover:text-[#4e7d80] flex items-center gap-1 transition"
          >
            {(t("viewAllInvoices") || "View All Invoices")} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </Link>
        </div>
        <DataTable
          data={recentInvoices}
          columns={invoiceColumns}
          keyExtractor={(row, idx) => row.id || row.invoiceNumber || `inv-${idx}`}
          onRowClick={(row) => setSelectedInvoice(row)}
          emptyTitle="No invoices found"
          emptyDescription="Create your first invoice using the Create Invoice button above."
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
          onRowClick={(row) => setSelectedQuote(row)}
        />
      </div>


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

