"use client";

import React, { useEffect, useState } from "react";
import { X, Printer, Download, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { Invoice } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { printInvoiceThermalBill } from "@/lib/thermalPrintHelper";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { useAuth } from "@/hooks/useAuth";
import { Permissions } from "@/lib/auth/permissions";

interface InvoiceDetailModalProps {
  invoice: Invoice;
  onClose: () => void;
  onPrintThermal?: (invoice: Invoice) => void;
  onDownloadPDF?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
}

export function InvoiceDetailModal({
  invoice,
  onClose,
  onPrintThermal,
  onDownloadPDF,
  onEdit,
}: InvoiceDetailModalProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();
  const [fullInvoice, setFullInvoice] = useState<Invoice>(invoice);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const canEdit = profile ? Permissions.canEditInvoice(profile) : false;

  useEffect(() => {
    setFullInvoice(invoice);

    // If invoice items are missing or empty, attempt fetching full record from API
    if (!invoice.items || invoice.items.length === 0) {
      setIsLoading(true);
      const targetId = invoice.id || invoice.invoiceNumber;
      fetch(`/api/invoices/${encodeURIComponent(targetId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && !data.error && Array.isArray(data.items)) {
            setFullInvoice(data);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch full invoice detail:", err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [invoice]);

  const items = fullInvoice.items || [];
  const status = fullInvoice.status || "Credit";

  const handlePrint = () => {
    if (onPrintThermal) {
      onPrintThermal(fullInvoice);
    } else {
      printInvoiceThermalBill(fullInvoice);
    }
  };

  const handleDownload = () => {
    if (onDownloadPDF) {
      onDownloadPDF(fullInvoice);
    } else {
      const doc = buildInvoicePDF(fullInvoice);
      doc.save(`MAAT-INVOICE-${fullInvoice.invoiceNumber}.pdf`);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(fullInvoice);
    } else {
      router.push(`/invoices/new?edit=${encodeURIComponent(fullInvoice.invoiceNumber || fullInvoice.id)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto text-start">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 sm:mb-5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {t("invoicesTitle") || "Invoices Manager"}
            </h3>
            <span className="text-xs font-bold text-slate-400">
              Ref: {fullInvoice.invoiceNumber}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-5">
          {/* Status banner */}
          <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <div>
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                {t("statusCol") || "STATUS"}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex px-3 py-0.5 rounded-full text-xs font-extrabold border ${
                    status === "Paid"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  [{translateBusinessText(status)}]
                </span>
              </div>
            </div>
          </div>

          {/* Customer & Date metadata grid */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 sm:p-4 rounded-xl text-sm border border-slate-100">
            <div>
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                {t("clientCompany") || "CLIENT / COMPANY"}
              </span>
              <span className="block font-bold text-slate-800 mt-0.5">
                {translateBusinessText(fullInvoice.customerName || "Customer")}
              </span>
              <span className="block text-slate-500 text-xs mt-0.5">
                {translateBusinessText(fullInvoice.companyName || "")}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                {t("dateCol") || "DATE"} & {t("salespersonCol") || "SALESPERSON"}
              </span>
              <span className="block font-bold text-slate-800 mt-0.5">
                {formatDate(fullInvoice.date)}
              </span>
              <span className="block text-slate-500 text-xs mt-0.5">
                {translateBusinessText(fullInvoice.salesmanName || "Salesperson")}
              </span>
            </div>
          </div>

          {/* Products / Line Items Section */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t("itemsProductsHeader") || "ITEMS / PRODUCTS"}
            </span>

            {isLoading ? (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent mx-auto mb-2" />
                <span className="text-xs text-slate-400 font-semibold">
                  {t("loadingData") || "Loading line items..."}
                </span>
              </div>
            ) : items.length === 0 ? (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center text-xs font-semibold text-slate-400">
                {t("noItemsRecorded") || "No products / line items recorded for this invoice."}
              </div>
            ) : (
              <div className="border border-slate-200/80 rounded-xl overflow-x-auto shadow-xs">
                <table className="w-full text-start text-xs sm:text-sm min-w-[500px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200/80">
                    <tr>
                      <th className="px-3.5 py-2.5 text-xs font-bold text-slate-500 uppercase text-start">
                        {t("productHeader") || "Product"}
                      </th>
                      <th className="px-3 py-2.5 text-xs font-bold text-slate-500 uppercase text-center w-16 sm:w-20">
                        {t("qtyHeader") || "Qty"}
                      </th>
                      <th className="px-3 py-2.5 text-xs font-bold text-slate-500 uppercase text-start w-28 sm:w-32">
                        {t("priceCol") || "Unit Price"}
                      </th>
                      <th className="px-3 py-2.5 text-xs font-bold text-slate-500 uppercase text-start w-24 sm:w-28">
                        {t("discountCol") || "Discount"}
                      </th>
                      <th className="px-3.5 py-2.5 text-xs font-bold text-slate-500 uppercase text-start w-28 sm:w-32">
                        {t("totalCol") || "Total"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((item, idx) => {
                      const unitPrice = item.price ?? item.unitPrice ?? 0;
                      const discount = item.discount ?? 0;
                      const total = item.total ?? item.quantity * unitPrice;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3.5 py-3 font-bold text-slate-800 text-start leading-snug">
                            {translateBusinessText(item.productName || "Product")}
                          </td>
                          <td className="px-3 py-3 text-slate-600 text-center font-bold">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-3 text-slate-600 text-start font-semibold">
                            {formatCurrency(unitPrice)}
                          </td>
                          <td className="px-3 py-3 text-slate-600 text-start font-semibold">
                            {discount > 0 ? (
                              <span className="text-emerald-600 font-bold">
                                {formatCurrency(discount)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-slate-900 text-start font-extrabold">
                            {formatCurrency(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Financial Totals Summary */}
          <div className="flex flex-col items-end gap-1.5 border-t border-slate-100 pt-4 text-xs sm:text-sm font-semibold">
            {(fullInvoice.subtotal !== undefined && fullInvoice.subtotal > 0) && (
              <div className="flex w-64 justify-between text-slate-500">
                <span>{t("subtotalHeader") || "Subtotal"}:</span>
                <span className="font-bold">{formatCurrency(fullInvoice.subtotal)}</span>
              </div>
            )}

            {(fullInvoice.discountTotal !== undefined && fullInvoice.discountTotal > 0) && (
              <div className="flex w-64 justify-between text-slate-500">
                <span>{t("discountTotalLabel") || "Discount"}:</span>
                <span className="text-emerald-600 font-bold">
                  -{formatCurrency(fullInvoice.discountTotal)}
                </span>
              </div>
            )}

            {(fullInvoice.taxTotal !== undefined && fullInvoice.taxTotal > 0) && (
              <div className="flex w-64 justify-between text-slate-500">
                <span>{t("vatLabel") || "VAT"}:</span>
                <span className="font-bold">{formatCurrency(fullInvoice.taxTotal)}</span>
              </div>
            )}

            <div className="flex w-64 justify-between text-base font-extrabold text-slate-900 border-t border-slate-200 pt-2 mt-1">
              <span>{t("grandTotalCol") || "Grand Total"}:</span>
              <span>{formatCurrency(fullInvoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer / Touch-friendly Action Buttons */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-4 mt-5 gap-3">
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={handleEdit}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition cursor-pointer"
              >
                <Pencil className="w-4 h-4 text-amber-700" />
                {t("edit") || "Edit Invoice"}
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              {t("print") || "Print Bill (80mm)"}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Download PDF
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
          >
            {t("close") || "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
