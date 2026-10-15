"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import { CustomerBalanceStrip, CustomerCombobox, FieldRow, FormActionBar, fieldInput } from "@/components/form/EntryForm";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SavedDocuments } from "@/components/CustomerAccountPanels";
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
  const [paymentDate, setPaymentDate] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()));
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
  // Typed amounts per invoice stop the automatic "UAE-registered first, oldest first" fill.
  const [manualAlloc, setManualAlloc] = useState(false);
  const [openLoading, setOpenLoading] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [customerCashOnly, setCustomerCashOnly] = useState<{ cashOnly: boolean; reason?: string }>({ cashOnly: false });
  const [chequesPending, setChequesPending] = useState(0);

  // Cheque details (payment method "Cheque")
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()));
  const [bankName, setBankName] = useState("");

  // Wizard: 0 customer, 1 payment, 2 apply to invoices, 3 review.
  const [step, setStep] = useState(preselectedCustomerId || preselectedInvoiceId ? 1 : 0);
  const [activeCustomer, setActiveCustomer] = useState(0);
  const [saved, setSaved] = useState<{ title: string; receiptNumbers: string[]; customerId: string } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const goTo = (s: number) => {
    setStep(s);
    setTimeout(() => topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  };
  const pickCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerSearchQuery(`${c.company} ${c.name ? `(${c.name})` : ""}`);
    setTimeout(() => document.getElementById("rc-amount")?.focus(), 30);
  };

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
    setManualAlloc(false);
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
        if (pre && pre.availableToAllocate > 0) {
          setManualAlloc(true);
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
  // UAE: one payment is applied to UAE-registered invoices first, then
  // Oman-registered ones (oldest first within each), and saved as one receipt per kind.
  const hasOmanReg = openInvoices.some((inv) => inv.billingSeries === "oman_reg");
  const seriesInvoices = useMemo(
    () => [
      ...openInvoices.filter((inv) => inv.billingSeries !== "oman_reg"),
      ...openInvoices.filter((inv) => inv.billingSeries === "oman_reg"),
    ],
    [openInvoices]
  );
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

  // Fill automatically as the amount is typed, until amounts are edited by hand.
  useEffect(() => {
    if (manualAlloc || openLoading) return;
    autoAllocate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericAmount, seriesInvoices, manualAlloc, openLoading]);

  // The receipts this payment will create: UAE-registered first; the advance stays on it.
  const receiptPreview = useMemo(() => {
    const byInvoice = new Map(seriesInvoices.map((inv) => [inv.invoiceId, inv.billingSeries]));
    let uae = 0;
    let oman = 0;
    (Object.entries(allocations) as Array<[string, string]>).forEach(([id, v]) => {
      const amt = parseFloat(v) || 0;
      if (byInvoice.get(id) === "oman_reg") oman += amt;
      else uae += amt;
    });
    uae += Math.max(0, numericAmount - uae - oman);
    return { uae, oman };
  }, [allocations, seriesInvoices, numericAmount]);

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
    if (paymentMethod === "Bank Transfer" && !referenceNo.trim()) {
      setErrorMessage("Enter the bank transfer reference.");
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
      bankName: paymentMethod === "Cheque" || paymentMethod === "Bank Transfer" ? bankName.trim() || undefined : undefined,
      customerName: selectedCustomer?.name || selectedInvoice?.customerName,
      companyName: selectedCustomer?.company || selectedInvoice?.companyName || customerSearchQuery.replace(/\s*\([^)]*\)/, "").trim(),
      amountPaid: numericAmount,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      referenceNo: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
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

      // The server assigns the final numbers (one receipt per kind for a split payment).
      const savedNumbers: string[] = Array.isArray(resData.receipts) && resData.receipts.length > 0
        ? resData.receipts.map((rc: any) => rc.receiptNumber)
        : [resData.receipt?.receiptNumber || receiptNumber];
      setSaved({
        title: `${savedNumbers.length > 1 ? "Receipts" : "Receipt"} ${savedNumbers.join(" and ")} saved`,
        receiptNumbers: savedNumbers,
        customerId: targetCustId || selectedCustomerId,
      });
      setTimeout(() => topRef.current?.scrollIntoView({ block: "start" }), 30);
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

  const money = (n: number) =>
    `${currencySymbol} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const owed = Math.max(0, selectedCustomer?.pendingBillwiseAmount || 0);
  const cashOnly = customerCashOnly.cashOnly;
  const fmtDate = (iso: string) =>
    iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  const openTotal = seriesInvoices.reduce((s, inv) => s + inv.availableToAllocate, 0);

  const blocker = (() => {
    if (!selectedCustomerId) return "Choose a customer";
    if (!(numericAmount > 0)) return "Enter the amount received";
    if (paymentMethod === "Cheque" && cashOnly) return "This customer is cash only. Cheques are not accepted.";
    if (paymentMethod === "Cheque" && (!chequeNumber.trim() || !chequeDate)) return "Enter the cheque number and date";
    if (paymentMethod === "Bank Transfer" && !referenceNo.trim()) return "Enter the transfer reference";
    if (overAllocated) return "More is applied to invoices than was received";
    if (allocationErrors.length > 0) return `Invoice ${allocationErrors[0].invoiceNumber} has less due than the amount applied`;
    return null;
  })();
  const MODES = [
    { key: "Cash", label: "Cash" },
    { key: "Bank Transfer", label: "Bank transfer" },
    { key: "Cheque", label: "Cheque" },
    { key: "Other", label: "Other" },
  ] as const;
  const setApplied = (invoiceId: string, value: string) => {
    setManualAlloc(true);
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  return (
    <div className="w-full">
      <PageHeader
        title="New receipt"
        breadcrumbs={[
          { label: "Receipts", href: "/receipts" },
          { label: "New" },
        ]}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocker) handleSubmit(e);
        }}
        className="px-4 sm:px-6 lg:px-8 pt-6 max-w-6xl mx-auto text-start"
      >
        <div ref={topRef} className="scroll-mt-24" />

        {saved ? (
          <SavedDocuments
            title={saved.title}
            customerId={saved.customerId}
            receiptNumbers={saved.receiptNumbers}
            newHref="/receipts/new"
            newLabel="New receipt"
            listHref="/receipts"
            listLabel="Go to receipts"
          />
        ) : (
          <>
            {errorMessage && (
              <div className="wiz-in flex items-start justify-between gap-3 rounded-md bg-rose-50 border border-rose-200 px-4 py-3 mb-5 text-sm text-rose-800">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {errorMessage}
                </span>
                <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800" aria-label="Dismiss">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="wiz-in bg-white border border-slate-200 rounded-lg shadow-sm">
              {/* Payment details */}
              <div className="p-5 md:p-8 space-y-5 max-w-3xl">
                <FieldRow label="Customer name" required>
                  <CustomerCombobox
                    customers={customers}
                    selectedId={selectedCustomerId}
                    onPick={pickCustomer}
                    onClear={() => {
                      setSelectedCustomerId("");
                      setCustomerSearchQuery("");
                    }}
                    onNew={() => setIsCustModalOpen(true)}
                    money={money}
                    autoFocus={!selectedCustomerId}
                  />
                  {selectedCustomer && (
                    <CustomerBalanceStrip
                      items={[
                        { label: "Owes", value: money(owed), tone: owed > 0 ? "bad" : "ok" },
                        { label: "Open invoices", value: openLoading ? "…" : String(seriesInvoices.length) },
                        { label: "Cheques not cleared", value: chequesPending > 0 ? money(chequesPending) : "None", tone: chequesPending > 0 ? "warn" : undefined },
                      ]}
                    />
                  )}
                  {cashOnly && (
                    <p className="wiz-in mt-2 flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {customerCashOnly.reason || "A cheque from this customer bounced."} Cash only: cheques are not accepted.
                    </p>
                  )}
                </FieldRow>

                <FieldRow
                  label="Amount received"
                  required
                  htmlFor="rc-amount"
                  hint={
                    openTotal > 0 ? (
                      <button type="button" onClick={() => setAmountPaid(openTotal.toFixed(dp))} className="text-accent font-medium hover:underline">
                        Receive the full due · {money(openTotal)}
                      </button>
                    ) : undefined
                  }
                >
                  <div className="flex max-w-xs">
                    <span className="h-10 px-3 inline-flex items-center text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-md">{currencySymbol}</span>
                    <input
                      id="rc-amount"
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className={`${fieldInput} rounded-l-none text-right font-semibold`}
                    />
                  </div>
                </FieldRow>

                <FieldRow label="Payment date" required htmlFor="rc-date">
                  <input id="rc-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={`${fieldInput} max-w-xs`} />
                </FieldRow>

                <FieldRow label="Payment mode" required>
                  <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden" role="radiogroup" aria-label="Payment mode">
                    {MODES.map((m, i) => {
                      const blocked = cashOnly && m.key === "Cheque";
                      const on = paymentMethod === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={blocked}
                          onClick={() => setPaymentMethod(m.key)}
                          className={`h-10 px-4 text-sm transition-colors ${i > 0 ? "border-l border-slate-300" : ""} ${
                            blocked ? "text-slate-300 bg-slate-50 cursor-not-allowed" : on ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  {paymentMethod === "Cash" && <div className="text-xs text-slate-500 mt-1.5">Added to your cash in hand.</div>}
                  {paymentMethod === "Cheque" && <div className="text-xs text-slate-500 mt-1.5">The invoices count as paid once the office marks the cheque cleared.</div>}
                </FieldRow>

                {paymentMethod === "Cheque" && (
                  <div key="cheque" className="wiz-in space-y-5">
                    <FieldRow label="Cheque number" required htmlFor="rc-chq">
                      <input id="rc-chq" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`${fieldInput} max-w-xs`} inputMode="numeric" />
                    </FieldRow>
                    <FieldRow label="Cheque date" required htmlFor="rc-chqd">
                      <input id="rc-chqd" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={`${fieldInput} max-w-xs`} />
                    </FieldRow>
                    <FieldRow label="Bank" htmlFor="rc-bank">
                      <input id="rc-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} className={`${fieldInput} max-w-sm`} placeholder="e.g. Emirates NBD" />
                    </FieldRow>
                  </div>
                )}

                {paymentMethod === "Bank Transfer" && (
                  <div key="transfer" className="wiz-in space-y-5">
                    <FieldRow label="Transfer reference" required htmlFor="rc-ref">
                      <input id="rc-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={`${fieldInput} max-w-sm`} placeholder="Ref. no. on the transfer slip" />
                    </FieldRow>
                    <FieldRow label="From bank" htmlFor="rc-bank2">
                      <input id="rc-bank2" value={bankName} onChange={(e) => setBankName(e.target.value)} className={`${fieldInput} max-w-sm`} placeholder="e.g. ADCB" />
                    </FieldRow>
                  </div>
                )}

                {paymentMethod === "Other" && (
                  <FieldRow label="Reference" htmlFor="rc-ref2">
                    <input id="rc-ref2" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={`${fieldInput} max-w-sm`} />
                  </FieldRow>
                )}
              </div>

              {/* Unpaid invoices */}
              <div className="border-t border-slate-200">
                <div className="px-5 md:px-8 pt-5 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">Unpaid invoices</h2>
                  {seriesInvoices.length > 0 && (
                    <div className="flex items-center gap-4 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setManualAlloc(false);
                          autoAllocate();
                        }}
                        disabled={!numericAmount}
                        className="text-accent font-medium hover:underline disabled:opacity-40"
                      >
                        {hasOmanReg ? "Apply UAE-registered first" : "Apply oldest first"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManualAlloc(true);
                          setAllocations({});
                        }}
                        className="text-slate-500 hover:text-slate-800"
                      >
                        Clear applied amounts
                      </button>
                    </div>
                  )}
                </div>

                {!selectedCustomerId ? (
                  <p className="px-5 md:px-8 pb-6 text-sm text-slate-500">Choose a customer to see their unpaid invoices.</p>
                ) : openLoading ? (
                  <div className="px-5 md:px-8 pb-6 space-y-2">
                    {[0, 1, 2].map((k) => (
                      <div key={k} className="h-9 rounded bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                ) : seriesInvoices.length === 0 ? (
                  <p className="px-5 md:px-8 pb-6 text-sm text-slate-500">No unpaid invoices. The amount is kept as an advance.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="text-left font-semibold px-5 md:px-8 py-2.5">Date</th>
                          <th className="text-left font-semibold px-3 py-2.5">Invoice#</th>
                          <th className="text-right font-semibold px-3 py-2.5">Invoice amount</th>
                          <th className="text-right font-semibold px-3 py-2.5">Amount due</th>
                          <th className="text-right font-semibold px-5 md:px-8 py-2.5 w-52">Payment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {seriesInvoices.map((inv, i) => {
                          const typed = allocations[inv.invoiceId] ?? "";
                          const amt = parseFloat(typed) || 0;
                          const tooMuch = amt - inv.availableToAllocate > 0.0005;
                          return (
                            <tr key={inv.invoiceId} className={`wiz-in transition-colors ${amt > 0 ? "bg-accent-light/30" : "hover:bg-slate-50/60"}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                              <td className="px-5 md:px-8 py-2.5 text-slate-700 whitespace-nowrap">
                                {fmtDate(String(inv.invoiceDate).slice(0, 10))}
                                {inv.isOverdue && <div className="text-[11px] text-rose-700">{inv.daysOverdue} days overdue</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-medium text-slate-900">{inv.invoiceNumber}</span>
                                {hasOmanReg && <span className="ml-2 text-[11px] text-slate-500">{inv.billingSeries === "oman_reg" ? "Oman-reg" : "UAE-reg"}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-700">{inv.grandTotal.toFixed(dp)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-900">
                                {inv.availableToAllocate.toFixed(dp)}
                                {inv.pendingCheques > 0 && <div className="text-[11px] text-amber-700">{inv.pendingCheques.toFixed(dp)} cheque pending</div>}
                              </td>
                              <td className="px-5 md:px-8 py-2">
                                <div className="flex items-center justify-end gap-2">
                                  {inv.availableToAllocate > 0 && amt + 0.0005 < inv.availableToAllocate && (
                                    <button type="button" onClick={() => setApplied(inv.invoiceId, inv.availableToAllocate.toFixed(dp))} className="text-xs text-accent hover:underline whitespace-nowrap">
                                      Pay in full
                                    </button>
                                  )}
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    value={typed}
                                    placeholder="0.00"
                                    onChange={(e) => setApplied(inv.invoiceId, e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className={`${fieldInput} w-28 h-9 text-right ${tooMuch ? "border-rose-400 text-rose-700" : ""}`}
                                    aria-label={`Payment for ${inv.invoiceNumber}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totals */}
                <div className="px-5 md:px-8 py-5 flex flex-col md:flex-row gap-6 md:justify-between border-t border-slate-200">
                  <label className="block md:max-w-sm w-full">
                    <span className="block text-sm text-slate-600 mb-1.5">Notes</span>
                    <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${fieldInput} h-auto py-2`} placeholder="Internal note (optional)" />
                  </label>
                  <dl className="w-full md:w-80 bg-slate-50 rounded-md border border-slate-200 p-4 text-sm space-y-2 self-start">
                    <div className="flex justify-between text-slate-600">
                      <dt>Amount received</dt>
                      <dd className="font-medium text-slate-900">{money(numericAmount)}</dd>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <dt>Amount used for invoices</dt>
                      <dd className="font-medium text-slate-900">{money(allocatedTotal)}</dd>
                    </div>
                    <div className={`flex justify-between pt-2 border-t border-slate-200 ${overAllocated ? "text-rose-700" : "text-slate-600"}`}>
                      <dt>{overAllocated ? "Over-applied by" : "Kept as advance"}</dt>
                      <dd className="font-semibold">{money(Math.abs(numericAmount - allocatedTotal))}</dd>
                    </div>
                    {hasOmanReg && receiptPreview.uae > 0.0005 && receiptPreview.oman > 0.0005 && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-900 pt-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Saves as two receipts: UAE-reg {money(receiptPreview.uae)}, Oman-reg {money(receiptPreview.oman)}.
                      </p>
                    )}
                  </dl>
                </div>
              </div>
            </div>

            <FormActionBar
              saveLabel="Save receipt"
              saving={isSaving}
              disabled={!!blocker}
              cancelHref="/receipts"
              hint={blocker}
              total={numericAmount > 0 ? money(numericAmount) : undefined}
            />
          </>
        )}
      </form>

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
