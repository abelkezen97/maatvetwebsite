"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Receipt } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { Plus, Download, FileText, RotateCw } from "lucide-react";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";

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
      if (Array.isArray(data) && data.length > 0) {
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
    return receipts.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.referenceNo && r.referenceNo.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [receipts, searchQuery]);

  const handleDownloadPDF = (receipt: Receipt) => {
    try {
      const doc = buildReceiptPDF(receipt);
      doc.save(`MAAT-RECEIPT-${receipt.receiptNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    }
  };

  const columns = [
    {
      header: "Receipt No",
      accessor: (row: Receipt) => (
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="font-extrabold text-slate-800">{row.receiptNumber}</div>
            <div className="text-xs text-slate-400 font-semibold">{row.paymentDate}</div>
          </div>
        </div>
      ),
    },
    {
      header: "Customer / Clinic Company",
      accessor: (row: Receipt) => (
        <div>
          <div className="font-extrabold text-slate-800">{row.companyName}</div>
          {row.customerName && <div className="text-xs text-slate-400 font-semibold">{row.customerName}</div>}
        </div>
      ),
    },
    {
      header: "Amount Paid",
      accessor: (row: Receipt) => (
        <span className="font-extrabold text-emerald-600">
          AED {(row.amountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
      className: "w-40 text-right",
    },
    {
      header: "Payment Method",
      accessor: (row: Receipt) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 text-sm">{row.paymentMethod}</span>
          {row.referenceNo && <span className="text-xs text-slate-400 font-semibold">Ref: {row.referenceNo}</span>}
        </div>
      ),
      className: "w-40",
    },
    {
      header: "Actions",
      accessor: (row: Receipt) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleDownloadPDF(row)}
            className="p-2 text-slate-500 hover:text-[#61989B] hover:bg-slate-100 rounded-lg transition"
            title="Download PDF Receipt"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      ),
      className: "w-24 text-right",
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
          emptyTitle="No receipts found"
          emptyDescription="Issue a receipt when a customer pays back credit or makes a payment."
        />
      )}
    </div>
  );
}
