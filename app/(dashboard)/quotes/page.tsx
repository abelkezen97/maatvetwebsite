"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Eye, Download, X, MessageCircle, Pencil, ArrowRightLeft, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { Quote, Customer } from "@/types";
import { buildPDF } from "@/lib/pdfHelper";
import { useAuth } from "@/hooks/useAuth";
import { ActionDropdown } from "@/components/ActionDropdown";
import { useLanguage } from "@/context/LanguageContext";

export default function QuotesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadQuotes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/quotes?t=${Date.now()}`);
      const data = await res.json();
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load quotations from Supabase:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteQuote = async (quote: Quote) => {
    if (!confirm(`Are you sure you want to delete quotation ${quote.quoteNumber}?`)) return;
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, { method: "DELETE" });
      if (res.ok) {
        setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
        if (selectedQuote?.id === quote.id) setSelectedQuote(null);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to delete quotation");
      }
    } catch (err) {
      console.error("Error deleting quotation:", err);
    }
  };

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data))
      .catch((err) => console.error("Failed to load customers:", err));

    loadQuotes();
  }, []);

  const shareToWhatsApp = async (quote: Quote) => {
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

  const filteredQuotes = useMemo(() => {
    let list = quotes;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (q) =>
          q.quoteNumber.toLowerCase().includes(query) ||
          q.customerName.toLowerCase().includes(query) ||
          q.companyName.toLowerCase().includes(query) ||
          (q.salesmanName && q.salesmanName.toLowerCase().includes(query))
      );
    }

    return [...list].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.quoteNumber.localeCompare(a.quoteNumber);
    });
  }, [quotes, searchQuery]);

  const generatePDF = (quote: Quote) => {
    const doc = buildPDF(quote);
    doc.save(`MAAT-QUOTE-${quote.quoteNumber}.pdf`);
  };

  const columns = [
    {
      header: t("quoteNo") || "Quote Number",
      accessor: (row: Quote) => (
        <span className="font-bold text-[#1B2A4A]">{row.quoteNumber}</span>
      ),
      className: "w-40",
    },
    {
      header: t("clientCompany") || "Customer",
      accessor: (row: Quote) => (
        <div>
          <div className="font-bold text-slate-800">{translateBusinessText(row.companyName || row.customerName)}</div>
          {row.companyName && row.customerName && (
            <div className="text-xs text-slate-400 font-medium">{translateBusinessText(row.customerName)}</div>
          )}
        </div>
      ),
    },
    {
      header: t("salespersonCol") || "Salesperson",
      accessor: (row: Quote) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2 py-0.5 rounded border border-slate-200/50 inline-block">
          {translateBusinessText(row.salesmanName || "Salesperson")}
        </span>
      ),
      className: "w-44",
    },
    {
      header: t("regionLabel") || "Country",
      accessor: (row: Quote) => (
        <span className="text-xs font-bold text-slate-700">
          {row.country || "UAE"}
        </span>
      ),
      className: "w-28",
    },
    {
      header: t("dateCol") || "Date",
      accessor: (row: Quote) => formatDate(row.date),
      className: "w-36",
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
      header: t("grandTotalCol") || "Grand Total",
      accessor: (row: Quote) => (
        <span className="font-extrabold text-slate-900">
          {formatCurrency(row.grandTotal)}
        </span>
      ),
      className: "w-36 text-start",
    },
    {
      header: t("actionsCol") || "Actions",
      accessor: (row: Quote) => (
        <ActionDropdown
          options={[
            { label: t("view") || "View Details", onClick: () => setSelectedQuote(row) },
            { label: "Download PDF", onClick: () => generatePDF(row) },
            { label: "Share via WhatsApp", onClick: () => shareToWhatsApp(row) },
            { label: t("edit") || "Edit Quote", onClick: () => router.push(`/quotes/new?edit=${row.quoteNumber}`) },
            { label: t("createInvoice") || "Convert to Invoice", onClick: () => router.push(`/invoices/new?fromQuote=${row.quoteNumber}`) },
          ]}
        />
      ),
      className: "w-28 text-center",
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title={t("quotesTitle")}
        description={t("quotesDesc")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadQuotes}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-accent/15 cursor-pointer disabled:opacity-50 backdrop-blur-xs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              {t("syncCatalog")}
            </button>
            <Link
              href="/quotes/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#165B66] text-white font-extrabold hover:bg-[#124750] transition shadow-md shadow-[#165B66]/20 text-sm"
            >
              <Plus className="w-5 h-5" />
              {t("createQuote")}
            </Link>
          </div>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {/* Filter and Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <SearchInput
            placeholder={t("searchProductsPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
          />
        </div>

        {/* Quotes Table */}
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4" />
            <p className="text-sm font-semibold text-slate-500">{t("loadingData")}</p>
          </div>
        ) : (
          <DataTable
            data={filteredQuotes}
            columns={columns}
            keyExtractor={(row, idx) => row.id || row.quoteNumber || `q-${idx}`}
            onRowClick={(row) => setSelectedQuote(row)}
          />
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
              <button
                onClick={() => setSelectedQuote(null)}
                className="px-5 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition focus:outline-none cursor-pointer"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
