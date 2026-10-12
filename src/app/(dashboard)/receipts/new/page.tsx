"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowLeft, CheckCircle2, X, Plus, FileText, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Customer, Receipt, Invoice, InvoiceBalance } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";
import { currencyFor, decimalsFor } from "@/lib/currency";

export default function NewReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId");
  const preselectedInvoiceId = searchParams.get("invoiceId");
  const { user } = useAuth();

  // Form states
  const [receiptNumber, setReceiptNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Bank Transfer" | "Cheque" | "Other">("Cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);

  // Status states
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Customer inline modal states
  const [isCustModalOpen, setIsCustModalOpen] = useState(false);
  const [formCustCompany, setFormCustCompany] = useState("");
  const [formCustName, setFormCustName] = useState("");
  const [formCustLocation, setFormCustLocation] = useState("");
  const [isCustSubmitting, setIsCustSubmitting] = useState(false);

  // Allocation: which open invoices this payment settles (invoiceId -> amount typed)
  const [openInvoices, setOpenInvoices] = useState<InvoiceBalance[]>([]);
  // UAE: a receipt is for UAE-registered or Oman-registered invoices, never both.
  const [receiptSeries, setReceiptSeries] = useState<"standard" | "oman_reg">("standard");
  const [openLoading, setOpenLoading] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [customerCashOnly, setCustomerCashOnly] = useState<{ cashOnly: boolean; reason?: string }>({ cashOnly: false });
  const [chequesPending, setChequesPending] = useState(0);

  // Cheque details (payment method "Cheque")
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [bankName, setBankName] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch customers
        const custRes = await fetch("/api/customers");
        const custData = await custRes.json();
        const loadedCusts: Customer[] = custData.customers || [];
        setCustomers(loadedCusts);

        // Fetch invoices
        let loadedInvoices: Invoice[] = [];
        try {
          const invRes = await fetch("/api/invoices");
          const invData = await invRes.json();
          if (Array.isArray(invData)) {
            loadedInvoices = invData;
            setInvoicesList(invData);
          }
        } catch (e) {
          console.error("Failed to load invoices for receipt selector:", e);
        }

        // Fetch receipts
        try {
          const recRes = await fetch("/api/receipts");
          const recData = await recRes.json();
          if (Array.isArray(recData)) {
            setReceiptsList(recData);
            localStorage.setItem("maat_receipts", JSON.stringify(recData));
          } else {
            const local = localStorage.getItem("maat_receipts");
            setReceiptsList(local ? JSON.parse(local) : []);
          }
        } catch (e) {
          const local = localStorage.getItem("maat_receipts");
          setReceiptsList(local ? JSON.parse(local) : []);
        }

        // Handle preselected invoice
        if (preselectedInvoiceId && loadedInvoices.length > 0) {
          const matchedInv = loadedInvoices.find(i => i.id === preselectedInvoiceId || i.invoiceNumber === preselectedInvoiceId);
          if (matchedInv) {
            setSelectedInvoiceId(matchedInv.id);
            setInvoiceSearchQuery(`${matchedInv.invoiceNumber} - ${matchedInv.companyName}`);
            
            // Auto-populate customer from invoice
            const matchedCust = loadedCusts.find(c => c.id === matchedInv.customerId || c.company === matchedInv.companyName);
            if (matchedCust) {
              setSelectedCustomerId(matchedCust.id);
              setCustomerSearchQuery(`${matchedCust.company} ${matchedCust.name ? `(${matchedCust.name})` : ""}`);
            } else if (matchedInv.companyName) {
              setCustomerSearchQuery(`${matchedInv.companyName} ${matchedInv.customerName ? `(${matchedInv.customerName})` : ""}`);
            }
          }
        }
        // Handle preselected customer
        else if (preselectedCustomerId) {
          const matched = loadedCusts.find((c) => c.id === preselectedCustomerId);
          if (matched) {
            setSelectedCustomerId(matched.id);
            setCustomerSearchQuery(`${matched.company} ${matched.name ? `(${matched.name})` : ""}`);
          }
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [preselectedCustomerId, preselectedInvoiceId]);

  // Generate Receipt Number
  useEffect(() => {
    if (!receiptNumber) {
      const year = new Date().getFullYear();
      const count = receiptsList.length + 1;
      setReceiptNumber(`REC-${year}-0${String(count).padStart(3, "0")}`);
    }
  }, [receiptsList, receiptNumber]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [selectedCustomerId, customers]);

  const currencyCountry = selectedCustomer?.country || user?.country;
  const currencySymbol = currencyFor(currencyCountry);
  const dp = decimalsFor(currencyCountry);

  // Load the customer's open invoices whenever the customer changes.
  useEffect(() => {
    setAllocations({});
    setOpenInvoices([]);
    setCustomerCashOnly({ cashOnly: false });
    setChequesPending(0);
    if (!selectedCustomerId) return;

    let cancelled = false;
    setOpenLoading(true);
    fetch(`/api/customers/${selectedCustomerId}/open-invoices`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        const list: InvoiceBalance[] = data.invoices || [];
        setOpenInvoices(list);
        setCustomerCashOnly({ cashOnly: Boolean(data.customer?.cashOnly), reason: data.customer?.cashOnlyReason });
        setChequesPending(Number(data.summary?.chequesPending) || 0);
        // Coming from an invoice's "Record payment": pre-fill that invoice.
        const pre = list.find((inv) => inv.invoiceId === selectedInvoiceId);
        setReceiptSeries(pre ? pre.billingSeries : "standard");
        if (pre && pre.availableToAllocate > 0) {
          setAllocations({ [pre.invoiceId]: String(pre.availableToAllocate) });
          setAmountPaid((prev) => prev || String(pre.availableToAllocate));
        }
      })
      .catch(() => {
        if (!cancelled) setOpenInvoices([]);
      })
      .finally(() => {
        if (!cancelled) setOpenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, selectedInvoiceId]);

  const numericAmount = parseFloat(amountPaid) || 0;
  const allocatedTotal = useMemo(
    () => (Object.values(allocations) as string[]).reduce((sum: number, v: string) => sum + (parseFloat(v) || 0), 0),
    [allocations]
  );
  const unallocated = Math.max(0, numericAmount - allocatedTotal);
  const overAllocated = allocatedTotal - numericAmount > 0.0005;
  const hasOmanReg = openInvoices.some((inv) => inv.billingSeries === "oman_reg");
  const seriesInvoices = openInvoices.filter((inv) => inv.billingSeries === receiptSeries);
  const otherSeriesOpen = openInvoices
    .filter((inv) => inv.billingSeries !== receiptSeries)
    .reduce((sum, inv) => sum + inv.outstanding, 0);
  const switchSeries = (series: "standard" | "oman_reg") => {
    if (series === receiptSeries) return;
    setReceiptSeries(series);
    setAllocations({});
  };
  const allocationErrors = seriesInvoices.filter(
    (inv) => (parseFloat(allocations[inv.invoiceId] || "") || 0) - inv.availableToAllocate > 0.0005
  );

  // Fill invoices oldest first until the payment amount is used up.
  const autoAllocate = () => {
    let remaining = numericAmount;
    const next: Record<string, string> = {};
    for (const inv of seriesInvoices) {
      if (remaining <= 0.0005) break;
      const amt = Math.min(inv.availableToAllocate, remaining);
      if (amt > 0) {
        next[inv.invoiceId] = amt.toFixed(dp);
        remaining -= amt;
      }
    }
    setAllocations(next);
  };

  const selectedInvoice = useMemo(() => {
    return invoicesList.find((i) => i.id === selectedInvoiceId);
  }, [selectedInvoiceId, invoicesList]);

  // Available invoices: active, non-deleted, non-cancelled (both Paid and Credit)
  const availableInvoices = useMemo(() => {
    let list = invoicesList.filter(i => !i.isDeleted && (i.status as string) !== "Cancelled");
    if (selectedCustomerId) {
      list = list.filter(i => i.customerId === selectedCustomerId || (selectedCustomer && i.companyName === selectedCustomer.company));
    }
    return list;
  }, [invoicesList, selectedCustomerId, selectedCustomer]);

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearchQuery) return availableInvoices;
    const query = invoiceSearchQuery.toLowerCase();
    return availableInvoices.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(query) ||
        i.companyName.toLowerCase().includes(query) ||
        (i.customerName && i.customerName.toLowerCase().includes(query))
    );
  }, [invoiceSearchQuery, availableInvoices]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) return customers;
    const selected = customers.find((c) => c.id === selectedCustomerId);
    const selectedLabel = selected ? `${selected.company} ${selected.name ? `(${selected.name})` : ""}` : "";
    if (customerSearchQuery === selectedLabel) return customers;

    const query = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.company.toLowerCase().includes(query) ||
        (c.name && c.name.toLowerCase().includes(query))
    );
  }, [customerSearchQuery, customers, selectedCustomerId]);

  // Invoice-specific outstanding calculation
  const invoiceReceiptsSum = useMemo(() => {
    if (!selectedInvoiceId) return 0;
    return receiptsList
      .filter((r) => !r.isDeleted && r.invoiceId === selectedInvoiceId)
      .reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  }, [selectedInvoiceId, receiptsList]);

  const invoiceOutstanding = useMemo(() => {
    if (!selectedInvoice) return 0;
    return Math.max(0, selectedInvoice.grandTotal - invoiceReceiptsSum);
  }, [selectedInvoice, invoiceReceiptsSum]);

  const handleSelectInvoice = (inv: Invoice) => {
    setSelectedInvoiceId(inv.id);
    setInvoiceSearchQuery(`${inv.invoiceNumber} - ${inv.companyName}`);
    setShowInvoiceDropdown(false);

    // Auto-populate Customer when invoice is selected
    const matchedCust = customers.find(c => c.id === inv.customerId || c.company === inv.companyName || c.companyName === inv.companyName);
    if (matchedCust) {
      setSelectedCustomerId(matchedCust.id);
      setCustomerSearchQuery(`${matchedCust.company} ${matchedCust.name ? `(${matchedCust.name})` : ""}`);
    }

    // Auto-fill amount paid with remaining invoice outstanding balance
    const existingRecSum = receiptsList
      .filter((r) => !r.isDeleted && r.invoiceId === inv.id)
      .reduce((sum, r) => sum + (r.amountPaid || 0), 0);
    const remOutstanding = Math.max(0, inv.grandTotal - existingRecSum);
    setAmountPaid(remOutstanding > 0 ? String(remOutstanding) : String(inv.grandTotal));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amountPaid);

    if (!selectedCustomerId && !selectedInvoiceId) {
      setErrorMessage("Please select a customer or an invoice.");
      return;
    }

    if (isNaN(numericAmount) || numericAmount <= 0) {
      setErrorMessage("Please enter a valid amount paid greater than 0.");
      return;
    }

    if (!receiptNumber.trim()) {
      setErrorMessage("Receipt number is required.");
      return;
    }

    if (overAllocated) {
      setErrorMessage("The amounts applied to invoices are more than the payment.");
      return;
    }
    if (allocationErrors.length > 0) {
      setErrorMessage(`Invoice ${allocationErrors[0].invoiceNumber} has less open than the amount applied.`);
      return;
    }
    if (paymentMethod === "Cheque") {
      if (customerCashOnly.cashOnly) {
        setErrorMessage("This customer is cash only after a bounced cheque. Cheques can't be accepted.");
        return;
      }
      if (!chequeNumber.trim() || !chequeDate) {
        setErrorMessage("Enter the cheque number and cheque date.");
        return;
      }
    }

    setIsSaving(true);
    setErrorMessage(null);

    const targetCustId = selectedCustomerId || selectedInvoice?.customerId;
    const remainingAmt = Math.max(0, (selectedCustomer?.pendingBillwiseAmount || 0) - numericAmount);

    const payload = {
      receiptNumber: receiptNumber.trim(),
      customerId: targetCustId,
      allocations: (Object.entries(allocations) as Array<[string, string]>)
        .map(([invoiceId, v]) => ({ invoiceId, amount: parseFloat(v) || 0 }))
        .filter((a) => a.amount > 0),
      chequeNumber: paymentMethod === "Cheque" ? chequeNumber.trim() : undefined,
      chequeDate: paymentMethod === "Cheque" ? chequeDate : undefined,
      bankName: paymentMethod === "Cheque" ? bankName.trim() || undefined : undefined,
      customerName: selectedCustomer?.name || selectedInvoice?.customerName,
      companyName: selectedCustomer?.company || selectedInvoice?.companyName || customerSearchQuery.replace(/\s*\([^)]*\)/, "").trim(),
      amountPaid: numericAmount,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      referenceNo: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
      billingSeries: receiptSeries,
    };

    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || "Failed to save receipt");
      }

      // The server assigns the final number (salesman's series for this kind).
      setSuccessMessage(`Receipt ${resData.receipt?.receiptNumber || receiptNumber} generated and billwise balance updated successfully!`);
      setTimeout(() => {
        router.push("/receipts");
      }, 1500);
    } catch (err: any) {
      console.error("Failed to save receipt:", err);
      setErrorMessage(err.message || "Failed to process receipt. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustCompany.trim()) return;

    setIsCustSubmitting(true);
    try {
      const dataPayload = new FormData();
      dataPayload.append("company", formCustCompany);
      dataPayload.append("name", formCustName);
      dataPayload.append("location", formCustLocation);

      const res = await fetch("/api/customers", {
        method: "POST",
        body: dataPayload,
      });

      if (!res.ok) throw new Error("Failed to create customer");

      const resData = await res.json();
      if (resData.success && resData.customer) {
        const added = resData.customer;
        setCustomers((prev) => [added, ...prev]);
        setSelectedCustomerId(added.id);
        setCustomerSearchQuery(`${added.company} ${added.name ? `(${added.name})` : ""}`);
        setIsCustModalOpen(false);
        setFormCustCompany("");
        setFormCustName("");
        setFormCustLocation("");
      }
    } catch (err) {
      console.error("Error creating customer:", err);
      setErrorMessage("Failed to add customer.");
    } finally {
      setIsCustSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#61989B] mb-2" />
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading setup...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Issue Customer Receipt"
        description="Record payback amount received from customer and deduct it directly from their pending billwise balance."
        breadcrumbs={[
          { label: "Receipts", href: "/receipts" },
          { label: "New Receipt" }
        ]}
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {errorMessage && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            <span className="font-semibold">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Details (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Metadata: Receipt Number & Date */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Receipt Number
              </label>
              <input
                type="text"
                required
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Payment Date
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
              />
            </div>
          </div>

          {/* Customer Selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
                1. Select Customer
              </h3>
              <button
                type="button"
                onClick={() => setIsCustModalOpen(true)}
                className="text-xs font-bold text-[#61989B] hover:text-[#4e7d80] transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add New Customer
              </button>
            </div>

            <div className="relative">
              <div className="relative flex items-center">
                <Search className="absolute left-4 text-slate-400 w-5 h-5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search customer name, company, or clinic..."
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-semibold"
                />
              </div>

              {showCustomerDropdown && (
                <div className="absolute left-0 right-0 z-30 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {filteredCustomers.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-400 text-center font-medium">
                      No customers found
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerSearchQuery(`${c.company} ${c.name ? `(${c.name})` : ""}`);
                          setShowCustomerDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{c.company}</div>
                          {c.name && <div className="text-xs text-slate-400 font-medium">Doctor: {c.name}</div>}
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-extrabold ${(c.pendingBillwiseAmount || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            Pending: {c.country === "Oman" ? "OMR" : "AED"} {Math.max(0, c.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Account Pending Balance Card */}
            {selectedCustomer && (
              <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Selected Customer</span>
                  <span className="font-extrabold text-slate-800 text-base">{selectedCustomer.company}</span>
                  {selectedCustomer.name && <span className="text-xs font-semibold text-slate-500 ml-2">({selectedCustomer.name})</span>}
                </div>
                <div className={`sm:text-right px-4 py-2 rounded-xl border ${Math.max(0, selectedCustomer.pendingBillwiseAmount || 0) > 0 ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100"}`}>
                  <span className={`block text-[11px] font-bold uppercase tracking-wide ${Math.max(0, selectedCustomer.pendingBillwiseAmount || 0) > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                    Current Pending Billwise
                  </span>
                  <span className={`text-base font-black ${Math.max(0, selectedCustomer.pendingBillwiseAmount || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {currencySymbol} {Math.max(0, selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {selectedCustomer && customerCashOnly.cashOnly && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Cash only.</span>{" "}
                {customerCashOnly.reason || "A cheque from this customer bounced."} Cheque payments are not accepted until an admin removes the flag.
              </div>
            </div>
          )}

          {/* Payment Details Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
              2. Payment & Payback Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Amount Paid ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-lg font-black focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all text-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {paymentMethod === "Cheque" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cheque Number *</label>
                  <input
                    type="text"
                    required
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cheque Date *</label>
                  <input
                    type="date"
                    required
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bank</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>
                <p className="md:col-span-3 text-xs font-semibold text-slate-500">
                  A cheque counts as paid only when the office marks it cleared. Until then its invoices show "Cheque pending".
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Transfer Ref TRX-928"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Notes / Remarks (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Additional notes for receipt record..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>
          </div>
          {/* Apply to invoices */}
          {selectedCustomer && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
                  3. Apply to Invoices
                </h3>
                <button
                  type="button"
                  onClick={autoAllocate}
                  disabled={!numericAmount || seriesInvoices.length === 0}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  Apply oldest first
                </button>
              </div>

              {hasOmanReg && (
                <div className="space-y-2">
                  <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                    {([
                      ["standard", "UAE-registered"],
                      ["oman_reg", "Oman-registered"],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => switchSeries(key)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          receiptSeries === key ? "bg-[#1B2A4A] text-white shadow-sm" : "text-slate-600 hover:bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-slate-500">
                    This customer has both kinds of invoice. Each receipt covers one kind
                    {receiptSeries === "oman_reg" ? " (Oman-registered receipts print without the company header)" : ""}.
                    {otherSeriesOpen > 0.0005
                      ? ` ${receiptSeries === "standard" ? "Oman" : "UAE"}-registered invoices still have ${otherSeriesOpen.toFixed(dp)} open: record a separate receipt for them.`
                      : ""}
                  </p>
                </div>
              )}

              {openLoading ? (
                <p className="text-sm text-slate-400 font-medium">Loading open invoices...</p>
              ) : seriesInvoices.length === 0 ? (
                <p className="text-sm text-slate-500 font-medium">
                  No open invoices. The whole payment will be kept as an advance (or settle the opening balance).
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                        <th className="text-start py-2 pe-3">Invoice</th>
                        <th className="text-start py-2 pe-3">Due</th>
                        <th className="text-end py-2 pe-3">Total</th>
                        <th className="text-end py-2 pe-3">Open</th>
                        <th className="text-end py-2 w-40">Apply ({currencySymbol})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {seriesInvoices.map((inv) => {
                        const typed = allocations[inv.invoiceId] ?? "";
                        const tooMuch = (parseFloat(typed) || 0) - inv.availableToAllocate > 0.0005;
                        return (
                          <tr key={inv.invoiceId}>
                            <td className="py-2.5 pe-3">
                              <div className="font-bold text-slate-800">{inv.invoiceNumber}</div>
                              <div className="text-[11px] text-slate-400 font-medium">{inv.invoiceDate}</div>
                            </td>
                            <td className="py-2.5 pe-3">
                              <span className={`text-xs font-bold ${inv.isOverdue ? "text-rose-600" : "text-slate-500"}`}>
                                {inv.dueDate}{inv.isOverdue ? ` · ${inv.daysOverdue}d overdue` : ""}
                              </span>
                            </td>
                            <td className="py-2.5 pe-3 text-end text-slate-500 font-medium">{inv.grandTotal.toFixed(dp)}</td>
                            <td className="py-2.5 pe-3 text-end">
                              <div className="font-bold text-slate-800">{inv.availableToAllocate.toFixed(dp)}</div>
                              {inv.pendingCheques > 0 && (
                                <div className="text-[11px] text-amber-600 font-semibold">{inv.pendingCheques.toFixed(dp)} in pending cheques</div>
                              )}
                            </td>
                            <td className="py-2.5 text-end">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={typed}
                                placeholder="0"
                                onChange={(e) => setAllocations((prev) => ({ ...prev, [inv.invoiceId]: e.target.value }))}
                                className={`w-36 px-3 py-2 text-end bg-white border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/15 ${tooMuch ? "border-rose-400 text-rose-600" : "border-slate-200 text-slate-800"}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm pt-2 border-t border-slate-100">
                <span className="text-slate-500 font-medium">
                  Applied: <span className="font-bold text-slate-800">{currencySymbol} {allocatedTotal.toFixed(dp)}</span>
                </span>
                <span className={`font-medium ${overAllocated ? "text-rose-600" : "text-slate-500"}`}>
                  {overAllocated ? "Over-applied by " : "Kept as advance: "}
                  <span className="font-bold">{currencySymbol} {Math.abs(numericAmount - allocatedTotal).toFixed(dp)}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Summary Sidebar (1/3) */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 sticky top-6">
            <h3 className="text-base font-extrabold text-[#1B2A4A] border-b border-slate-100 pb-4">
              Receipt Summary
            </h3>

            {selectedCustomer ? (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Customer:</span>
                  <span className="font-bold text-slate-800 text-right truncate max-w-[160px]">{selectedCustomer.company}</span>
                </div>
                
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Current Credit:</span>
                  <span className="font-bold text-rose-600">
                    {currencySymbol} {Math.max(0, selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: dp })}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-dashed border-slate-200 pt-3">
                  <span className="text-slate-500 font-medium">Amount Received:</span>
                  <span className="font-black text-emerald-600 text-base">
                    - {currencySymbol} {(parseFloat(amountPaid) || 0).toLocaleString(undefined, { minimumFractionDigits: dp })}
                  </span>
                </div>

                {chequesPending > 0 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Cheques pending:</span>
                    <span className="font-bold text-amber-600">
                      {currencySymbol} {chequesPending.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}
                    </span>
                  </div>
                )}

                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 mt-4 space-y-1">
                  <span className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                    {paymentMethod === "Cheque" ? "Balance once the cheque clears" : "New Outstanding Balance"}
                  </span>
                  <span className="text-lg font-black text-emerald-800">
                    {currencySymbol} {Math.max(0, (selectedCustomer.pendingBillwiseAmount || 0) - (parseFloat(amountPaid) || 0)).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}
                  </span>
                  {paymentMethod === "Cheque" && (
                    <span className="block text-[11px] font-semibold text-emerald-700">
                      Until then the balance stays at {currencySymbol} {Math.max(0, selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm font-medium">
                Select a customer to calculate new balance after payback.
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving || !selectedCustomerId || !amountPaid}
              className="w-full py-4 bg-[#1B2A4A] hover:bg-[#15223c] text-white font-extrabold rounded-xl transition shadow-lg shadow-[#1B2A4A]/10 disabled:opacity-50 cursor-pointer text-sm"
            >
              {isSaving ? "Saving..." : paymentMethod === "Cheque" ? "Save Receipt (Cheque Pending)" : "Save Receipt & Deduct Credit"}
            </button>
          </div>
        </div>
      </form>
      </div>

      {/* Add Customer Modal */}
      {isCustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Add New Customer</h3>
              <button
                onClick={() => setIsCustModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Clinic / Farm Company Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Equine Hospital"
                  value={formCustCompany}
                  onChange={(e) => setFormCustCompany(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Primary Contact Doctor (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Ahmed"
                  value={formCustName}
                  onChange={(e) => setFormCustName(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Location / Region
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dubai, UAE"
                  value={formCustLocation}
                  onChange={(e) => setFormCustLocation(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCustModalOpen(false)}
                  className="px-5 py-3 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCustSubmitting || !formCustCompany}
                  className="px-5 py-3 text-sm font-bold text-white bg-[#1B2A4A] hover:bg-[#15223c] rounded-xl transition disabled:opacity-50 cursor-pointer"
                >
                  {isCustSubmitting ? "Adding..." : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
