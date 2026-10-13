"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Info,
  Landmark,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Avatar, ChoiceTile, ReviewSection, StepPanel, WizardBar, WizardStep, WizardStepper } from "@/components/wizard/WizardUI";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { AccountSnapshot, SavedDocuments } from "@/components/CustomerAccountPanels";
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
    goTo(1);
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
        goTo(1);
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
  const methodLabel = (m: string) => (m === "Bank Transfer" ? "Bank transfer" : m);
  const fmtDate = (iso: string) =>
    iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  const openTotal = seriesInvoices.reduce((s, inv) => s + inv.availableToAllocate, 0);
  const preInvoice = seriesInvoices.find((inv) => inv.invoiceId === selectedInvoiceId);

  const detailsBlocker = (() => {
    if (!(numericAmount > 0)) return "Enter the amount received";
    if (paymentMethod === "Cheque" && cashOnly) return "This customer is cash only. Cheques are not accepted.";
    if (paymentMethod === "Cheque" && (!chequeNumber.trim() || !chequeDate)) return "Enter the cheque number and date";
    if (paymentMethod === "Bank Transfer" && !referenceNo.trim()) return "Enter the transfer reference";
    return null;
  })();
  const allocBlocker = overAllocated
    ? "More is applied to invoices than was received"
    : allocationErrors.length > 0
      ? `Invoice ${allocationErrors[0].invoiceNumber} has less open than the amount applied`
      : null;
  const maxStep = !selectedCustomerId ? 0 : detailsBlocker ? 1 : allocBlocker ? 2 : 3;
  const STEPS: WizardStep[] = [
    { label: "Customer", icon: Users },
    { label: "Payment", icon: Wallet },
    { label: "Apply", icon: FileText },
    { label: "Review", icon: ClipboardCheck },
  ];
  const stepHint = step === 0 ? "Choose a customer" : step === 1 ? detailsBlocker : step === 2 ? allocBlocker : null;
  const appliedRows = seriesInvoices
    .map((inv) => ({ inv, amt: parseFloat(allocations[inv.invoiceId] || "") || 0 }))
    .filter((r) => r.amt > 0);
  const METHODS = [
    { key: "Cash", icon: Wallet, hint: "Adds to your cash in hand" },
    { key: "Bank Transfer", icon: Landmark, hint: "Reference needed" },
    { key: "Cheque", icon: FileText, hint: "Counts once it clears" },
    { key: "Other", icon: CreditCard, hint: "Card or anything else" },
  ] as const;
  const appliedPct = numericAmount > 0 ? Math.min(100, (allocatedTotal / numericAmount) * 100) : 0;

  const input =
    "w-full px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";
  const label = "block text-sm font-medium text-slate-700 mb-1.5";

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
          if (step < 3) {
            if (step < maxStep) goTo(step + 1);
          } else {
            handleSubmit(e);
          }
        }}
        className="px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 pb-4 max-w-5xl mx-auto text-start"
      >
        <div ref={topRef} className="scroll-mt-24" />

        {saved && (
          <SavedDocuments
            title={saved.title}
            customerId={saved.customerId}
            receiptNumbers={saved.receiptNumbers}
            newHref="/receipts/new"
            newLabel="New receipt"
            listHref="/receipts"
            listLabel="Go to receipts"
          />
        )}

        {!saved && (
          <>
            <WizardStepper steps={STEPS} step={step} maxStep={maxStep} onGo={goTo} />

            {errorMessage && (
              <div className="wiz-in flex items-start justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 mb-5 text-sm text-rose-800">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {errorMessage}
                </span>
                <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800" aria-label="Dismiss">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 1: CUSTOMER */}
            {step === 0 && (
              <StepPanel
                stepKey="customer"
                icon={Users}
                title="Who paid?"
                subtitle="Search and tap a customer to continue."
                action={
                  <button
                    type="button"
                    onClick={() => setIsCustModalOpen(true)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-accent bg-accent-light hover:bg-accent hover:text-white rounded-xl px-3.5 py-2.5 transition"
                  >
                    <UserPlus className="w-4 h-4" /> New customer
                  </button>
                }
              >
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search clinic, farm or doctor"
                    value={selectedCustomer && customerSearchQuery.startsWith(selectedCustomer.company) ? "" : customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setActiveCustomer(0);
                    }}
                    onKeyDown={(e) => {
                      const list = filteredCustomers.slice(0, 40);
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveCustomer((i) => Math.min(i + 1, list.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveCustomer((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (list[activeCustomer]) pickCustomer(list[activeCustomer]);
                      }
                    }}
                    className={`${input} pl-12 py-3.5 text-base`}
                  />
                </div>
                {filteredCustomers.length === 0 ? (
                  <div className="text-center py-10">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No customer matches.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto -mx-1 px-1 py-1">
                    {filteredCustomers.slice(0, 40).map((c, i) => {
                      const chosen = c.id === selectedCustomerId;
                      const active = i === activeCustomer;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickCustomer(c)}
                          onMouseEnter={() => setActiveCustomer(i)}
                          className={`wiz-in flex items-center gap-3 text-left rounded-xl border p-3 transition-all duration-150 ${
                            chosen
                              ? "border-accent bg-accent-light/60 ring-2 ring-accent/20"
                              : active
                                ? "border-slate-300 bg-slate-50 shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                          style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
                        >
                          <Avatar name={c.company} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900 truncate">{c.company}</div>
                            <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                              {c.address && <MapPin className="w-3 h-3 shrink-0" />}
                              {[c.name, c.address].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          {(c.pendingBillwiseAmount || 0) > 0 ? (
                            <span className="shrink-0 text-xs font-medium text-rose-700 bg-rose-50 rounded-full px-2 py-0.5">{money(c.pendingBillwiseAmount || 0)}</span>
                          ) : (
                            <span className="shrink-0 text-xs text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">Clear</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </StepPanel>
            )}

            {/* STEP 2: PAYMENT */}
            {step === 1 && (
              <StepPanel
                stepKey="payment"
                icon={Wallet}
                title="How much was received?"
                subtitle={selectedCustomer ? <>from <span className="font-medium text-slate-700">{selectedCustomer.company}</span></> : undefined}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <div className="rounded-xl bg-rose-50/70 border border-rose-100 px-4 py-3">
                    <div className="text-xs text-rose-700/80">Owes now</div>
                    <div className="text-lg font-semibold text-rose-800">{money(owed)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <div className="text-xs text-slate-500">Open invoices</div>
                    <div className="text-lg font-semibold text-slate-900">{openLoading ? "…" : seriesInvoices.length}</div>
                  </div>
                  <div className="rounded-xl bg-amber-50/70 border border-amber-100 px-4 py-3">
                    <div className="text-xs text-amber-800/80">Cheques not cleared</div>
                    <div className="text-lg font-semibold text-amber-900">{chequesPending > 0 ? money(chequesPending) : "None"}</div>
                  </div>
                </div>

                {cashOnly && (
                  <p className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    {customerCashOnly.reason || "A cheque from this customer bounced."} Cash only: cheques are not accepted.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-4">
                  <label className="block">
                    <span className={label}>Amount received</span>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">{currencySymbol}</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        autoFocus
                        placeholder="0.00"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className={`${input} pl-16 py-4 text-2xl font-semibold`}
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className={label}>Date received</span>
                    <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={`${input} py-4`} />
                  </label>
                </div>
                {(preInvoice || openTotal > 0) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {preInvoice && (
                      <button type="button" onClick={() => setAmountPaid(String(preInvoice.availableToAllocate))} className="text-xs font-semibold text-accent bg-accent-light hover:bg-accent hover:text-white rounded-full px-3 py-1.5 transition">
                        Invoice {preInvoice.invoiceNumber} · {money(preInvoice.availableToAllocate)}
                      </button>
                    )}
                    {openTotal > 0 && (
                      <button type="button" onClick={() => setAmountPaid(openTotal.toFixed(dp))} className="text-xs font-semibold text-accent bg-accent-light hover:bg-accent hover:text-white rounded-full px-3 py-1.5 transition">
                        Everything open · {money(openTotal)}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-7">
                  <span className={label}>Paid by</span>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {METHODS.map((m) => {
                      const blocked = cashOnly && m.key === "Cheque";
                      return (
                        <ChoiceTile
                          key={m.key}
                          selected={paymentMethod === m.key}
                          disabled={blocked}
                          icon={m.icon}
                          title={methodLabel(m.key)}
                          hint={blocked ? "Not accepted" : m.hint}
                          onClick={() => setPaymentMethod(m.key)}
                        />
                      );
                    })}
                  </div>
                </div>

                {paymentMethod === "Cheque" && (
                  <div key="cheque" className="wiz-in mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4 md:p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
                      <FileText className="w-4 h-4 text-accent" /> Cheque details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <label className="block">
                        <span className={label}>Cheque no.</span>
                        <input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={input} inputMode="numeric" placeholder="e.g. 000123" />
                      </label>
                      <label className="block">
                        <span className={label}>Cheque date</span>
                        <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={input} />
                      </label>
                      <label className="block">
                        <span className={label}>
                          Bank <span className="font-normal text-slate-400">(optional)</span>
                        </span>
                        <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={input} placeholder="e.g. Emirates NBD" />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">The invoices count as paid once the office marks the cheque cleared.</p>
                  </div>
                )}

                {paymentMethod === "Bank Transfer" && (
                  <div key="transfer" className="wiz-in mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4 md:p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
                      <Landmark className="w-4 h-4 text-accent" /> Transfer details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className={label}>Transfer reference</span>
                        <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={input} placeholder="Ref. no. on the transfer slip" />
                      </label>
                      <label className="block">
                        <span className={label}>
                          From bank <span className="font-normal text-slate-400">(optional)</span>
                        </span>
                        <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={input} placeholder="e.g. ADCB" />
                      </label>
                    </div>
                  </div>
                )}

                {paymentMethod === "Other" && (
                  <label key="other" className="wiz-in block mt-5">
                    <span className={label}>
                      Reference <span className="font-normal text-slate-400">(optional)</span>
                    </span>
                    <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={input} />
                  </label>
                )}

                <label className="block mt-6 pt-6 border-t border-slate-100">
                  <span className={label}>
                    Note <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
                </label>
              </StepPanel>
            )}

            {/* STEP 3: APPLY */}
            {step === 2 && (
              <StepPanel
                stepKey="apply"
                icon={FileText}
                title="Which invoices does it pay?"
                subtitle="Filled oldest first. Change any amount if the customer said otherwise."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setManualAlloc(false);
                      autoAllocate();
                    }}
                    disabled={!numericAmount || seriesInvoices.length === 0}
                    className="flex items-center gap-1.5 text-sm font-semibold text-accent bg-accent-light hover:bg-accent hover:text-white rounded-xl px-3.5 py-2.5 transition disabled:opacity-40"
                  >
                    <RefreshCw className="w-4 h-4" /> {hasOmanReg ? "Fill UAE-reg first" : "Fill oldest first"}
                  </button>
                }
              >
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-5">
                  <div className="flex flex-wrap justify-between gap-2 text-sm mb-2">
                    <span className="text-slate-600">
                      Applied <span className="font-semibold text-slate-900">{money(allocatedTotal)}</span> of {money(numericAmount)}
                    </span>
                    <span className={overAllocated ? "text-rose-700 font-semibold" : "text-slate-600"}>
                      {overAllocated ? "Over by " : "Advance "}
                      <span className="font-semibold">{money(Math.abs(numericAmount - allocatedTotal))}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${overAllocated ? "bg-rose-500" : "bg-accent"}`} style={{ width: `${overAllocated ? 100 : appliedPct}%` }} />
                  </div>
                </div>

                {openLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((k) => (
                      <div key={k} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                ) : seriesInvoices.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600">No open invoices</p>
                    <p className="text-xs text-slate-400 mt-1">The whole amount is kept as an advance.</p>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {seriesInvoices.map((inv, i) => {
                      const typed = allocations[inv.invoiceId] ?? "";
                      const amt = parseFloat(typed) || 0;
                      const tooMuch = amt - inv.availableToAllocate > 0.0005;
                      const full = amt > 0 && !tooMuch && amt + 0.0005 >= inv.availableToAllocate;
                      return (
                        <li
                          key={inv.invoiceId}
                          className={`wiz-in rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition ${
                            tooMuch ? "border-rose-300 bg-rose-50/50" : amt > 0 ? "border-accent/40 bg-accent-light/40" : "border-slate-200 bg-white"
                          }`}
                          style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${full ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {full ? <CheckCircle2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                                {inv.invoiceNumber}
                                {hasOmanReg && (
                                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${inv.billingSeries === "oman_reg" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                                    {inv.billingSeries === "oman_reg" ? "Oman-reg" : "UAE-reg"}
                                  </span>
                                )}
                                {inv.isOverdue && <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-rose-100 text-rose-800">{inv.daysOverdue}d overdue</span>}
                              </div>
                              <div className="text-xs text-slate-500">
                                {fmtDate(String(inv.invoiceDate).slice(0, 10))} · open {money(inv.availableToAllocate)}
                                {inv.pendingCheques > 0 && <span className="text-amber-700"> · {money(inv.pendingCheques)} cheque pending</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            {!full && inv.availableToAllocate > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setManualAlloc(true);
                                  setAllocations((prev) => ({ ...prev, [inv.invoiceId]: inv.availableToAllocate.toFixed(dp) }));
                                }}
                                className="text-xs font-semibold text-accent hover:underline whitespace-nowrap"
                              >
                                Pay in full
                              </button>
                            )}
                            <div className="relative w-full sm:w-36">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{currencySymbol}</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={typed}
                                placeholder="0"
                                onChange={(e) => {
                                  setManualAlloc(true);
                                  setAllocations((prev) => ({ ...prev, [inv.invoiceId]: e.target.value }));
                                }}
                                onFocus={(e) => e.target.select()}
                                className={`${input} pl-12 text-right font-semibold ${tooMuch ? "border-rose-400 text-rose-700" : ""}`}
                                aria-label={`Amount for ${inv.invoiceNumber}`}
                              />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </StepPanel>
            )}

            {/* STEP 4: REVIEW */}
            {step === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
                <div className="space-y-5 min-w-0">
                  <ReviewSection icon={User} title="Received from" onEdit={() => goTo(0)}>
                    <div className="flex items-center gap-3">
                      <Avatar name={selectedCustomer?.company || customerSearchQuery} size="lg" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{selectedCustomer?.company || customerSearchQuery}</div>
                        {(selectedCustomer?.name || selectedCustomer?.address) && (
                          <div className="text-sm text-slate-500 truncate">{[selectedCustomer?.name, selectedCustomer?.address].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>
                    </div>
                  </ReviewSection>

                  <ReviewSection icon={Wallet} title="Payment" onEdit={() => goTo(1)} delay={60}>
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
                        {paymentMethod === "Bank Transfer" ? <Landmark className="w-5 h-5" /> : paymentMethod === "Cheque" ? <FileText className="w-5 h-5" /> : paymentMethod === "Other" ? <CreditCard className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900">
                          {methodLabel(paymentMethod)} · {fmtDate(paymentDate)}
                        </div>
                        {paymentMethod === "Cheque" && (
                          <div className="text-sm text-slate-500">
                            Cheque {chequeNumber} dated {fmtDate(chequeDate)}
                            {bankName ? ` · ${bankName}` : ""}
                          </div>
                        )}
                        {paymentMethod !== "Cheque" && referenceNo && (
                          <div className="text-sm text-slate-500">
                            Ref. {referenceNo}
                            {paymentMethod === "Bank Transfer" && bankName ? ` · ${bankName}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                    {notes && <p className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-lg px-3 py-2">{notes}</p>}
                  </ReviewSection>

                  <ReviewSection icon={FileText} title="Pays" onEdit={() => goTo(2)} delay={120}>
                    {appliedRows.length === 0 ? (
                      <p className="text-sm text-slate-700">No invoices. Kept as an advance.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {appliedRows.map(({ inv, amt }) => {
                          const full = amt + 0.0005 >= inv.availableToAllocate;
                          return (
                            <li key={inv.invoiceId} className="py-2.5 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                {full ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Clock className="w-4 h-4 text-amber-600 shrink-0" />}
                                <span className="text-sm text-slate-900">{inv.invoiceNumber}</span>
                                <span className="text-xs text-slate-500">{full ? "paid in full" : `${money(inv.availableToAllocate - amt)} left`}</span>
                              </div>
                              <span className="text-sm font-semibold text-slate-900">{money(amt)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {unallocated > 0.0005 && appliedRows.length > 0 && <p className="text-sm text-slate-500 mt-2">{money(unallocated)} kept as advance.</p>}
                    {hasOmanReg && receiptPreview.uae > 0.0005 && receiptPreview.oman > 0.0005 && (
                      <p className="mt-3 flex items-start gap-2 text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Saves as two receipts: UAE-registered {money(receiptPreview.uae)} and Oman-registered {money(receiptPreview.oman)}.
                      </p>
                    )}
                  </ReviewSection>
                </div>

                <div className="space-y-5 lg:sticky lg:top-6">
                  <section className="wiz-in rounded-2xl overflow-hidden shadow-lg shadow-primary/10" style={{ animationDelay: "80ms" }}>
                    <div className="bg-gradient-to-br from-primary to-accent text-white px-6 py-6">
                      <div className="text-xs uppercase tracking-wide text-white/70">Amount received</div>
                      <div className="text-3xl font-semibold mt-1">{money(numericAmount)}</div>
                      <div className="text-sm text-white/80 mt-1">
                        {methodLabel(paymentMethod)} · {appliedRows.length} {appliedRows.length === 1 ? "invoice" : "invoices"}
                      </div>
                    </div>
                    <div className="bg-white border-x border-b border-slate-200 rounded-b-2xl px-6 py-3 text-xs text-slate-400 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5" /> Receipt number is given on save
                    </div>
                  </section>

                  {selectedCustomerId && (
                    <AccountSnapshot customerId={selectedCustomerId} change={{ kind: "receipt", amount: numericAmount, cheque: paymentMethod === "Cheque" }} />
                  )}
                </div>
              </div>
            )}

            <WizardBar
              step={step}
              onBack={() => goTo(step - 1)}
              cancelHref="/receipts"
              summaryLabel={step >= 1 && numericAmount > 0 ? methodLabel(paymentMethod) : undefined}
              summaryValue={step >= 1 && numericAmount > 0 ? money(numericAmount) : undefined}
              next={
                step < 3
                  ? { label: step === 2 ? "Review" : "Next", disabled: step >= maxStep, onClick: () => goTo(step + 1), hint: stepHint }
                  : { label: isSaving ? "Saving…" : "Save receipt", disabled: isSaving || maxStep < 3, submit: true, tone: "accent" }
              }
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
