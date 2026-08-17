"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  UserCheck,
  CreditCard,
  FileText,
  Receipt as ReceiptIcon,
  FileSpreadsheet,
  Plus,
  Eye,
  AlertTriangle,
  X,
  MessageSquare,
  PhoneCall,
  Calendar,
  ShieldAlert,
  Clock,
  ShoppingBag,
  TrendingUp,
  History,
  CheckCircle2,
  DollarSign,
  User,
  Info,
  Download,
} from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Customer, Invoice, Quote, Receipt as ReceiptType } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";
import { printInvoiceThermalBill } from "@/lib/thermalPrintHelper";
import { buildCustomerLedgerPDF, buildPendingInvoicesPDF } from "@/lib/pdfLedgerHelper";

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  try {
    const cleanStr = dateStr.trim();
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) return dateStr;

    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

interface WorkspaceData {
  customer: Customer;
  financialSummary: {
    pendingBalance: number;
    totalInvoiced: number;
    totalPaid: number;
    creditInvoicesSum: number;
    outstandingInvoicesCount: number;
    receiptCount: number;
    lastPayment: {
      amountPaid: number;
      paymentDate: string;
      paymentMethod: string;
      referenceNo?: string;
      receiptNumber?: string;
    } | null;
    lastInvoice: {
      invoiceNumber: string;
      grandTotal: number;
      date: string;
      status: string;
    } | null;
  };
  outstandingInvoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    grandTotal: number;
    paidAmount: number;
    outstandingAmount: number;
    status: string;
    creditDays?: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    totalQuantity: number;
    averagePrice: number;
    lastPrice: number;
  }>;
  lastPurchase: {
    productName: string;
    quantity: number;
    invoiceNumber: string;
    date: string;
    unitPrice: number;
  } | null;
  recentActivity: Array<{
    id: string;
    type: "quotation" | "invoice" | "receipt";
    refNumber: string;
    date: string;
    amount: number;
    status: string;
    details?: string;
  }>;
  allInvoices: Invoice[];
  allReceipts: ReceiptType[];
  allQuotations: Quote[];
  auditContext: {
    createdByName?: string | null;
    updatedByName?: string | null;
    createdAt: string;
    updatedAt?: string;
  };
  userRole: string;
  currentUserId: string;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id as string;
  const { profile, permissions, isSuperAdmin, isAccountant, isSalesperson } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Document history tabs state
  const [activeTab, setActiveTab] = useState<"invoices" | "receipts" | "quotations">("invoices");

  // Selected Invoice Modal State for "View" action
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loadingModalInvoice, setLoadingModalInvoice] = useState(false);

  // Selected Receipt Modal State for "View" action
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptType | null>(null);

  const handleViewReceipt = (receiptId: string, fallbackReceipt?: ReceiptType) => {
    const found = fallbackReceipt || workspace?.allReceipts.find((r) => r.id === receiptId);
    if (found) {
      setSelectedReceipt(found);
    }
  };

  const generateReceiptPDF = (receipt: ReceiptType) => {
    const doc = buildReceiptPDF(receipt);
    doc.save(`MAAT-RECEIPT-${receipt.receiptNumber}.pdf`);
  };

  const handleViewInvoice = async (invoiceId: string, fallbackInvoice?: Invoice) => {
    const found = fallbackInvoice || workspace?.allInvoices.find((i) => i.id === invoiceId);
    if (found) {
      setSelectedInvoice(found);
    } else {
      setSelectedInvoice({
        id: invoiceId,
        invoiceNumber: "Loading...",
        customerId: customerId,
        customerName: workspace?.customer?.doctorName || workspace?.customer?.name || "",
        companyName: workspace?.customer?.company || workspace?.customer?.companyName || "",
        salesmanName: workspace?.customer?.assignedSalesmanName || "",
        date: new Date().toISOString(),
        items: [],
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        status: "Credit",
        country: workspace?.customer?.country || "UAE",
      });
    }
    setLoadingModalInvoice(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setSelectedInvoice(data);
        }
      }
    } catch (err) {
      console.error("Error fetching detailed invoice:", err);
    } finally {
      setLoadingModalInvoice(false);
    }
  };

  const loadCustomerWorkspace = async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}?t=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load customer profile");
        return;
      }
      setWorkspace(data);
    } catch (err: any) {
      setError(err?.message || "Network error loading customer workspace");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerWorkspace();
  }, [customerId]);

  const generatePDF = (invoice: Invoice) => {
    const doc = buildInvoicePDF(invoice);
    doc.save(`MAAT-INVOICE-${invoice.invoiceNumber}.pdf`);
  };

  const handleDownloadLedgerPDF = () => {
    if (!workspace) return;
    const doc = buildCustomerLedgerPDF(
      workspace.customer,
      workspace.allInvoices,
      workspace.allReceipts,
      workspace.financialSummary
    );
    const code = workspace.customer.customerCode || "CUSTOMER";
    doc.save(`MAAT-LEDGER-${code}.pdf`);
  };

  const handleDownloadPendingInvoicesPDF = () => {
    if (!workspace) return;
    const doc = buildPendingInvoicesPDF(
      workspace.customer,
      workspace.outstandingInvoices,
      workspace.financialSummary
    );
    const code = workspace.customer.customerCode || "CUSTOMER";
    doc.save(`MAAT-PENDING-INVOICES-${code}.pdf`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="card" />
        <LoadingSkeleton type="table" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/customers")}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-xl font-extrabold text-slate-900">Customer Account Profile</h2>
        </div>
        <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-4 shadow-sm">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-lg font-bold text-rose-900">{error || "Access Denied"}</h3>
          <p className="text-sm text-rose-700">
            {error?.includes("Forbidden")
              ? "You do not have authorization to view this customer workspace."
              : "The requested customer profile could not be retrieved from the database."}
          </p>
          <button
            onClick={() => router.push("/customers")}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition cursor-pointer"
          >
            Return to Customer Directory
          </button>
        </div>
      </div>
    );
  }

  const { customer, financialSummary, topProducts, lastPurchase, recentActivity, allInvoices, allReceipts, allQuotations, auditContext } = workspace;
  const outstandingInvoices = (workspace.outstandingInvoices || []).filter(
    (inv) => (inv.outstandingAmount ?? 0) > 0.009 && inv.status !== "Paid"
  );
  const currencySymbol = customer.country === "Oman" ? "OMR" : "AED";

  // Actionable contact data formatting
  const cleanPhone = customer.phone ? customer.phone.replace(/[^0-9]/g, "") : "";
  const phoneCallUrl = customer.phone ? `tel:${customer.phone}` : null;
  const whatsappUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
  const emailUrl = customer.email ? `mailto:${customer.email}` : null;

  // Role CTA permissions check based on existing permission system
  const canCreateQuote = permissions?.canCreateQuotation ?? true;
  const canCreateInv = permissions?.canCreateInvoice ?? true;
  const canRecordRec = permissions?.canCreateReceipt ?? true;

  // Ownership indicator
  const isAssignedToCurrentUser = customer.assignedSalesmanId === profile?.id;
  const isSalespersonAssigned = Boolean(
    customer.assignedSalesmanName && customer.assignedSalesmanRole !== "super_admin"
  );

  let salespersonAssignmentText: string | null = null;
  if (isSalesperson && isAssignedToCurrentUser) {
    salespersonAssignmentText = "Assigned to You";
  } else if (isSalespersonAssigned) {
    salespersonAssignmentText = `Salesperson: ${customer.assignedSalesmanName}`;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ================================================== */}
      {/* 1. CUSTOMER HEADER HERO — SIMPLE & ELEGANT */}
      {/* ================================================== */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Identity & Company Title Block */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/customers")}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition cursor-pointer shrink-0"
              title="Back to Customer Directory"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                {customer.company || customer.companyName}
              </h1>

              {/* Minimal Inline Subtitle metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="font-mono font-semibold text-slate-600">{customer.customerCode || "CUST-000000"}</span>
                <span>·</span>
                <span>{customer.country === "Oman" ? "🇴🇲 Oman" : "🇦🇪 UAE"}</span>
                <span>·</span>
                <span className={customer.is_active !== false ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                  {customer.is_active !== false ? "Active" : "Inactive"}
                </span>
                {salespersonAssignmentText && (
                  <>
                    <span>·</span>
                    <span className="text-[#1B2A4A] font-semibold">{salespersonAssignmentText}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Clean Primary Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {canCreateQuote && (isSuperAdmin || isSalesperson || (isAccountant && canCreateQuote)) && (
              <button
                onClick={() => router.push(`/quotes/new?customerId=${customer.id}`)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400" />
                <span>New Quotation</span>
              </button>
            )}

            {canCreateInv && (
              <button
                onClick={() => router.push(`/invoices/new?customerId=${customer.id}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1B2A4A] hover:bg-[#15223c] text-white font-semibold text-xs transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Invoice</span>
              </button>
            )}

            {canRecordRec && (
              <button
                onClick={() => router.push(`/receipts/new?customerId=${customer.id}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </div>

        {/* Minimal Actionable Quick Contact & Address Strip */}
        <div className="pt-3 border-t border-slate-100 flex items-center gap-3 text-xs flex-wrap">
          {(customer.doctorName || customer.name) && (
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Contact Person: <strong className="font-bold text-slate-900">{customer.doctorName || customer.name}</strong></span>
            </span>
          )}

          {(customer.address || customer.city) && (
            <>
              {(customer.doctorName || customer.name) && <span className="text-slate-300">|</span>}
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{customer.address || ""}{customer.city ? `, ${customer.city}` : ""}</span>
              </span>
            </>
          )}

          {(phoneCallUrl || whatsappUrl || emailUrl) && (
            <>
              {((customer.doctorName || customer.name) || customer.address || customer.city) && <span className="text-slate-300">|</span>}
              {phoneCallUrl && (
                <a
                  href={phoneCallUrl}
                  className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 font-medium hover:underline transition"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                  <span>Call {customer.phone}</span>
                </a>
              )}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium hover:underline transition"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                </a>
              )}
              {emailUrl && (
                <a
                  href={emailUrl}
                  className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-800 font-medium hover:underline transition"
                >
                  <Mail className="w-3.5 h-3.5 text-blue-500" />
                  <span>Email {customer.email}</span>
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================================================== */}
      {/* 4, 5, 6, 7. FINANCIAL SUMMARY BY ROLE */}
      {/* ================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-accent" />
            <span>Financial Position ({currencySymbol})</span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadLedgerPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download Ledger PDF</span>
            </button>
            <button
              onClick={handleDownloadPendingInvoicesPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-rose-500" />
              <span>Pending Invoices PDF</span>
            </button>
          </div>
        </div>

        {/* Financial Metrics Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Outstanding Balance */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Outstanding Balance</span>
            <div className="text-2xl font-black tracking-tight text-slate-900">
              <span className={financialSummary.pendingBalance > 0 ? "text-rose-600" : "text-emerald-600"}>
                {currencySymbol} {financialSummary.pendingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500">
              {financialSummary.pendingBalance > 0 ? "Pending collection from customer" : "Account in good standing"}
            </p>
          </div>

          {/* Total Invoiced */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Invoiced</span>
            <div className="text-2xl font-black tracking-tight text-slate-900">
              {currencySymbol} {financialSummary.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] font-semibold text-slate-500">
              Lifetime billed amount across valid tax invoices
            </p>
          </div>

          {/* Total Paid */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Paid</span>
            <div className="text-2xl font-black tracking-tight text-emerald-600">
              {currencySymbol} {financialSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] font-semibold text-slate-500">
              Total payment receipts recorded ({financialSummary.receiptCount} receipts)
            </p>
          </div>

          {/* Last Payment */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Last Payment</span>
            {financialSummary.lastPayment ? (
              <div>
                <div className="text-2xl font-black tracking-tight text-emerald-600">
                  {currencySymbol} {financialSummary.lastPayment.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {formatDisplayDate(financialSummary.lastPayment.paymentDate)} ({financialSummary.lastPayment.paymentMethod})
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-black tracking-tight text-slate-400">—</div>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">No payment receipts recorded yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Super Admin / Accountant Additional Financial Context */}
        {(isSuperAdmin || isAccountant) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600 uppercase tracking-wider">Credit Invoices Total:</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {currencySymbol} {financialSummary.creditInvoicesSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600 uppercase tracking-wider">Outstanding Invoices Count:</span>
              <span className="font-extrabold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 text-xs">
                {financialSummary.outstandingInvoicesCount} Invoices
              </span>
            </div>
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600 uppercase tracking-wider">Last Invoice Issued:</span>
              <span className="font-extrabold text-slate-900 text-xs">
                {financialSummary.lastInvoice ? (
                  `${financialSummary.lastInvoice.invoiceNumber} (${formatDisplayDate(financialSummary.lastInvoice.date)})`
                ) : (
                  "None"
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* 8. OUTSTANDING INVOICES — ALL ROLES */}
      {/* ================================================== */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Outstanding Invoices</span>
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Tax invoices with pending balance requiring collection
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadPendingInvoicesPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-rose-500" />
              <span>Download Pending Invoices PDF</span>
            </button>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
              {outstandingInvoices.length} Outstanding
            </span>
          </div>
        </div>

        {outstandingInvoices.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-semibold text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            No outstanding invoices for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Invoice Number</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Days Due</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Paid</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Outstanding</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Payment Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {outstandingInvoices.map((inv) => {
                  const invDate = new Date(inv.date);
                  const today = new Date();
                  const daysElapsed = Math.max(0, Math.floor((today.getTime() - invDate.getTime()) / 86400000));
                  const creditDays = inv.creditDays || 0;
                  const isOverdue = creditDays > 0 ? daysElapsed > creditDays : false;
                  const daysOverdue = isOverdue ? daysElapsed - creditDays : 0;
                  const daysRemaining = creditDays > 0 ? Math.max(0, creditDays - daysElapsed) : 0;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleViewInvoice(inv.id)}
                          className="font-bold text-[#1B2A4A] hover:text-accent underline transition cursor-pointer text-left"
                        >
                          {inv.invoiceNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {formatDisplayDate(inv.date)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap font-medium">
                        {isOverdue ? (
                          <span className="font-extrabold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                            {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue
                          </span>
                        ) : creditDays > 0 ? (
                          <span className="font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            Due in {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">{daysElapsed} {daysElapsed === 1 ? "day" : "days"} elapsed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {currencySymbol} {inv.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 whitespace-nowrap">
                        {currencySymbol} {inv.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-rose-600 whitespace-nowrap">
                        {currencySymbol} {inv.outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {isOverdue ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-300">
                            OVERDUE
                          </span>
                        ) : (
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {inv.status === "Credit" && creditDays ? `Credit (${creditDays}d)` : inv.status}
                          </span>
                        )}
                      </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewInvoice(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer border border-slate-200"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" /> View
                        </button>

                        {canRecordRec && (
                          <button
                            onClick={() =>
                              router.push(`/receipts/new?customerId=${customer.id}&invoiceId=${inv.id}`)
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" /> Collect Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* 11. RECENT ACTIVITY — ALL ROLES */}
      {/* ================================================== */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-accent" />
              <span>Unified Customer Activity Timeline</span>
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Latest quotations, tax invoices, and payment receipts
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            Top 10 Events
          </span>
        </div>

        {recentActivity.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No recent activity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Activity Type</th>
                  <th className="px-4 py-3 whitespace-nowrap">Reference Number</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Status / Method</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {recentActivity.map((act) => {
                  let typeBadge = "bg-slate-100 text-slate-700 border-slate-200";
                  if (act.type === "invoice") typeBadge = "bg-blue-50 text-blue-700 border-blue-200";
                  else if (act.type === "receipt") typeBadge = "bg-emerald-50 text-emerald-700 border-emerald-200";
                  else if (act.type === "quotation") typeBadge = "bg-amber-50 text-amber-700 border-amber-200";

                  return (
                    <tr key={`${act.type}-${act.id}`} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap font-semibold">
                        {formatDisplayDate(act.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${typeBadge}`}>
                          {act.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {act.type === "invoice" ? (
                          <button
                            onClick={() => handleViewInvoice(act.id)}
                            className="font-bold text-[#1B2A4A] hover:text-accent underline transition cursor-pointer text-left"
                          >
                            {act.refNumber}
                          </button>
                        ) : act.type === "receipt" ? (
                          <button
                            onClick={() => handleViewReceipt(act.id)}
                            className="font-bold text-emerald-700 hover:text-emerald-900 underline transition cursor-pointer text-left"
                          >
                            {act.refNumber}
                          </button>
                        ) : (
                          <span>{act.refNumber}</span>
                        )}
                        {act.details && <span className="block text-[10px] text-slate-400 font-normal">{act.details}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {currencySymbol} {act.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {act.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {act.type === "invoice" ? (
                          <button
                            onClick={() => handleViewInvoice(act.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer border border-slate-200"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" /> View
                          </button>
                        ) : act.type === "receipt" ? (
                          <button
                            onClick={() => handleViewReceipt(act.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer border border-slate-200"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-600" /> View
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* 9. TOP 10 PRODUCTS PURCHASED — ALL ROLES */}
      {/* ================================================== */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              <span>Top 10 Products Purchased</span>
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Historical purchase frequency and average item pricing
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            Ranked by Quantity
          </span>
        </div>

        {topProducts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No purchase history yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">#</th>
                  <th className="px-4 py-3 whitespace-nowrap">Product Name</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Qty Purchased</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Average Price</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Last Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {topProducts.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-bold text-slate-400 text-xs whitespace-nowrap">{idx + 1}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{p.productName}</td>
                    <td className="px-4 py-3 text-center font-extrabold text-indigo-900 bg-indigo-50/50 rounded-lg whitespace-nowrap">
                      {p.totalQuantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold whitespace-nowrap">
                      {currencySymbol} {p.averagePrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900 font-extrabold whitespace-nowrap">
                      {currencySymbol} {p.lastPrice.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>



      {/* ================================================== */}
      {/* ALL DOCUMENT HISTORY TABS */}
      {/* ================================================== */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 flex-wrap">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "invoices"
                ? "bg-[#1B2A4A] text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FileText className="w-4 h-4" /> All Invoices ({allInvoices.length})
          </button>

          <button
            onClick={() => setActiveTab("receipts")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "receipts"
                ? "bg-[#1B2A4A] text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <ReceiptIcon className="w-4 h-4" /> All Receipts ({allReceipts.length})
          </button>

          <button
            onClick={() => setActiveTab("quotations")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "quotations"
                ? "bg-[#1B2A4A] text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" /> Quotations ({allQuotations.length})
          </button>
        </div>

        {activeTab === "invoices" ? (
          allInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-semibold text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No invoices found for this customer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Invoice Ref</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Grand Total</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {allInvoices.map((inv) => {
                    const invDate = new Date(inv.date);
                    const today = new Date();
                    const daysElapsed = Math.max(0, Math.floor((today.getTime() - invDate.getTime()) / 86400000));
                    const creditDays = inv.creditDays || 0;
                    const isOverdue = inv.status === "Credit" && creditDays > 0 && daysElapsed > creditDays;

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/invoices/${inv.id}`} className="font-bold text-[#1B2A4A] hover:text-accent underline">
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{formatDisplayDate(inv.date)}</td>
                        <td className="px-4 py-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {currencySymbol} {inv.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {isOverdue ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-black bg-rose-100 text-rose-700 border border-rose-300">
                              OVERDUE ({daysElapsed - creditDays}d)
                            </span>
                          ) : (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-bold border ${
                                inv.status === "Paid"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {inv.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
                          >
                            View Quick Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === "receipts" ? (
          allReceipts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-semibold text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No receipts recorded for this customer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Receipt Ref</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Amount Paid</th>
                    <th className="px-4 py-3 whitespace-nowrap">Payment Method</th>
                    <th className="px-4 py-3 whitespace-nowrap">Reference No</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {allReceipts.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-bold text-emerald-700 whitespace-nowrap">
                        <button
                          onClick={() => handleViewReceipt(rec.id, rec)}
                          className="font-bold text-emerald-700 hover:text-emerald-900 underline transition cursor-pointer text-left"
                        >
                          {rec.receiptNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{formatDisplayDate(rec.paymentDate)}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-emerald-600 whitespace-nowrap">
                        {currencySymbol} {rec.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{rec.paymentMethod}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{rec.referenceNo || "—"}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleViewReceipt(rec.id, rec)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer border border-slate-200"
                        >
                          View Quick Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : allQuotations.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No quotations found for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Quotation Ref</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Grand Total</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {allQuotations.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-bold text-accent whitespace-nowrap">{q.quoteNumber}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{formatDisplayDate(q.date)}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                      {currencySymbol} {q.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {q.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* PAGE FOOTER — ADMINISTRATIVE METADATA & NOTES */}
      {/* ================================================== */}
      <footer className="pt-6 border-t border-slate-200/80 mt-8 space-y-4 text-xs">
        {customer.notes && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Customer Notes</span>
            <p className="text-slate-700 font-medium italic">"{customer.notes}"</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 text-slate-400 text-[11px] font-medium">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Customer Code: <strong className="text-slate-700 font-semibold">{customer.customerCode}</strong></span>
            {salespersonAssignmentText && (
              <>
                <span>·</span>
                <span>Assigned Salesperson: <strong className="text-slate-700 font-semibold">{salespersonAssignmentText}</strong></span>
              </>
            )}
            {auditContext?.createdByName && (
              <>
                <span>·</span>
                <span>Created by <strong className="text-slate-700 font-semibold">{auditContext.createdByName}</strong> ({formatDisplayDate(customer.createdAt)})</span>
              </>
            )}
            {auditContext?.updatedByName && (
              <>
                <span>·</span>
                <span>Updated by <strong className="text-slate-700 font-semibold">{auditContext.updatedByName}</strong> ({formatDisplayDate(customer.updatedAt)})</span>
              </>
            )}
          </div>

          <div className="font-semibold text-slate-400">
            MAAT Sales Workspace
          </div>
        </div>
      </footer>

      {/* Invoice Details Quick View Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Invoice Details</h3>
                <span className="text-xs font-semibold text-slate-400">Ref: {selectedInvoice.invoiceNumber}</span>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingModalInvoice ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                <span className="text-xs font-bold text-slate-500 block">Fetching invoice details...</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm border border-slate-100">
                  <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase">Customer</span>
                    <span className="block font-bold text-slate-800 mt-0.5">{selectedInvoice.customerName || customer.doctorName || customer.name}</span>
                    <span className="block text-slate-500 text-xs mt-0.5">{selectedInvoice.companyName || customer.company || customer.companyName}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase">Date & Salesperson</span>
                    <span className="block font-bold text-slate-800 mt-0.5">{formatDisplayDate(selectedInvoice.date)}</span>
                    <span className="block text-slate-500 text-xs mt-0.5">
                      {selectedInvoice.salesmanName && selectedInvoice.salesmanName !== "Salesperson"
                        ? selectedInvoice.salesmanName
                        : (customer.assignedSalesmanName || "Salesperson")}
                    </span>
                  </div>
                </div>

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
                      {(!selectedInvoice.items || selectedInvoice.items.length === 0) ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400 font-semibold">
                            No item details recorded for this invoice.
                          </td>
                        </tr>
                      ) : (
                        selectedInvoice.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 font-semibold text-slate-700">{item.productName || "Product"}</td>
                            <td className="px-4 py-3 text-slate-500 text-center font-medium">{item.quantity}</td>
                            <td className="px-4 py-3 text-slate-500 text-right font-medium">
                              {currencySymbol} {(item.discount ?? item.price ?? 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-slate-800 text-right font-bold">
                              {currencySymbol} {(item.total ?? (item.quantity * item.price)).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col items-end gap-1.5 border-t border-slate-100 pt-4 text-sm font-semibold">
                  <div className="flex w-64 justify-between text-base font-bold text-slate-900">
                    <span>Grand Total:</span>
                    <span>{currencySymbol} {(selectedInvoice.grandTotal ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6 gap-3">
              <button
                onClick={() => printInvoiceThermalBill(selectedInvoice)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Print 80mm
              </button>
              <button
                onClick={() => generatePDF(selectedInvoice)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] transition cursor-pointer"
              >
                Download PDF
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Receipt Details Quick View Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Payment Receipt Details</h3>
                <span className="text-xs font-semibold text-slate-400">Ref: {selectedReceipt.receiptNumber}</span>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Amount Paid</span>
                  <span className="text-2xl font-black text-emerald-700 mt-0.5 block">
                    {currencySymbol} {selectedReceipt.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="px-3 py-1 bg-emerald-600 text-white font-bold text-xs rounded-full">
                  {selectedReceipt.paymentMethod}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="block font-bold text-slate-400 uppercase">Customer</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{selectedReceipt.customerName || customer.doctorName || customer.name}</span>
                  <span className="block text-slate-500 mt-0.5">{selectedReceipt.companyName || customer.company || customer.companyName}</span>
                </div>
                <div>
                  <span className="block font-bold text-slate-400 uppercase">Payment Date</span>
                  <span className="block font-bold text-slate-800 mt-0.5">{formatDisplayDate(selectedReceipt.paymentDate)}</span>
                  <span className="block text-slate-500 mt-0.5">Ref No: {selectedReceipt.referenceNo || "N/A"}</span>
                </div>
              </div>

              {selectedReceipt.notes && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                  <span className="block font-bold text-slate-400 uppercase mb-0.5">Notes</span>
                  <span className="text-slate-700 italic">"{selectedReceipt.notes}"</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6 gap-3">
              <button
                onClick={() => generateReceiptPDF(selectedReceipt)}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download Receipt PDF
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer"
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
