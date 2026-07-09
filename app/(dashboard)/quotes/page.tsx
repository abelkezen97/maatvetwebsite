"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { FileText, Plus, Search, Eye, Download, X, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { SearchInput } from "@/components/SearchInput";
import { mockQuotes } from "@/lib/mockData";
import { Quote, Customer } from "@/types";
import jsPDF from "jspdf";

// Reusable PDF Drawing helper function
const buildPDF = (quote: Quote): jsPDF => {
  const doc = new jsPDF();

  // 1. Color Palette Definitions
  const primaryColor = [27, 42, 74]; // #1B2A4A
  const accentColor = [97, 152, 155]; // #61989B
  const greyDark = [50, 50, 50];
  const greyLight = [220, 220, 220];

  // Header Background Block
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 35, "F");

  // Title / Ref No Only in White
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("QUOTATION", 15, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Ref: ${quote.quoteNumber}`, 15, 23);

  // Reset text color for content
  doc.setTextColor(greyDark[0], greyDark[1], greyDark[2]);

  const hasDiscount = quote.discountTotal > 0;

  // Table Headers
  doc.setFont("helvetica", "bold");
  doc.text("Item / Product Details", 15, 44);
  doc.text("Qty", 115, 44, { align: "right" });
  if (hasDiscount) {
    doc.text("Base Price", 142, 44, { align: "right" });
    doc.text("Disc. Price", 168, 44, { align: "right" });
  } else {
    doc.text("Price", 168, 44, { align: "right" });
  }
  doc.text("Total (AED)", 195, 44, { align: "right" });

  // Table divider
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.5);
  doc.line(15, 47, 195, 47);
  doc.setLineWidth(0.1);

  // Table Rows
  let yPos = 55;
  doc.setFont("helvetica", "normal");
  quote.items.forEach((item) => {
    // Split description if it overflows
    const splitName = doc.splitTextToSize(item.productName, 90);
    doc.text(splitName, 15, yPos);
    doc.text(`${item.quantity}`, 115, yPos, { align: "right" });
    if (hasDiscount) {
      doc.text(`${item.price.toFixed(2)}`, 142, yPos, { align: "right" });
      const discVal = item.discount < item.price ? item.discount.toFixed(2) : "—";
      doc.text(discVal, 168, yPos, { align: "right" });
    } else {
      doc.text(`${item.price.toFixed(2)}`, 168, yPos, { align: "right" });
    }
    doc.text(`${item.total.toFixed(2)}`, 195, yPos, { align: "right" });

    const lines = splitName.length;
    yPos += 8 + (lines - 1) * 4;
  });

  // Summary calculation block
  yPos += 5;
  doc.setDrawColor(greyLight[0], greyLight[1], greyLight[2]);
  doc.line(15, yPos, 195, yPos);

  yPos += 10;
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", 135, yPos);
  doc.text(`${quote.subtotal.toFixed(2)}`, 195, yPos, { align: "right" });

  if (quote.discountTotal > 0) {
    yPos += 6;
    doc.text("Discount Total:", 135, yPos);
    doc.text(`-${quote.discountTotal.toFixed(2)}`, 195, yPos, { align: "right" });
  }

  yPos += 8;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("Grand Total (AED):", 135, yPos);
  doc.text(`${quote.grandTotal.toFixed(2)}`, 195, yPos, { align: "right" });

  // Footer signature / disclaimer
  yPos += 20;
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text("Notes / Remarks:", 15, yPos);
  doc.text(`${quote.notes || "This is a computer generated quote. Pricing valid for 30 days."}`, 15, yPos + 5);

  return doc;
};

export default function QuotesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data))
      .catch((err) => console.error("Failed to load customers:", err));
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
    return mockQuotes.filter(
      (q) =>
        q.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.companyName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

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
      <DataTable
        data={filteredQuotes}
        columns={columns}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => setSelectedQuote(row)}
        emptyTitle="No quotations found"
        emptyDescription="Try searching for a different customer name or quotation number."
      />

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
                                (Base: AED {item.price.toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-center font-medium">{item.quantity}</td>
                          <td className="px-4 py-3 text-slate-500 text-right font-medium">AED {item.discount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-slate-800 text-right font-bold">AED {item.total.toFixed(2)}</td>
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
                  <span>AED {selectedQuote.subtotal.toFixed(2)}</span>
                </div>
                {selectedQuote.discountTotal > 0 && (
                  <div className="flex w-64 justify-between text-slate-500">
                    <span>Discount Total:</span>
                    <span className="text-emerald-600">-{selectedQuote.discountTotal.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex w-64 justify-between text-base font-bold text-slate-900 border-t border-slate-100 pt-2 mt-1">
                  <span>Grand Total:</span>
                  <span>AED {selectedQuote.grandTotal.toFixed(2)}</span>
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
