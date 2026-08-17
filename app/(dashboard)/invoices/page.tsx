"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Eye, Download, X, MessageCircle, Pencil, Trash2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { Invoice, Customer } from "@/types";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { useAuth } from "@/hooks/useAuth";
import { ActionDropdown, ActionOption } from "@/components/ActionDropdown";
import { printInvoiceThermalBill } from "@/lib/thermalPrintHelper";
import { useLanguage } from "@/context/LanguageContext";
import { InvoiceDetailModal } from "@/components/InvoiceDetailModal";

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerIdParam = searchParams.get("customerId");
  const { user } = useAuth();
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const url = customerIdParam
        ? `/api/invoices?customerId=${customerIdParam}&t=${Date.now()}`
        : `/api/invoices?t=${Date.now()}`;
      const res = await fetch(url);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load invoices from API:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [customerIdParam]);

  const handleDelete = async (invoice: Invoice) => {
    if (!confirm(`Are you sure you want to delete invoice ${invoice.invoiceNumber}?`)) return;
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      if (res.ok) {
        setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
        if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to delete invoice");
      }
    } catch (err) {
      console.error("Error deleting invoice:", err);
    }
  };

  const saveInvoicesToStateAndStorage = (updatedList: Invoice[]) => {
    setInvoices(updatedList);
    localStorage.setItem("maat_invoices", JSON.stringify(updatedList));
  };

  const shareToWhatsApp = async (invoice: Invoice) => {
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

  const filteredInvoices = useMemo(() => {
    let list = invoices;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(query) ||
          (i.quoteNumber && i.quoteNumber.toLowerCase().includes(query)) ||
          i.customerName.toLowerCase().includes(query) ||
          i.companyName.toLowerCase().includes(query) ||
          (i.salesmanName && i.salesmanName.toLowerCase().includes(query))
      );
    }

    return [...list].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.invoiceNumber.localeCompare(a.invoiceNumber);
    });
  }, [invoices, searchQuery]);

  const generatePDF = (invoice: Invoice) => {
    const doc = buildInvoicePDF(invoice);
    doc.save(`MAAT-INVOICE-${invoice.invoiceNumber}.pdf`);
  };

  const columns = [
    {
      header: t("invoiceNo") || "Invoice Number",
      accessor: (row: Invoice) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#1B2A4A]">{row.invoiceNumber}</span>
          {row.quoteNumber && (
            <span className="text-[10px] text-slate-400 font-semibold">From Quote: {row.quoteNumber}</span>
          )}
        </div>
      ),
      className: "w-40",
    },
    {
      header: t("clientCompany") || "Customer",
      accessor: (row: Invoice) => (
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
      accessor: (row: Invoice) => (
        <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2 py-0.5 rounded border border-slate-200/50 inline-block">
          {translateBusinessText(row.salesmanName || "Salesperson")}
        </span>
      ),
      className: "w-44",
    },
    {
      header: t("dateCol") || "Invoice Date",
      accessor: (row: Invoice) => formatDate(row.date),
      className: "w-36",
    },
    {
      header: t("statusCol") || "Payment Status",
      accessor: (row: Invoice) => {
        let badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
        if (row.status === "Paid") badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";

        return (
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>
            {translateBusinessText(row.status)}
          </span>
        );
      },
      className: "w-36 text-center",
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
      header: t("actionsCol") || "Actions",
      accessor: (row: Invoice) => {
        const options: ActionOption[] = [
          { label: t("view") || "View Details", onClick: () => setSelectedInvoice(row) },
          { label: t("print") || "Print Bill (80mm)", onClick: () => printInvoiceThermalBill(row) },
          { label: "Download PDF", onClick: () => generatePDF(row) },
          { label: "Share Invoice via WhatsApp", onClick: () => shareToWhatsApp(row) },
        ];
        return <ActionDropdown options={options} />;
      },
      className: "w-28 text-center",
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title={t("invoicesTitle")}
        description={t("invoicesDesc")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadInvoices}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-accent/15 cursor-pointer disabled:opacity-50 backdrop-blur-xs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              {t("syncCatalog")}
            </button>
            <Link
              href="/invoices/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-white text-[#1B2A4A] font-extrabold hover:bg-slate-100 transition shadow-md text-sm"
            >
              <Plus className="w-5 h-5" />
              {t("createInvoice")}
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

        {/* Invoices Table */}
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4" />
            <p className="text-sm font-semibold text-slate-500">{t("loadingData")}</p>
          </div>
        ) : (
          <DataTable
            data={filteredInvoices}
            columns={columns}
            keyExtractor={(row, idx) => row.id || row.invoiceNumber || `inv-${idx}`}
            onRowClick={(row) => setSelectedInvoice(row)}
          />
        )}
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onPrintThermal={printInvoiceThermalBill}
          onDownloadPDF={generatePDF}
        />
      )}
    </div>
  );
}
