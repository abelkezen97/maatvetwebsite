"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Search, ArrowLeft, Percent, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { QuoteItem, Product, Customer } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { mockQuotes } from "@/lib/mockData";
import { buildPDF } from "@/lib/pdfHelper";

interface QuoteItemWithManual extends QuoteItem {
  manualDiscount?: number;
}

function NewQuoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editQuoteNumber = searchParams.get("edit");
  const { user } = useAuth();
  
  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteItemWithManual[]>([]);
  const [notes, setNotes] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // Search state for product selector modal/dropdown
  const [searchQuery, setSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // New Customer inline modal states
  const [isCustModalOpen, setIsCustModalOpen] = useState(false);
  const [formCustCompany, setFormCustCompany] = useState("");
  const [formCustName, setFormCustName] = useState("");
  const [formCustLocation, setFormCustLocation] = useState("");
  const [isCustSubmitting, setIsCustSubmitting] = useState(false);
  const [formCustSuccess, setFormCustSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load products and customers on mount
  useEffect(() => {
    async function loadData() {
      try {
        const prodRes = await fetch("/api/products");
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);

        const custRes = await fetch("/api/customers");
        const custData = await custRes.json();
        setCustomers(custData.customers || []);
      } catch (err) {
        console.error("Failed to load inventory/customer data:", err);
      }
    }
    loadData();
  }, []);

  // Prepopulate form if in EDIT mode
  useEffect(() => {
    if (editQuoteNumber && mockQuotes.length > 0) {
      const existingQuote = mockQuotes.find((q) => q.quoteNumber === editQuoteNumber);
      if (existingQuote) {
        setSelectedCustomerId(existingQuote.customerId);
        setNotes(existingQuote.notes || "");
        
        // Map QuoteItems to QuoteItemWithManual
        const mappedItems = existingQuote.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          total: item.total,
          manualDiscount: item.discount < item.price ? item.discount : undefined,
        }));
        setQuoteItems(mappedItems);
      }
    }
  }, [editQuoteNumber]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [selectedCustomerId, customers]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, products]);

  // Calculate pricing summary details
  const subtotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
  }, [quoteItems]);

  const discountTotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => acc + item.quantity * (item.price - item.discount), 0);
  }, [quoteItems]);

  const taxTotal = 0.00; // Removed VAT calculation as per policy

  const grandTotal = useMemo(() => {
    return subtotal - discountTotal + taxTotal;
  }, [subtotal, discountTotal, taxTotal]);

  // Handlers
  const handleAddItem = (prod: Product) => {
    // Check if product already exists in item list
    const existingIdx = quoteItems.findIndex((item) => item.productId === prod.id);
    if (existingIdx > -1) {
      // Just increment qty by 1
      const updated = [...quoteItems];
      updated[existingIdx].quantity += 1;
      
      // Reevaluate price tier discount
      const qty = updated[existingIdx].quantity;
      let tierPrice = prod.price;
      if (qty >= 100) tierPrice = prod.price100 ?? tierPrice;
      else if (qty >= 50) tierPrice = prod.price50 ?? tierPrice;
      else if (qty >= 10) tierPrice = prod.price10 ?? tierPrice;
      
      // If manual discount is not set, update base discount
      if (updated[existingIdx].manualDiscount === undefined) {
        updated[existingIdx].discount = tierPrice;
      }
      
      const finalUnit = updated[existingIdx].manualDiscount !== undefined
        ? updated[existingIdx].manualDiscount
        : tierPrice;
        
      updated[existingIdx].total = qty * finalUnit;
      setQuoteItems(updated);
    } else {
      // Add as new item
      const newItem: QuoteItemWithManual = {
        productId: prod.id,
        productName: prod.name,
        quantity: 1,
        price: prod.price,
        discount: prod.price,
        total: prod.price,
      };
      setQuoteItems([...quoteItems, newItem]);
    }
    setShowProductDropdown(false);
  };

  const handleQtyChange = (index: number, qtyVal: string) => {
    const qty = parseInt(qtyVal) || 1;
    const updated = [...quoteItems];
    updated[index].quantity = qty;

    // Retrieve active product to evaluate default price tiers
    const item = updated[index];
    const prod = products.find((p) => p.id === item.productId);
    if (prod) {
      let tierPrice = prod.price;
      if (qty >= 100) tierPrice = prod.price100 ?? tierPrice;
      else if (qty >= 50) tierPrice = prod.price50 ?? tierPrice;
      else if (qty >= 10) tierPrice = prod.price10 ?? tierPrice;

      // If no custom price set, apply tier price
      if (item.manualDiscount === undefined) {
        updated[index].discount = tierPrice;
      }
    }

    const finalUnit = item.manualDiscount !== undefined ? item.manualDiscount : item.discount;
    updated[index].total = qty * finalUnit;
    setQuoteItems(updated);
  };

  const handleDiscountChange = (index: number, discVal: string) => {
    const val = parseFloat(discVal);
    const updated = [...quoteItems];
    const item = updated[index];

    if (isNaN(val) || val <= 0) {
      // Revert to sheet default tier price
      delete updated[index].manualDiscount;
      const prod = products.find((p) => p.id === item.productId);
      let tierPrice = item.price;
      if (prod) {
        const qty = item.quantity;
        if (qty >= 100) tierPrice = prod.price100 ?? tierPrice;
        else if (qty >= 50) tierPrice = prod.price50 ?? tierPrice;
        else if (qty >= 10) tierPrice = prod.price10 ?? tierPrice;
      }
      updated[index].discount = tierPrice;
      updated[index].total = item.quantity * tierPrice;
    } else {
      updated[index].manualDiscount = val;
      updated[index].discount = val;
      updated[index].total = item.quantity * val;
    }
    setQuoteItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...quoteItems];
    updated.splice(index, 1);
    setQuoteItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || quoteItems.length === 0 || isSaving) return;

    setIsSaving(true);
    const newQuoteNum = editQuoteNumber || `QT-2026-0${mockQuotes.length + 1}`;
    const dateStr = new Date().toISOString().split("T")[0];

    const newQuote = {
      id: editQuoteNumber
        ? (mockQuotes.find((q) => q.quoteNumber === editQuoteNumber)?.id || `q-mock-${Date.now()}`)
        : `q-mock-${Date.now()}`,
      quoteNumber: newQuoteNum,
      customerId: selectedCustomerId,
      customerName: selectedCustomer?.name || "",
      companyName: selectedCustomer?.company || "",
      salesmanId: user?.id || "user-salesman",
      salesmanName: user?.name || "Dr. Kaleemullah M.",
      date: dateStr,
      items: quoteItems,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      status: "Pending" as const,
      notes,
    };

    try {
      // 1. Generate PDF and get Base64 string
      const doc = buildPDF(newQuote);
      const pdfBase64 = doc.output("datauristring").split(",")[1];

      // 2. Upload to Google Drive & log to sheet via our secure API
      const payload = {
        quoteNumber: newQuoteNum,
        customerName: selectedCustomer?.name || "",
        companyName: selectedCustomer?.company || "",
        salesmanName: user?.name || "Dr. Kaleemullah M.",
        date: dateStr,
        grandTotal: grandTotal,
        fileName: `MAAT-QUOTE-${newQuoteNum}.pdf`,
        pdfBase64: pdfBase64,
      };

      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to upload quote to Google Drive");
      }

      // Add or Update in mockQuotes array
      if (editQuoteNumber) {
        const existingIdx = mockQuotes.findIndex((q) => q.quoteNumber === editQuoteNumber);
        if (existingIdx > -1) {
          mockQuotes[existingIdx] = newQuote;
        } else {
          mockQuotes.unshift(newQuote);
        }
        alert(`Quotation ${newQuoteNum} successfully updated in your Google Sheet & Drive!`);
      } else {
        mockQuotes.unshift(newQuote);
        alert(`Quotation ${newQuoteNum} successfully generated and saved to Google Drive!`);
      }

      router.push("/quotes");
    } catch (err) {
      console.error("Save quote error:", err);
      alert("Quotation saved locally, but failed to sync to Google Drive. Please check your network connection.");
      
      // Still push in-memory for fallback session continuity
      if (editQuoteNumber) {
        const existingIdx = mockQuotes.findIndex((q) => q.quoteNumber === editQuoteNumber);
        if (existingIdx > -1) {
          mockQuotes[existingIdx] = newQuote;
        } else {
          mockQuotes.unshift(newQuote);
        }
      } else {
        mockQuotes.unshift(newQuote);
      }
      router.push("/quotes");
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
        // Add new customer to local state
        const added = resData.customer;
        setCustomers((prev) => [added, ...prev]);
        setSelectedCustomerId(added.id);
        setFormCustSuccess(true);
        setTimeout(() => {
          setIsCustModalOpen(false);
          setFormCustSuccess(false);
          setFormCustCompany("");
          setFormCustName("");
          setFormCustLocation("");
        }, 1500);
      }
    } catch (err) {
      console.error("Error creating customer:", err);
      alert("Failed to add customer. Please try again.");
    } finally {
      setIsCustSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header with back button */}
      <div className="flex items-center gap-2 text-[#61989B]">
        <Link href="/quotes" className="hover:text-[#4e7d80] transition flex items-center gap-1 text-sm font-bold">
          <ArrowLeft className="w-4.5 h-4.5" />
          Back to Quotations
        </Link>
      </div>

      <PageHeader
        title={editQuoteNumber ? `Edit Quotation` : `New Quotation`}
        description={
          editQuoteNumber
            ? `Modify items, customize price tiers, or write remarks for Ref: ${editQuoteNumber}.`
            : `Select a clinic/client, add medications from inventory, and set custom discounts.`
        }
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Builder Details (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            
            {/* Step 1: Client details */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
                  1. Select Account / Stable / Doctor
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCustModalOpen(true)}
                  className="text-xs font-bold text-[#61989B] hover:text-[#4e7d80] transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Customer
                </button>
              </div>

              <div>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-semibold"
                >
                  <option value="">-- Choose Client --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company} {c.name ? `(${c.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Step 2: Product items table */}
            <div className="space-y-4">
              <div className="flex justify-between items-center relative">
                <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
                  2. Added Quotation Items
                </h3>

                {/* Search / Add input dropdown */}
                <div className="relative w-72">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search inventory..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-accent/15 transition"
                    />
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {showProductDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                      {filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-xs font-semibold text-slate-400">
                          No items match your search
                        </div>
                      ) : (
                        filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleAddItem(p)}
                            className="w-full px-4 py-3 text-left hover:bg-slate-50 transition flex justify-between items-center gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block text-xs font-bold text-slate-800 truncate">{p.name}</span>
                              <span className="block text-[10px] font-semibold text-slate-400 truncate">{p.category}</span>
                            </div>
                            <span className="text-xs font-bold text-[#61989B] shrink-0">
                              AED {p.price.toFixed(2)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              {quoteItems.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-2">
                  <div className="text-sm font-bold text-slate-500">No items added to builder</div>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                    Search the product inventory catalog above to add pharmaceutical care items and supplements.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Item Details</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider w-20 text-center">Qty</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider w-28 text-right">Base (AED)</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider w-36 text-right">Disc. Price (AED)</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider w-28 text-right">Total</th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quoteItems.map((item, idx) => (
                        <tr key={`${item.productId}-${idx}`} className="hover:bg-slate-50/50 transition">
                          <td className="px-4 py-3.5">
                            <span className="block font-bold text-slate-800">{item.productName}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => handleQtyChange(idx, e.target.value)}
                              className="w-16 px-2 py-1 text-center bg-white border border-slate-200 rounded-lg text-slate-800 font-bold focus:outline-none focus:border-[#61989B] text-xs"
                            />
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-slate-500">
                            {item.price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <input
                              type="number"
                              step="0.01"
                              placeholder={item.price.toFixed(2)}
                              value={item.manualDiscount !== undefined ? item.manualDiscount : ""}
                              onChange={(e) => handleDiscountChange(idx, e.target.value)}
                              className="w-28 px-2 py-1 text-right bg-white border border-slate-200 rounded-lg text-slate-800 font-bold focus:outline-none focus:border-[#61989B] text-xs"
                            />
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-[#1B2A4A]">
                            {item.total.toFixed(2)}
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Pricing / Summary panel */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-[#1B2A4A] uppercase tracking-wider">
              Quotation Summary
            </h3>

            {/* Calculations */}
            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between font-semibold text-slate-500">
                <span>Subtotal:</span>
                <span>AED {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-rose-500">
                <span>Discount Total:</span>
                <span>-AED {discountTotal.toFixed(2)}</span>
              </div>
              
              <hr className="border-slate-100" />
              
              <div className="flex justify-between font-extrabold text-[#1B2A4A] text-lg">
                <span>Grand Total:</span>
                <span>AED {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Remarks / Delivery instructions */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                Special Remarks / Delivery Notes
              </label>
              <textarea
                rows={3}
                placeholder="e.g. deliver before 10 AM, check calcium batch..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={isSaving || !selectedCustomerId || quoteItems.length === 0}
                className="flex w-full justify-center items-center gap-2 py-3.5 px-4 text-base font-bold text-white bg-primary rounded-xl hover:bg-[#15223c] focus:outline-none disabled:opacity-50 transition duration-150 cursor-pointer shadow-md shadow-primary/10"
              >
                <CheckCircle className="w-5 h-5" />
                {isSaving
                  ? "Saving to Google Drive..."
                  : editQuoteNumber
                    ? "Update Quotation"
                    : "Submit Quotation"}
              </button>
              <Link
                href="/quotes"
                className="flex w-full justify-center items-center py-3.5 px-4 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition duration-150"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>

      </form>

      {/* Click backdrop to close product selector dropdown */}
      {showProductDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowProductDropdown(false)} />
      )}

      {/* Add New Customer Inline Modal */}
      {isCustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            {formCustSuccess ? (
              <div className="text-center py-8 space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 animate-bounce" />
                </div>
                <h4 className="text-base font-bold text-slate-800">Customer Added Successfully</h4>
                <p className="text-xs text-slate-400">Syncing with Google Sheets database...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-5">
                  <h3 className="font-bold text-slate-900 text-base">Register New Customer</h3>
                  <button
                    onClick={() => setIsCustModalOpen(false)}
                    className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                <form onSubmit={handleAddNewCustomer} className="space-y-4">
                  {/* Company/Stable Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Clinic / Stable / Farm Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Nicosia International Stable"
                      required
                      value={formCustCompany}
                      onChange={(e) => setFormCustCompany(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  {/* Contact Doctor Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Primary Contact Doctor (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Junaid"
                      value={formCustName}
                      onChange={(e) => setFormCustName(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  {/* Location Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Location / Region
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ajman, UAE"
                      value={formCustLocation}
                      onChange={(e) => setFormCustLocation(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  {/* Modal Action buttons */}
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 font-bold">Loading Quote Builder...</div>}>
      <NewQuoteForm />
    </Suspense>
  );
}
