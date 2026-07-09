"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Eye, Download, X, MessageCircle, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { SearchInput } from "@/components/SearchInput";
import { mockQuotes } from "@/lib/mockData";
import { Quote, Customer } from "@/types";
import jsPDF from "jspdf";
import { buildPDF } from "@/lib/pdfHelper";
import { useAuth } from "@/hooks/useAuth";

export default function QuotesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data))
      .catch((err) => console.error("Failed to load customers:", err));

    // Load quotes from Google Sheets API
    setIsLoading(true);
    fetch("/api/quotes")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setQuotes(data);
        } else {
          setQuotes(mockQuotes);
        }
      })
      .catch((err) => {
        console.error("Failed to load quotes:", err);
        setQuotes(mockQuotes);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const shareToWhatsApp = async (quote: Quote) => {
    const doc = buildPDF(quote);
    const pdfBlob = doc.output("blob");
    const fileName = `MAAT-QUOTE-${quote.quoteNumber}.pdf`;
    
    // Construct File object for Web Share API
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    // Detect if Web Share API file sharing is supported
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
      // Fallback: Download PDF locally and redirect to WhatsApp dispatcher
      doc.save(fileName);
      const message = `Please find attached our quotation Ref: ${quote.quoteNumber} for ${quote.companyName || quote.customerName}.`;
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
    }
  };

  const filteredQuotes = useMemo(() => {
    let list = quotes;
    if (user && user.role === "Salesman") {
      list = quotes.filter((q) => q.salesmanName.toLowerCase().trim() === user.name.toLowerCase().trim());
    }

    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (q) =>
        q.quoteNumber.toLowerCase().includes(query) ||
        q.customerName.toLowerCase().includes(query) ||
        q.companyName.toLowerCase().includes(query) ||
        q.salesmanName.toLowerCase().includes(query)
    );
  }, [quotes, searchQuery, user]);

  // Premium PDF Generation using jsPDF
  const generatePDF = (quote: Quote) => {
    const doc = buildPDF(quote);
    doc.save(`MAAT-QUOTE-${quote.quoteNumber}.pdf`);
  };

  const columns = [
    {
      header: "Quote Number",
      accessor: (row: Quote) => (
        <span className="font-bold text-[#1B2A4A]">{row.quoteNumber}</span>
      ),
      className: "w-40",
    },
    {
      header: "Client / Company",
      accessor: (row: Quote) => (
        <div>
          <div className="font-bold text-slate-800">{row.customerName}</div>
          <div className="text-xs text-slate-400 font-semibold">{row.companyName}</div>
        </div>
      ),
    },
    {
      header: "Date",
      accessor: "date" as keyof Quote,
      className: "w-32",
    },
    {
      header: "Grand Total",
      accessor: (row: Quote) => (
        <span className="font-bold text-slate-900">AED {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      ),
      className: "w-40",
    },
    {
      header: "Status",
      accessor: (row: Quote) => <StatusBadge status={row.status} />,
      className: "w-36",
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
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
            title="Preview Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              generatePDF(row);
            }}
            className="p-1.5 rounded-lg hover:bg-[#61989B]/10 text-[#61989B] hover:text-[#4e7d80] transition"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              shareToWhatsApp(row);
            }}
            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 transition"
            title="Share via WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/quotes/new?edit=${row.quoteNumber}`);
            }}
            className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 hover:text-amber-700 transition"
            title="Edit Quote"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ),
      className: "w-28 text-center",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations Manager"
        description="Review quotation lists, search clients, or export print-ready PDF catalogs."
        action={
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15"
          >
            <Plus className="w-4.5 h-4.5" />
            New Quote
          </Link>
        }
      />

      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <SearchInput
          placeholder="Search by quote number, doctor name, or clinic..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
        />
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
          Showing {filteredQuotes.length} Quotes
        </div>
      </div>

      {/* Quotes Table */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-500">Loading quotations...</p>
        </div>
      ) : (
        <DataTable
          data={filteredQuotes}
          columns={columns}
          keyExtractor={(row, idx) => row.id || row.quoteNumber || `q-${idx}`}
          onRowClick={(row) => setSelectedQuote(row)}
          emptyTitle="No quotations found"
          emptyDescription="Try searching for a different customer name or quotation number."
        />
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
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
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
                  <span className="block font-bold text-slate-800 mt-0.5">{selectedQuote.date}</span>
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
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-6">
              <span className="inline-flex items-center">
                <span className="text-xs font-bold text-slate-400 mr-2">STATUS:</span>
                <StatusBadge status={selectedQuote.status} />
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="px-5 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition focus:outline-none"
                >
                  Close
                </button>
                <button
                  onClick={() => shareToWhatsApp(selectedQuote)}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md shadow-emerald-600/10 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  Share via WhatsApp
                </button>
                <button
                  onClick={() => generatePDF(selectedQuote)}
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
