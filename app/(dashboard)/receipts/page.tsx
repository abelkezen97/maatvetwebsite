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
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();

  const loadReceipts = async (forceRefresh = false) => {
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

  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  const columns = [
    {
      header: t("receiptNo") || "Receipt Ref",
      accessor: (row: Receipt) => (
        <div className="flex flex-col">
          <span className="font-bold text-emerald-700">{row.receiptNumber}</span>
          <span className="text-[10px] text-slate-400 font-semibold">{row.country || "UAE"}</span>
        </div>
      ),
      className: "w-36",
    },
    {
      header: t("clientCompany") || "Customer",
      accessor: (row: Receipt) => (
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
      accessor: (row: Receipt) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2 py-0.5 rounded border border-slate-200/50 inline-block">
          {translateBusinessText(row.createdByName || (row as any).salesmanName || "Salesperson")}
        </span>
      ),
      className: "w-44",
    },
    {
      header: t("paymentMethodCol") || "Payment Method",
      accessor: (row: Receipt) => (
        <span className="text-xs font-bold text-slate-700">
          {translateBusinessText(row.paymentMethod || "Cash")}
        </span>
      ),
      className: "w-32",
    },
    {
      header: t("paidCol") || "Amount Paid",
      accessor: (row: Receipt) => (
        <span className="font-extrabold text-emerald-600">
          {formatCurrency(row.amountPaid)}
        </span>
      ),
      className: "w-36 text-start",
    },
    {
      header: t("paymentDate") || "Date",
      accessor: (row: Receipt) => formatDate(row.paymentDate),
      className: "w-32",
    },
    {
      header: t("actionsCol") || "Actions",
      accessor: (row: Receipt) => (
        <ActionDropdown
          options={[
            { label: t("view") || "View Details", onClick: () => setSelectedReceipt(row) },
            { label: t("print") || "Print Receipt (80mm)", onClick: () => printReceiptThermalBill(row) },
            { label: "Download PDF", onClick: () => handleDownloadPDF(row) },
          ]}
        />
      ),
      className: "w-28 text-center",
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title={t("receipts")}
        description={t("invoicesDesc")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => loadReceipts(true)}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition cursor-pointer backdrop-blur-xs"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {t("syncCatalog")}
            </button>
            <Link
              href="/receipts/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 text-white font-extrabold hover:bg-emerald-700 transition shadow-md text-sm"
            >
              <Plus className="w-5 h-5" />
              {t("newReceipt")}
            </Link>
          </div>
        }
      />

      <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto space-y-6 text-start">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <SearchInput
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
          />
        </div>

        {loading ? (
          <LoadingSkeleton type="table" />
        ) : (
          <DataTable
            data={filteredReceipts}
            columns={columns}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => setSelectedReceipt(row)}
          />
        )}
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-start">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t("receipts")}</h3>
                <span className="text-xs font-semibold text-slate-400">Ref: {selectedReceipt.receiptNumber}</span>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm border border-slate-100">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase">{t("clientCompany")}</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{translateBusinessText(selectedReceipt.customerName)}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{translateBusinessText(selectedReceipt.companyName)}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase">{t("paymentDate")}</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{formatDate(selectedReceipt.paymentDate)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <span className="text-sm font-bold text-emerald-800">{t("paidCol")}:</span>
                <span className="text-xl font-extrabold text-emerald-600">{formatCurrency(selectedReceipt.amountPaid)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6">
              <button
                onClick={() => setSelectedReceipt(null)}
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
