"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowLeft, CheckCircle2, X, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Customer, Receipt } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";

export default function NewReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId");
  const { user } = useAuth();

  // Form states
  const [receiptNumber, setReceiptNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Bank Transfer" | "Cheque" | "Other">("Cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

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

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch customers
        const custRes = await fetch("/api/customers");
        const custData = await custRes.json();
        const loadedCusts: Customer[] = custData.customers || [];
        setCustomers(loadedCusts);

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

        // Handle preselected customer
        if (preselectedCustomerId) {
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
  }, [preselectedCustomerId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amountPaid);

    if (!selectedCustomerId) {
      setErrorMessage("Please select a customer.");
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

    setIsSaving(true);
    setErrorMessage(null);

    const remainingAmt = Math.max(0, (selectedCustomer?.pendingBillwiseAmount || 0) - numericAmount);

    const newReceipt: Receipt = {
      id: `rec-${Date.now()}`,
      receiptNumber: receiptNumber.trim(),
      customerId: selectedCustomerId,
      customerName: selectedCustomer?.name,
      companyName: selectedCustomer?.company || customerSearchQuery.replace(/\s*\([^)]*\)/, "").trim(),
      amountPaid: numericAmount,
      remainingPendingAmount: remainingAmt,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      referenceNo: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
      createdBy: user?.name || "Admin",
    };

    try {
      // 1. Generate PDF base64
      const doc = buildReceiptPDF(newReceipt);
      const pdfBase64 = doc.output("datauristring").split(",")[1];

      // 2. Submit to API backend (support both query params & JSON body for Apps Script)
      const params = new URLSearchParams();
      params.append("receiptNumber", newReceipt.receiptNumber);
      params.append("companyName", newReceipt.companyName);
      params.append("customerName", newReceipt.customerName || "");
      params.append("amountPaid", newReceipt.amountPaid.toString());
      params.append("paymentDate", newReceipt.paymentDate);
      params.append("paymentMethod", newReceipt.paymentMethod);
      params.append("referenceNo", newReceipt.referenceNo || "");

      await fetch(`/api/receipts?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptNumber: newReceipt.receiptNumber,
          customerName: newReceipt.customerName,
          companyName: newReceipt.companyName,
          amountPaid: newReceipt.amountPaid,
          paymentDate: newReceipt.paymentDate,
          paymentMethod: newReceipt.paymentMethod,
          referenceNo: newReceipt.referenceNo,
          fileName: `MAAT-RECEIPT-${newReceipt.receiptNumber}.pdf`,
          pdfBase64,
        }),
      });

      // 3. Update customer pending balance (minus from pending billwise amount)
      await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: newReceipt.companyName,
          customerId: newReceipt.customerId,
          amountToAdd: -numericAmount, // Minus from pending credit
        }),
      });

      // Local update for state/localStorage
      const updatedCusts = customers.map((c) => {
        if (c.id === newReceipt.customerId || c.company.toLowerCase().trim() === newReceipt.companyName.toLowerCase().trim()) {
          return {
            ...c,
            pendingBillwiseAmount: Math.max(0, (c.pendingBillwiseAmount || 0) - numericAmount),
          };
        }
        return c;
      });
      setCustomers(updatedCusts);

      // Save receipt locally
      const updatedReceipts = [newReceipt, ...receiptsList];
      setReceiptsList(updatedReceipts);
      localStorage.setItem("maat_receipts", JSON.stringify(updatedReceipts));

      setSuccessMessage(`Receipt ${newReceipt.receiptNumber} generated and billwise balance updated successfully!`);
      setTimeout(() => {
        router.push("/receipts");
      }, 1800);
    } catch (err) {
      console.error("Failed to save receipt:", err);
      setErrorMessage("Failed to process receipt. Please try again.");
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
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[#61989B]">
        <Link href="/receipts" className="hover:text-[#4e7d80] transition flex items-center gap-1 text-sm font-bold">
          <ArrowLeft className="w-4.5 h-4.5" />
          Back to Receipts
        </Link>
      </div>

      <PageHeader
        title="Issue Customer Receipt"
        description="Record payback amount received from customer and deduct it directly from their pending billwise balance."
      />

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
                            Pending: AED {Math.max(0, c.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    AED {Math.max(0, selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Details Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
              2. Payment & Payback Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Amount Paid (AED) *
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

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Reference / Cheque # (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Cheque #884920 or Transfer Ref TRX-928"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>

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
                    AED {Math.max(0, selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-dashed border-slate-200 pt-3">
                  <span className="text-slate-500 font-medium">Amount Received:</span>
                  <span className="font-black text-emerald-600 text-base">
                    - AED {(parseFloat(amountPaid) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 mt-4 space-y-1">
                  <span className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">New Outstanding Balance</span>
                  <span className="text-lg font-black text-emerald-800">
                    AED {Math.max(0, (selectedCustomer.pendingBillwiseAmount || 0) - (parseFloat(amountPaid) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
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
              {isSaving ? "Saving & Deducting..." : "Save Receipt & Deduct Credit"}
            </button>
          </div>
        </div>
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
