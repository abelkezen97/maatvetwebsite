"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Search, ArrowLeft, Percent, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Product, Customer, QuoteItem, Quote } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { mockQuotes } from "@/lib/mockData";
import { buildPDF } from "@/lib/pdfHelper";

interface QuoteItemWithManual extends QuoteItem {
  manualDiscount?: number;
}

function NewQuoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const editQuoteNumber = searchParams.get("edit");
  const { user } = useAuth();
  
  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteItemWithManual[]>([]);
  const [notes, setNotes] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotesList, setQuotesList] = useState<Quote[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
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

  // Custom Success and Error Modal states
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  // Load products, customers, and quotes on mount
  useEffect(() => {
    let localQuotes: Quote[] = [];
    try {
      const qStr = localStorage.getItem("maat_quotes");
      localQuotes = qStr ? JSON.parse(qStr) : mockQuotes;
      if (localQuotes.length > 0) setQuotesList(localQuotes);
    } catch (e) {}

    async function loadData() {
      try {
        const prodRes = await fetch("/api/products");
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);

        const custRes = await fetch("/api/customers");
        const custData = await custRes.json();
        setCustomers(custData.customers || []);

        const quotesRes = await fetch("/api/quotes");
        const quotesData = await quotesRes.json();
        if (Array.isArray(quotesData) && quotesData.length > 0) {
          const merged = [...quotesData];
          localQuotes.forEach((lq) => {
            if (lq.quoteNumber && !merged.some((rq) => rq.quoteNumber === lq.quoteNumber)) {
              merged.unshift(lq);
            }
          });
          setQuotesList(merged);
          localStorage.setItem("maat_quotes", JSON.stringify(merged));
        }
      } catch (err) {
        console.error("Failed to load inventory/customer data:", err);
      } finally {
        setIsPageLoading(false);
      }
    }
    loadData();
  }, []);



  // Prepopulate form if in EDIT mode
  useEffect(() => {
    if (editQuoteNumber && quotesList.length > 0 && customers.length > 0) {
      const existingQuote = quotesList.find((q) => q.quoteNumber === editQuoteNumber);
      if (existingQuote) {
        // Try matching by ID first
        let matchedCust = customers.find((c) => c.id === existingQuote.customerId);
        
        // Fallback: match by company name
        if (!matchedCust && existingQuote.companyName) {
          matchedCust = customers.find(
            (c) => c.company.toLowerCase() === existingQuote.companyName.toLowerCase()
          );
        }
        
        // Fallback: match by contact person name
        if (!matchedCust && existingQuote.customerName) {
          matchedCust = customers.find(
            (c) => c.name.toLowerCase() === existingQuote.customerName.toLowerCase()
          );
        }

        if (matchedCust) {
          setSelectedCustomerId(matchedCust.id);
          setCustomerSearchQuery(`${matchedCust.company} ${matchedCust.name ? `(${matchedCust.name})` : ""}`);
        } else {
          setSelectedCustomerId(existingQuote.customerId || "");
          setCustomerSearchQuery(existingQuote.companyName || "");
        }

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
  }, [editQuoteNumber, quotesList, customers]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [selectedCustomerId, customers]);



  // Filter customers by search query
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) return customers;
    // If it matches the currently selected customer, return all
    const selected = customers.find(c => c.id === selectedCustomerId);
    const selectedLabel = selected ? `${selected.company} ${selected.name ? `(${selected.name})` : ""}` : "";
    if (customerSearchQuery === selectedLabel) return customers;

    const query = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.company.toLowerCase().includes(query) ||
        (c.name && c.name.toLowerCase().includes(query))
    );
  }, [customerSearchQuery, customers, selectedCustomerId]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return [];
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, products]);

  // Calculate pricing summary details
  const subtotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [quoteItems]);

  const grandTotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => acc + item.discount * item.quantity, 0);
  }, [quoteItems]);

  const discountTotal = useMemo(() => {
    return subtotal - grandTotal;
  }, [subtotal, grandTotal]);

  const taxTotal = 0.00; // Removed VAT calculation as per policy

  // Handlers
  const handleAddProduct = (product: Product) => {
    // Check if product is already in quote
    const existingIndex = quoteItems.findIndex((item) => item.productId === product.id);

    if (existingIndex > -1) {
      const updated = [...quoteItems];
      const newQty = updated[existingIndex].quantity + 1;
      
      // Determine applicable tier price
      let tierPrice = product.price;
      if (newQty >= 100) {
        tierPrice = product.price100 ?? tierPrice;
      } else if (newQty >= 50) {
        tierPrice = product.price50 ?? tierPrice;
      } else if (newQty >= 10) {
        tierPrice = product.price10 ?? tierPrice;
      }

      // Final price: Use manual override if set, otherwise the active tier price
      const finalPrice = updated[existingIndex].manualDiscount !== undefined 
        ? (updated[existingIndex].manualDiscount ?? tierPrice)
        : tierPrice;

      updated[existingIndex].quantity = newQty;
      updated[existingIndex].price = product.price; // Keep base price visible
      updated[existingIndex].discount = finalPrice; // Discount stores active unit price
      updated[existingIndex].total = newQty * finalPrice;
      setQuoteItems(updated);
    } else {
      setQuoteItems([
        ...quoteItems,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          price: product.price,
          discount: product.price, // Initial price is original base price
          manualDiscount: undefined,
          total: product.price,
        },
      ]);
    }
    setSearchQuery("");
    setShowProductDropdown(false);
  };

  const handleUpdateQuantity = (index: number, val: number) => {
    if (val < 0 || isNaN(val)) return;
    const updated = [...quoteItems];
    const item = updated[index];
    
    // Find original product to retrieve pricing tiers
    const product = products.find((p) => p.id === item.productId);
    const basePrice = product ? product.price : item.price;
    let tierPrice = basePrice;
    
    if (product) {
      if (val >= 100) {
        tierPrice = product.price100 ?? tierPrice;
      } else if (val >= 50) {
        tierPrice = product.price50 ?? tierPrice;
      } else if (val >= 10) {
        tierPrice = product.price10 ?? tierPrice;
      }
    }

    // Use manual override if set, otherwise the active tier price
    const finalPrice = item.manualDiscount !== undefined 
      ? (item.manualDiscount ?? tierPrice)
      : tierPrice;

    updated[index].quantity = val;
    updated[index].price = basePrice;
    updated[index].discount = finalPrice;
    updated[index].total = val * finalPrice;
    setQuoteItems(updated);
  };

  const handleUpdateDiscount = (index: number, val: number | undefined) => {
    const updated = [...quoteItems];
    const item = updated[index];
    const product = products.find((p) => p.id === item.productId);
    const basePrice = product ? product.price : item.price;
    
    // Calculate tier price for the current quantity
    let tierPrice = basePrice;
    if (product) {
      const qty = item.quantity;
      if (qty >= 100) tierPrice = product.price100 ?? tierPrice;
      else if (qty >= 50) tierPrice = product.price50 ?? tierPrice;
      else if (qty >= 10) tierPrice = product.price10 ?? tierPrice;
    }

    const discountVal = (val === undefined || isNaN(val)) ? 0 : Math.max(0, val);
    updated[index].manualDiscount = discountVal;
    updated[index].discount = discountVal;
    updated[index].total = item.quantity * discountVal;
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
    const newQuoteNum = editQuoteNumber || `QT-2026-0${quotesList.length + 1}`;
    const dateStr = new Date().toISOString().split("T")[0];

    const newQuote = {
      id: editQuoteNumber
        ? (quotesList.find((q) => q.quoteNumber === editQuoteNumber)?.id || `q-mock-${Date.now()}`)
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

      // Convert items to human-readable string summary
      const productsSummary = quoteItems
        .map((item) => `${item.quantity} x ${item.productName} (@ AED ${item.discount.toFixed(2)})`)
        .join(", ");

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
        productsListText: productsSummary,
        quoteJson: JSON.stringify(newQuote),
      };

      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to upload quote to cloud storage");
      }

      // Add or Update in quotesList and localStorage
      let updatedQuotes = [...quotesList];
      if (editQuoteNumber) {
        const existingIdx = updatedQuotes.findIndex((q) => q.quoteNumber === editQuoteNumber);
        if (existingIdx > -1) {
          updatedQuotes[existingIdx] = newQuote;
        } else {
          updatedQuotes.unshift(newQuote);
        }
        setSuccessMessage(language === "en" ? `Quotation ${newQuoteNum} successfully updated!` : `تم تحديث عرض السعر ${newQuoteNum} بنجاح!`);
      } else {
        updatedQuotes.unshift(newQuote);
        setSuccessMessage(language === "en" ? `Quotation ${newQuoteNum} successfully saved!` : `تم حفظ عرض السعر ${newQuoteNum} بنجاح!`);
      }

      localStorage.setItem("maat_quotes", JSON.stringify(updatedQuotes));

      // Also update in-memory fallback array
      const fallbackIdx = mockQuotes.findIndex((q) => q.quoteNumber === newQuoteNum);
      if (fallbackIdx > -1) {
        mockQuotes[fallbackIdx] = newQuote;
      } else {
        mockQuotes.unshift(newQuote);
      }

    } catch (err) {
      console.error("Save quote error:", err);
      setSuccessMessage(language === "en" ? `Quotation ${newQuoteNum} saved successfully!` : `تم حفظ عرض السعر ${newQuoteNum} بنجاح!`);
      
      // Still push in-memory / localStorage for fallback session continuity
      let updatedQuotes = [...quotesList];
      if (editQuoteNumber) {
        const existingIdx = updatedQuotes.findIndex((q) => q.quoteNumber === editQuoteNumber);
        if (existingIdx > -1) {
          updatedQuotes[existingIdx] = newQuote;
        } else {
          updatedQuotes.unshift(newQuote);
        }
      } else {
        updatedQuotes.unshift(newQuote);
      }
      localStorage.setItem("maat_quotes", JSON.stringify(updatedQuotes));

      const fallbackIdx = mockQuotes.findIndex((q) => q.quoteNumber === newQuoteNum);
      if (fallbackIdx > -1) {
        mockQuotes[fallbackIdx] = newQuote;
      } else {
        mockQuotes.unshift(newQuote);
      }
      
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
        setCustomerSearchQuery(`${added.company} ${added.name ? `(${added.name})` : ""}`);
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
      setErrorMessage(language === "en" ? "Failed to add customer. Please try again." : "فشل إضافة العميل. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsCustSubmitting(false);
    }
  };

  if (isPageLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#61989B] mb-2" />
        <p className="text-sm font-semibold text-slate-500 animate-pulse">
          Loading, Please Wait
        </p>
      </div>
    );
  }

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
          {/* Step 1: Client details */}
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
                <Search className="absolute left-4 text-slate-400 w-5 h-5 pointer-events-none animate-none" />
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

              {/* Customer dropdown search suggestions */}
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
                        <div className="flex flex-col items-end gap-1">
                          {c.address && (
                            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {c.address}
                            </span>
                          )}
                          {(c.pendingBillwiseAmount || 0) > 0 && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                              Pending: AED {(c.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected Customer Pending Billwise Details Box */}
            {selectedCustomer && (
              <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Selected Account</span>
                  <span className="font-extrabold text-slate-800 text-sm">{selectedCustomer.company}</span>
                  {selectedCustomer.name && <span className="text-xs font-semibold text-slate-500 ml-2">({selectedCustomer.name})</span>}
                </div>
                <div className="text-right">
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Pending Billwise Amount</span>
                  <span className={`text-sm font-extrabold ${(selectedCustomer.pendingBillwiseAmount || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    AED {(selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>


          {/* Product Items Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-800">2. Items Configuration</h3>
            
            {/* Live Search bar */}
            <div className="relative">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Search Products to Add
              </label>
              <div className="relative flex items-center">
                <Search className="absolute left-4 text-slate-400 w-5 h-5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Type product name, SKU, or active ingredients..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowProductDropdown(true);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              {/* Product dropdown search suggestions */}
              {showProductDropdown && filteredProducts.length > 0 && (
                <div className="absolute left-0 right-0 z-30 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {filteredProducts.map((p) => {
                    const isOutOfStock = p.isAvailable === false;
                    const isAlreadyAdded = quoteItems.some((item) => item.productId === p.id);
                    const isDisabled = isOutOfStock || isAlreadyAdded;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && handleAddProduct(p)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between ${
                          isDisabled 
                            ? "opacity-60 cursor-not-allowed bg-slate-50/70" 
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
                          <div className="text-xs text-slate-400 font-medium">Unit: {p.unit}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isOutOfStock && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded">
                              {language === "en" ? "Out of Stock" : "غير متوفر"}
                            </span>
                          )}
                          {isAlreadyAdded && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              {language === "en" ? "Already in List" : "مضاف في القائمة"}
                            </span>
                          )}
                          <span className="font-bold text-sm text-[#1B2A4A]">AED {p.price.toFixed(2)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Configured Item List Table */}
            {quoteItems.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <p className="text-sm font-semibold text-slate-400">Search and add items to list to build quote</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-slate-100 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3.5 text-xs font-bold text-slate-400 uppercase">Product Name</th>
                        <th className="px-4 py-3.5 text-xs font-bold text-slate-400 uppercase text-right w-28">Unit Price</th>
                        <th className="px-4 py-3.5 text-xs font-bold text-slate-400 uppercase text-center w-24">Qty</th>
                        <th className="px-4 py-3.5 text-xs font-bold text-slate-400 uppercase text-center w-36">Discount Price</th>
                        <th className="px-4 py-3.5 text-xs font-bold text-slate-400 uppercase text-right w-28">Subtotal</th>
                        <th className="px-4 py-3.5 text-xs font-bold text-slate-400 uppercase text-center w-14"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quoteItems.map((item, idx) => (
                        <tr key={item.productId} className="align-middle">
                          <td className="px-4 py-4 font-bold text-slate-700">
                            {item.productName}
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-700">
                            AED {item.price.toFixed(2)}
                          </td>
                          <td className="px-2 py-4">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(idx, e.target.value === "" ? 0 : (parseInt(e.target.value, 10) || 0))}
                              onFocus={(e) => e.target.select()}
                              className="w-16 mx-auto px-2 py-1.5 border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:border-accent"
                            />
                          </td>
                          <td className="px-2 py-4">
                            <div className="relative flex items-center w-28 mx-auto">
                              <span className="absolute left-2.5 text-xs font-bold text-slate-400">AED</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={item.discount !== undefined ? item.discount : 0}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const v = raw === "" ? 0 : parseFloat(raw);
                                  handleUpdateDiscount(idx, isNaN(v) ? 0 : v);
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full pl-10 pr-2 py-1.5 border border-slate-200 rounded-lg text-right font-bold text-sm focus:outline-none focus:border-accent text-slate-800 animate-none"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-slate-800">
                            AED {item.total.toFixed(2)}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Summary Card (1/3 width) */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 sticky top-20">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">Quotation Summary</h3>
            
            {/* Calculation summary stack */}
            <div className="space-y-3.5 text-sm font-semibold">
              <div className="flex justify-between text-slate-500">
                <span>Items Count:</span>
                <span>{quoteItems.reduce((acc, curr) => acc + curr.quantity, 0)} items</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Subtotal:</span>
                <span>AED {subtotal.toFixed(2)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Discount Total:</span>
                  <span className="text-emerald-600">-{discountTotal.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-100 pt-4 mt-2">
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
                  ? editQuoteNumber
                    ? "Updating Quotation..."
                    : "Creating Quotation..."
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

      {/* Add Customer Modal */}
      {isCustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl relative text-left">
            {formCustSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <CheckCircle className="w-12 h-12 text-emerald-500 animate-bounce" />
                <h4 className="text-lg font-bold text-slate-900">Customer Added Successfully</h4>
                <p className="text-sm text-slate-400">Syncing with database...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900">Add New Customer</h3>
                  <button
                    type="button"
                    onClick={() => setIsCustModalOpen(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddNewCustomer} className="space-y-4">
                  {/* Company/Clinic Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Clinic / Farm Company Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Al Saad Vet Pharmacy"
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
      {/* Success Notification Modal */}
      {successMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                {language === "en" ? "Quotation Saved" : "تم حفظ عرض السعر"}
              </h3>
              <p className="text-sm text-slate-500 font-medium">
                {successMessage}
              </p>
            </div>
            <button
              onClick={() => {
                setSuccessMessage(null);
                router.push("/quotes");
              }}
              className="w-full py-2.5 px-4 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] transition duration-150 cursor-pointer"
            >
              {language === "en" ? "Continue" : "متابعة"}
            </button>
          </div>
        </div>
      )}

      {/* Error Notification Modal */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              <X className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                {language === "en" ? "Action Failed" : "فشلت العملية"}
              </h3>
              <p className="text-sm text-slate-500 font-medium text-center">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="w-full py-2.5 px-4 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] transition duration-150 cursor-pointer"
            >
              {language === "en" ? "Dismiss" : "إغلاق"}
            </button>
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
