"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Receipt } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { Plus, Download, FileText, RotateCw, X, Trash2, AlertTriangle } from "lucide-react";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";
import { ActionDropdown } from "@/components/ActionDropdown";
import { printReceiptThermalBill } from "@/lib/thermalPrintHelper";
import { useAuth } from "@/hooks/useAuth";

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();
  const { isSuperAdmin, isAccountant } = useAuth();
  // Admins and accountants manage cheques (received / cleared / bounced).
  const canManageCheques = isSuperAdmin || isAccountant;
  const [chequeFilter, setChequeFilter] = useState<"all" | "pending" | "bounced">("all");
  const [actionMessage, setActionMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  // Delete (admin / accountant): the receipt asked about, and while it is being deleted.
  const [toDelete, setToDelete] = useState<Receipt | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteReceipt = async (receipt: Receipt) => {
    setDeleting(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete the receipt");
      const nums: string[] = Array.isArray(data.deleted) && data.deleted.length > 0 ? data.deleted : [receipt.receiptNumber];
      setActionMessage({ type: "ok", text: `${nums.length > 1 ? "Receipts" : "Receipt"} ${nums.join(" and ")} deleted. The invoices it paid are open again.` });
      setToDelete(null);
      setSelectedReceipt(null);
      loadReceipts(true);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Could not delete the receipt" });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const chequeAction = async (receipt: Receipt, action: "received" | "clear" | "bounce") => {
    let reason: string | undefined;
    if (action === "bounce") {
      const input = window.prompt(
        `Cheque ${receipt.chequeNumber || receipt.receiptNumber} bounced.\n\nIts invoices will reopen and ${receipt.companyName} will be set to cash only.\n\nReason (optional):`
      );
      if (input === null) return;
      reason = input;
    } else if (action === "clear") {
      if (!window.confirm(`Mark cheque ${receipt.chequeNumber || receipt.receiptNumber} as cleared?`)) return;
    }
    setActionMessage(null);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/cheque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cheque update failed");
      setActionMessage({
        type: "ok",
        text:
          action === "received" ? `Cheque ${receipt.chequeNumber} received from the salesperson.`
          : action === "clear" ? `Cheque ${receipt.chequeNumber} cleared. Its invoices are now paid.`
          : `Cheque ${receipt.chequeNumber} bounced. Invoices reopened; ${receipt.companyName} is now cash only.`,
      });
      setSelectedReceipt(null);
      loadReceipts(true);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Cheque update failed" });
    }
  };

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
    if (chequeFilter === "pending") list = list.filter((r) => r.chequeStatus === "Pending");
    if (chequeFilter === "bounced") list = list.filter((r) => r.chequeStatus === "Bounced");
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
  }, [receipts, searchQuery, chequeFilter]);

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
          <span className="font-bold text-emerald-700">
            {row.receiptNumber}
            {row.billingSeries === "oman_reg" && (
              <span className="ms-1.5 align-middle inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                Oman-reg
              </span>
            )}
          </span>
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
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700">
            {translateBusinessText(row.paymentMethod || "Cash")}
            {row.chequeNumber ? ` #${row.chequeNumber}` : ""}
          </span>
          {row.chequeStatus && (
            <span
              className={`inline-block w-fit text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                row.chequeStatus === "Cleared"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : row.chequeStatus === "Bounced"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {row.chequeStatus === "Pending"
                ? `Pending${row.chequeDate ? ` · ${formatDate(row.chequeDate)}` : ""}${row.chequeReceivedAt ? "" : " · with salesperson"}`
                : row.chequeStatus}
            </span>
          )}
        </div>
      ),
      className: "w-44",
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
            ...(canManageCheques && row.chequeStatus === "Pending"
              ? [
                  ...(!row.chequeReceivedAt
                    ? [{ label: "Cheque received from salesperson", onClick: () => chequeAction(row, "received") }]
                    : []),
                  { label: "Mark cheque cleared", onClick: () => chequeAction(row, "clear") },
                  { label: "Mark cheque bounced", onClick: () => chequeAction(row, "bounce"), danger: true },
                ]
              : []),
            ...(canManageCheques ? [{ label: "Delete receipt", onClick: () => setToDelete(row), danger: true }] : []),
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

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <SearchInput
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
          />
          <div className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
            {([
              ["all", "All"],
              ["pending", `Cheques pending (${receipts.filter((r) => r.chequeStatus === "Pending").length})`],
              ["bounced", "Bounced"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setChequeFilter(key)}
                className={`px-2.5 py-1 rounded-lg cursor-pointer ${chequeFilter === key ? "bg-slate-900 text-white" : "hover:text-slate-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {actionMessage && (
          <div className={`rounded-xl border p-3 text-sm font-semibold ${actionMessage.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
            {actionMessage.text}
          </div>
        )}

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

              {selectedReceipt.chequeStatus && (
                <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div><span className="block text-xs font-bold text-slate-400 uppercase">Cheque</span><span className="font-bold text-slate-800">#{selectedReceipt.chequeNumber}{selectedReceipt.bankName ? ` · ${selectedReceipt.bankName}` : ""}</span></div>
                  <div><span className="block text-xs font-bold text-slate-400 uppercase">Cheque date</span><span className="font-bold text-slate-800">{selectedReceipt.chequeDate ? formatDate(selectedReceipt.chequeDate) : "-"}</span></div>
                  <div><span className="block text-xs font-bold text-slate-400 uppercase">Status</span><span className="font-bold text-slate-800">{selectedReceipt.chequeStatus}{selectedReceipt.chequeStatus === "Pending" && !selectedReceipt.chequeReceivedAt ? " (with salesperson)" : ""}</span></div>
                  {selectedReceipt.bounceReason && (
                    <div><span className="block text-xs font-bold text-slate-400 uppercase">Bounce reason</span><span className="font-bold text-rose-700">{selectedReceipt.bounceReason}</span></div>
                  )}
                </div>
              )}

              {selectedReceipt.allocations && selectedReceipt.allocations.length > 0 && (
                <div className="text-sm">
                  <span className="block text-xs font-bold text-slate-400 uppercase mb-2">Applied to invoices</span>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                    {selectedReceipt.allocations.map((a) => (
                      <div key={a.invoiceId} className="flex justify-between px-3 py-2">
                        <span className="font-bold text-slate-700">{a.invoiceNumber || "Invoice"}</span>
                        <span className="font-bold text-slate-800">{formatCurrency(a.amount)}</span>
                      </div>
                    ))}
                    {selectedReceipt.amountPaid - selectedReceipt.allocations.reduce((s, a) => s + a.amount, 0) > 0.0005 && (
                      <div className="flex justify-between px-3 py-2 text-slate-500">
                        <span className="font-semibold">Kept as advance</span>
                        <span className="font-bold">{formatCurrency(selectedReceipt.amountPaid - selectedReceipt.allocations.reduce((s, a) => s + a.amount, 0))}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-6">
              {canManageCheques ? (
                <button
                  onClick={() => setToDelete(selectedReceipt)}
                  className="flex items-center gap-1.5 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Delete receipt
                </button>
              ) : (
                <span />
              )}
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
      {toDelete && (() => {
        const siblings = toDelete.paymentGroupId
          ? receipts.filter((r) => r.paymentGroupId === toDelete.paymentGroupId && r.id !== toDelete.id && !r.isDeleted)
          : [];
        const all = [toDelete, ...siblings];
        const total = all.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0);
        const invoices = all.flatMap((r) => r.allocations || []).filter((a) => a.amount > 0);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => !deleting && setToDelete(null)}>
            <div className="wiz-in bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-start" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <span className="wiz-pop w-12 h-12 rounded-xl bg-rose-50 text-rose-600 grid place-items-center mb-4">
                  <Trash2 className="w-6 h-6" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">
                  Delete {all.length > 1 ? `receipts ${all.map((r) => r.receiptNumber).join(" and ")}` : `receipt ${toDelete.receiptNumber}`}?
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {toDelete.companyName} · {formatCurrency(total)} · {toDelete.paymentMethod}
                  {toDelete.chequeNumber ? ` #${toDelete.chequeNumber}` : ""}
                </p>

                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {invoices.length > 0 ? (
                    <li className="flex gap-2">
                      <FileText className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <span>
                        These invoices become unpaid again:{" "}
                        <span className="font-medium">{invoices.map((a) => `${a.invoiceNumber || "invoice"} (${formatCurrency(a.amount)})`).join(", ")}</span>
                      </span>
                    </li>
                  ) : (
                    <li className="flex gap-2">
                      <FileText className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <span>The customer's balance goes up by {formatCurrency(total)}.</span>
                    </li>
                  )}
                  {toDelete.paymentMethod === "Cash" && (
                    <li className="flex gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                      <span>The collector's cash in hand drops by {formatCurrency(total)}.</span>
                    </li>
                  )}
                  {siblings.length > 0 && (
                    <li className="flex gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                      <span>This payment was split into UAE- and Oman-registered receipts; both are deleted.</span>
                    </li>
                  )}
                  <li className="flex gap-2 text-slate-500">
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-slate-300 shrink-0" />
                    <span>The receipt stays in the records as deleted, for audit.</span>
                  </li>
                </ul>
              </div>
              <div className="flex gap-3 justify-end bg-slate-50 border-t border-slate-100 px-6 py-4">
                <button
                  disabled={deleting}
                  onClick={() => setToDelete(null)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-slate-400 transition cursor-pointer"
                >
                  Keep it
                </button>
                <button
                  disabled={deleting}
                  onClick={() => deleteReceipt(toDelete)}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-600/20 transition disabled:opacity-60 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
