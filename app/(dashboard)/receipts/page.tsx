"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Receipt } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { Plus, Download, FileText, RotateCw, X } from "lucide-react";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";
import { ActionDropdown } from "@/components/ActionDropdown";
import { printReceiptThermalBill } from "@/lib/thermalPrintHelper";

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useLanguage();

  const loadReceipts = async (forceRefresh = false) => {
    // Read local cache immediately to prevent blank waiting state
    const local = localStorage.getItem("maat_receipts");
    if (local && !forceRefresh) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReceipts(parsed);
          setLoading(false);
        }
      } catch (e) {}
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch(`/api/receipts?refresh=true&t=${Date.now()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setReceipts(data);
        localStorage.setItem("maat_receipts", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Failed to fetch receipts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, []);

  const filteredReceipts = useMemo(() => {
    let list = receipts;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(query) ||
          r.companyName.toLowerCase().includes(query) ||
          (r.referenceNo && r.referenceNo.toLowerCase().includes(query))
      );
    }
    return [...list].sort((a, b) => {
      const timeA = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
      const timeB = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.receiptNumber.localeCompare(a.receiptNumber);
    });
  }, [receipts, searchQuery]);

  const handleDownloadPDF = (receipt: Receipt) => {
    try {
      const doc = buildReceiptPDF(receipt);
      doc.save(`MAAT-RECEIPT-${receipt.receiptNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    }
  };

  const handleDeleteReceipt = async (receipt: Receipt) => {
    if (!confirm(`Are you sure you want to delete receipt ${receipt.receiptNumber}?`)) return;
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: "DELETE" });
      if (res.ok) {
        setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to delete receipt");
      }
    } catch (err) {
      console.error("Error deleting receipt:", err);
    }
  };

  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  const columns = [
    {
      header: "Receipt Ref",
      accessor: (row: Receipt) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#1B2A4A]">{row.receiptNumber}</span>
          <span className="text-[10px] text-slate-400 font-semibold">{row.country || "UAE"}</span>
        </div>
      ),
      className: "w-36",
    },
    {
      header: "Customer",
      accessor: (row: Receipt) => (
        <div>
          <div className="font-bold text-slate-800">{row.companyName || row.customerName}</div>
          {row.companyName && row.customerName && (
            <div className="text-xs text-slate-400 font-medium">Dr: {row.customerName}</div>
          )}
        </div>
      ),
    },
    {
      header: "Invoice Ref",
      accessor: (row: Receipt) => (
        <span className="text-xs font-mono font-bold text-slate-600">
          {row.referenceNo || row.invoiceId || "Direct Credit"}
        </span>
      ),
      className: "w-36",
    },
    {
      header: "Salesperson",
      accessor: (row: Receipt) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2 py-0.5 rounded border border-slate-200/50 inline-block">
          {row.createdByName || (row as any).salesmanName || "Salesperson"}
        </span>
      ),
      className: "w-44",
    },
    {
      header: "Payment Method",
      accessor: (row: Receipt) => (
        <span className="text-xs font-bold text-slate-700">
          {row.paymentMethod || "Cash"}
        </span>
      ),
      className: "w-32",
    },
    {
      header: "Amount Paid",
      accessor: (row: Receipt) => (
        <span className="font-extrabold text-emerald-600">
          {row.country === "Oman" ? "OMR" : "AED"} {(row.amountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      className: "w-36 text-right",
    },
    {
      header: "Receipt Date",
      accessor: (row: Receipt) => row.paymentDate || row.createdAt?.split("T")[0] || "",
      className: "w-32",
    },
    {
      header: "Actions",
      accessor: (row: Receipt) => (
        <ActionDropdown
          options={[
            { label: "View Receipt Details", onClick: () => setSelectedReceipt(row) },
            { label: "Print Receipt Bill (80mm)", onClick: () => printReceiptThermalBill(row) },
            { label: "Download PDF Receipt", onClick: () => handleDownloadPDF(row) },
            { label: "Delete Receipt", onClick: () => handleDeleteReceipt(row), danger: true },
          ]}
        />
      ),
      className: "w-28 text-center",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("receipts") || "Customer Receipts"}
        description="Record customer repayments, issue payment receipts, and deduct paid credit from pending billwise balance."
        action={
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => loadReceipts(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Sync Receipts
            </button>
            <Link
              href="/receipts/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15 cursor-pointer text-sm"
            >
              <Plus className="w-5 h-5" /> Issue Receipt
            </Link>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <SearchInput
          placeholder="Search by receipt #, customer, reference..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
        />
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
          Showing {filteredReceipts.length} Receipts
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton type="table" />
      ) : (
        <DataTable
          data={filteredReceipts}
          columns={columns}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => setSelectedReceipt(row)}
          emptyTitle="No receipts found"
          emptyDescription="Issue a receipt when a customer pays back credit or makes a payment."
        />
      )}

      {/* Receipt Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">RECEIPT Details</h3>
                <span className="text-xs font-mono font-bold text-emerald-600">Ref: {selectedReceipt.receiptNumber}</span>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PAYMENT INFORMATION Section */}
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <div className="text-[10px] font-black text-[#61989B] uppercase tracking-wider pb-2 border-b border-slate-200/60">
                  PAYMENT INFORMATION
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Customer</span>
                    <span className="font-extrabold text-[#1B2A4A] mt-0.5 block">{selectedReceipt.companyName || selectedReceipt.customerName}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Invoice Ref</span>
                    <span className="font-mono font-bold text-slate-800 mt-0.5 block">{selectedReceipt.referenceNo || selectedReceipt.invoiceId || "Direct Credit"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Salesperson</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">{selectedReceipt.createdByName || (selectedReceipt as any).salesmanName || "Salesperson"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Payment Method</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">{selectedReceipt.paymentMethod || "Cash"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Amount Paid</span>
                    <span className="font-black text-emerald-600 text-sm mt-0.5 block">
                      {selectedReceipt.country === "Oman" ? "OMR" : "AED"} {(selectedReceipt.amountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Receipt Date</span>
                    <span className="font-bold text-slate-700 mt-0.5 block">{selectedReceipt.paymentDate || selectedReceipt.createdAt?.split("T")[0]}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Created By</span>
                    <span className="font-bold text-slate-700 mt-0.5 block">{selectedReceipt.createdByName || "System"}</span>
                  </div>
                </div>
              </div>

              {selectedReceipt.notes && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Notes / Remarks</span>
                  <p className="text-slate-700 italic font-medium">"{selectedReceipt.notes}"</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
              <button
                onClick={() => printReceiptThermalBill(selectedReceipt)}
                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Print 80mm
              </button>
              <button
                onClick={() => handleDownloadPDF(selectedReceipt)}
                className="px-4 py-2.5 text-xs font-bold text-white bg-accent hover:bg-[#4e7d80] rounded-xl transition shadow-sm cursor-pointer"
              >
                Download PDF
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
