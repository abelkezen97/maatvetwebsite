"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Eye, Download, X, MessageCircle, Pencil, Trash2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { Invoice, Customer } from "@/types";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { mockInvoices } from "@/lib/mockData";
import { useAuth } from "@/hooks/useAuth";

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

export default function InvoicesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadInvoices = () => {
    setIsLoading(true);
    fetch("/api/invoices")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const parsedInvoices = data.map((item: any) => {
            // If it is already parsed and contains items array, return it directly
            if (item && Array.isArray(item.items)) {
              return item;
            }
            if (item.invoiceJson) {
              try {
                return JSON.parse(item.invoiceJson);
              } catch (e) {
                // fallback
              }
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
          setInvoices(parsedInvoices);
          localStorage.setItem("maat_invoices", JSON.stringify(parsedInvoices));
        } else {
          const localData = localStorage.getItem("maat_invoices");
          setInvoices(localData ? JSON.parse(localData) : mockInvoices);
        }
      })
      .catch((err) => {
        console.error("Failed to load invoices from API:", err);
        const localData = localStorage.getItem("maat_invoices");
        setInvoices(localData ? JSON.parse(localData) : mockInvoices);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

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

  const shareReceiptToWhatsApp = async (invoice: Invoice) => {
    const localRecsStr = localStorage.getItem("maat_receipts");
    const localRecs: any[] = localRecsStr ? JSON.parse(localRecsStr) : [];
    let matchedReceipt = localRecs.find(
      (r) =>
        r.referenceNo?.includes(invoice.invoiceNumber) ||
        r.notes?.includes(invoice.invoiceNumber) ||
        (r.companyName === invoice.companyName && Math.abs(r.amountPaid - invoice.grandTotal) < 0.01)
    );

    if (!matchedReceipt) {
      const year = new Date().getFullYear();
      const count = localRecs.length + 1;
      matchedReceipt = {
        id: `rec-${Date.now()}`,
        receiptNumber: `REC-${year}-0${String(count).padStart(3, "0")}`,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        companyName: invoice.companyName,
        amountPaid: invoice.grandTotal,
        remainingPendingAmount: 0,
        paymentDate: invoice.date || new Date().toISOString().split("T")[0],
        paymentMethod: "Cash",
        referenceNo: `Auto-Paid for ${invoice.invoiceNumber}`,
        notes: `Auto-generated receipt voucher for Paid Invoice ${invoice.invoiceNumber}`,
        createdBy: user?.name || "Admin",
      };
      const updatedRecs = [matchedReceipt, ...localRecs];
      localStorage.setItem("maat_receipts", JSON.stringify(updatedRecs));
    }

    const { buildReceiptPDF } = await import("@/lib/pdfReceiptHelper");
    const doc = buildReceiptPDF(matchedReceipt);
    const pdfBlob = doc.output("blob");
    const fileName = `MAAT-RECEIPT-${matchedReceipt.receiptNumber}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Receipt ${matchedReceipt.receiptNumber}`,
          text: `Please find attached Payment Receipt Ref: ${matchedReceipt.receiptNumber} for Invoice ${invoice.invoiceNumber}. Thank you!`,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Error sharing Receipt PDF:", err);
        }
      }
    } else {
      doc.save(fileName);
      const message = `Please find attached Payment Receipt Ref: ${matchedReceipt.receiptNumber} for Invoice ${invoice.invoiceNumber}. Thank you!`;
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
    }
  };

  const filteredInvoices = useMemo(() => {
    let list = invoices;
    if (user && user.role === "Salesman") {
      list = invoices.filter((i) => i.salesmanName.toLowerCase().trim() === user.name.toLowerCase().trim());
    }

    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(query) ||
        (i.quoteNumber && i.quoteNumber.toLowerCase().includes(query)) ||
        i.customerName.toLowerCase().includes(query) ||
        i.companyName.toLowerCase().includes(query) ||
        i.salesmanName.toLowerCase().includes(query)
    );
  }, [invoices, searchQuery, user]);

  const generatePDF = (invoice: Invoice) => {
    const doc = buildInvoicePDF(invoice);
    doc.save(`MAAT-INVOICE-${invoice.invoiceNumber}.pdf`);
  };

  const handleDelete = (invoiceNo: string) => {
    if (confirm(`Are you sure you want to delete invoice ${invoiceNo}?`)) {
      const updated = invoices.filter((i) => i.invoiceNumber !== invoiceNo);
      saveInvoicesToStateAndStorage(updated);
      if (selectedInvoice?.invoiceNumber === invoiceNo) {
        setSelectedInvoice(null);
      }
    }
  };

  const handleUpdateStatus = async (invoiceNo: string, newStatus: "Paid" | "Credit") => {
    const currentInv = invoices.find((i) => i.invoiceNumber === invoiceNo);
    const oldStatus = currentInv?.status;

    const updated = invoices.map((i) => {
      if (i.invoiceNumber === invoiceNo) {
        return {
          ...i,
          status: newStatus,
          creditDays: newStatus === "Credit" ? (i.creditDays || 30) : undefined
        };
      }
      return i;
    });
    saveInvoicesToStateAndStorage(updated);
    if (selectedInvoice && selectedInvoice.invoiceNumber === invoiceNo) {
      setSelectedInvoice({
        ...selectedInvoice,
        status: newStatus,
        creditDays: newStatus === "Credit" ? (selectedInvoice.creditDays || 30) : undefined
      });
    }

    // Auto-create receipt voucher when marked as Paid
    if (currentInv && newStatus === "Paid") {
      try {
        const localRecsStr = localStorage.getItem("maat_receipts");
        const localRecs: any[] = localRecsStr ? JSON.parse(localRecsStr) : [];
        const year = new Date().getFullYear();
        const autoRecNum = `REC-${year}-0${String(localRecs.length + 1).padStart(3, "0")}`;

        const autoReceipt = {
          id: `rec-${Date.now()}`,
          receiptNumber: autoRecNum,
          customerId: currentInv.customerId,
          customerName: currentInv.customerName,
          companyName: currentInv.companyName,
          amountPaid: currentInv.grandTotal,
          remainingPendingAmount: 0,
          paymentDate: currentInv.date || new Date().toISOString().split("T")[0],
          paymentMethod: "Cash" as const,
          referenceNo: `Auto-Paid for ${currentInv.invoiceNumber}`,
          notes: `Auto-generated receipt voucher for Paid Invoice ${currentInv.invoiceNumber}`,
          createdBy: user?.name || "Admin",
        };

        const updatedRecs = [autoReceipt, ...localRecs];
        localStorage.setItem("maat_receipts", JSON.stringify(updatedRecs));

        const { buildReceiptPDF } = await import("@/lib/pdfReceiptHelper");
        const recDoc = buildReceiptPDF(autoReceipt);
        const recPdfBase64 = recDoc.output("datauristring").split(",")[1];

        const recParams = new URLSearchParams();
        recParams.append("receiptNumber", autoReceipt.receiptNumber);
        recParams.append("companyName", autoReceipt.companyName);
        recParams.append("customerName", autoReceipt.customerName || "");
        recParams.append("amountPaid", autoReceipt.amountPaid.toString());
        recParams.append("paymentDate", autoReceipt.paymentDate);
        recParams.append("paymentMethod", autoReceipt.paymentMethod);
        recParams.append("referenceNo", autoReceipt.referenceNo || "");

        await fetch(`/api/receipts?${recParams.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiptNumber: autoReceipt.receiptNumber,
            customerName: autoReceipt.customerName,
            companyName: autoReceipt.companyName,
            amountPaid: autoReceipt.amountPaid,
            paymentDate: autoReceipt.paymentDate,
            paymentMethod: autoReceipt.paymentMethod,
            referenceNo: autoReceipt.referenceNo,
            fileName: `MAAT-RECEIPT-${autoReceipt.receiptNumber}.pdf`,
            pdfBase64: recPdfBase64,
          }),
        });
      } catch (recErr) {
        console.error("Failed to auto-create receipt on status change:", recErr);
      }
    }

    // Adjust pending balance if status changed
    if (currentInv && oldStatus !== newStatus && currentInv.companyName) {
      const amountToAdd = newStatus === "Credit" ? currentInv.grandTotal : -currentInv.grandTotal;
      try {
        await fetch("/api/customers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: currentInv.companyName,
            customerId: currentInv.customerId,
            amountToAdd,
          }),
        });
      } catch (err) {
        console.error("Failed to update pending balance on status change:", err);
      }
    }
  };


  const columns = [
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
      className: "w-44",
    },
    {
      header: "Client / Company",
      accessor: (row: Invoice) => (
        <div>
          <div className="font-bold text-slate-800">{row.customerName}</div>
          <div className="text-xs text-slate-400 font-semibold">{row.companyName}</div>
        </div>
      ),
    },
    {
      header: "Date",
      accessor: (row: Invoice) => formatDisplayDate(row.date),
      className: "w-40",
    },
    {
      header: "Grand Total",
      accessor: (row: Invoice) => (
        <span className="font-bold text-slate-900">AED {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      ),
      className: "w-36",
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
        <div className="flex gap-1.5 justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedInvoice(row);
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
            title="Share Invoice via WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          {row.status === "Paid" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                shareReceiptToWhatsApp(row);
              }}
              className="p-1.5 rounded-lg hover:bg-teal-50 text-teal-600 hover:text-teal-700 transition"
              title="Share Receipt Voucher via WhatsApp"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.invoiceNumber);
            }}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 hover:text-rose-700 transition"
            title="Delete Invoice"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
      className: "w-48 text-center",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices Manager"
        description="View and issue tax-compliant invoices, track billing statuses, or share digital prints via WhatsApp."
        action={
          <div className="flex gap-3">
            <button
              onClick={loadInvoices}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition focus:outline-none focus:ring-2 focus:ring-accent/15 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Sync Invoices
            </button>
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15"
            >
              <Plus className="w-4.5 h-4.5" />
              New Invoice
            </Link>
          </div>
        }
      />

      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <SearchInput
          placeholder="Search by invoice number, doctor name, or clinic..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
        />
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
          Showing {filteredInvoices.length} Invoices
        </div>
      </div>

      {/* Invoices Table */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-500">Loading invoices...</p>
        </div>
      ) : (
        <DataTable
          data={filteredInvoices}
          columns={columns}
          keyExtractor={(row, idx) => row.id || row.invoiceNumber || `inv-${idx}`}
          onRowClick={(row) => setSelectedInvoice(row)}
          emptyTitle="No invoices found"
          emptyDescription="Create an invoice from scratch or convert an approved quotation to invoice."
        />
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
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-6">
              {/* Status and Action banner */}
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

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Update Status:</span>
                  <select
                    value={selectedInvoice.status}
                    onChange={(e) => handleUpdateStatus(selectedInvoice.invoiceNumber, e.target.value as any)}
                    className="text-xs font-bold bg-white border border-slate-200 rounded-lg p-1 px-2 focus:outline-none focus:border-accent"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Credit">Credit</option>
                  </select>
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
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="px-4 py-2.5 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                >
                  Close
                </button>

                {selectedInvoice.status === "Paid" && (
                  <button
                    onClick={() => shareReceiptToWhatsApp(selectedInvoice)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition shadow-md shadow-teal-600/10 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Share Receipt
                  </button>
                )}

                <button
                  onClick={() => shareToWhatsApp(selectedInvoice)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md shadow-emerald-600/10 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  Share Invoice
                </button>

                <button
                  onClick={() => generatePDF(selectedInvoice)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-primary hover:bg-[#15223c] rounded-xl transition shadow-md shadow-primary/10 cursor-pointer"
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
