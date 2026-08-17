"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Search, ArrowLeft, Percent, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Product, Customer, QuoteItem, Quote } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { buildPDF } from "@/lib/pdfHelper";

interface QuoteItemWithManual extends QuoteItem {
  manualUnitPrice?: number;
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
  const [footerText, setFooterText] = useState<string>("This is a computer generated quote. Pricing valid for 30 days.");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotesList, setQuotesList] = useState<Quote[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // Form & Option states
  const [showBasePrice, setShowBasePrice] = useState(true);
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
    async function loadData() {
      try {
        const [prodRes, custRes, quotesRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/customers"),
          fetch("/api/quotes"),
        ]);

        const prodData = await prodRes.json();
        setProducts(prodData.products || []);

        const custData = await custRes.json();
        setCustomers(custData.customers || (Array.isArray(custData) ? custData : []));

        const quotesData = await quotesRes.json();
        if (Array.isArray(quotesData)) {
          setQuotesList(quotesData);
        }
      } catch (err) {
        console.error("Failed to load inventory/customer data from Supabase:", err);
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

        if (existingQuote.showBasePrice !== undefined) {
          setShowBasePrice(existingQuote.showBasePrice);
        }

        setNotes(existingQuote.notes || "");
        if (existingQuote.footerText !== undefined) {
          setFooterText(existingQuote.footerText);
        }
        
        // Map QuoteItems to form state
        const mappedItems = existingQuote.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price, // Unit price
          discount: item.discount, // Explicit discount per unit
          total: item.total, // Line total: quantity * (price - discount)
        }));
        setQuoteItems(mappedItems);
      }
    }
  }, [editQuoteNumber, quotesList, customers]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [selectedCustomerId, customers]);

  const activeCountry = selectedCustomer?.country || user?.country || "UAE";
  const currencySymbol = activeCountry === "Oman" ? "OMR" : "AED";

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
  // subtotal = sum of (quantity * unit_price) before explicit discount
  const subtotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const p = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);
      return acc + Math.max(0, q) * Math.max(0, p);
    }, 0);
  }, [quoteItems]);

  // discountTotal = sum of (quantity * discount_per_unit)
  const discountTotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const d = typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0);
      return acc + Math.max(0, q) * Math.max(0, d);
    }, 0);
  }, [quoteItems]);

  // UAE VAT Rule: VAT is NOT applicable to UAE quotations (0.00). Oman preserves existing 0.00 rule.
  const taxTotal = 0.00;

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discountTotal + taxTotal);
  }, [subtotal, discountTotal, taxTotal]);

  // Handlers
  const handleAddProduct = (product: Product) => {
    const existingIndex = quoteItems.findIndex((item) => item.productId === product.id);

    if (existingIndex > -1) {
      const updated = [...quoteItems];
      const newQty = (Number(updated[existingIndex].quantity) || 0) + 1;
      
      let tierPrice = product.price;
      if (newQty >= 100) {
        tierPrice = product.price100 ?? tierPrice;
      } else if (newQty >= 50) {
        tierPrice = product.price50 ?? tierPrice;
      } else if (newQty >= 10) {
        tierPrice = product.price10 ?? tierPrice;
      }

      updated[existingIndex].quantity = newQty;
      updated[existingIndex].price = tierPrice;

      const rawDiscPrice = updated[existingIndex].discountPrice ?? updated[existingIndex].manualDiscount;
      const effective = (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "")
        ? Math.min(tierPrice, Math.max(0, Number(rawDiscPrice)))
        : tierPrice;

      updated[existingIndex].discount = Math.max(0, tierPrice - effective);
      updated[existingIndex].total = newQty * effective;
      setQuoteItems(updated);
    } else {
      setQuoteItems([
        ...quoteItems,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          price: product.price,
          discount: 0,
          discountPrice: "",
          manualDiscount: "",
          total: product.price,
        },
      ]);
    }
    setSearchQuery("");
    setShowProductDropdown(false);
  };

  const handleUpdateQuantity = (index: number, val: number | string) => {
    const updated = [...quoteItems];
    const item = updated[index];
    const product = products.find((p) => p.id === item.productId);
    const basePrice = product ? product.price : item.price;

    const numQty = typeof val === "number" ? val : (parseInt(val as any, 10) || 0);
    let tierPrice = basePrice;
    if (product && numQty > 0) {
      if (numQty >= 100) tierPrice = product.price100 ?? tierPrice;
      else if (numQty >= 50) tierPrice = product.price50 ?? tierPrice;
      else if (numQty >= 10) tierPrice = product.price10 ?? tierPrice;
    }

    updated[index].quantity = val as any;
    updated[index].price = tierPrice;

    const rawDiscPrice = item.discountPrice ?? item.manualDiscount;
    const effective = (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "")
      ? Math.min(tierPrice, Math.max(0, Number(rawDiscPrice)))
      : tierPrice;

    updated[index].discount = Math.max(0, tierPrice - effective);
    updated[index].total = numQty * effective;
    setQuoteItems(updated);
  };

  const handleUpdateDiscount = (index: number, val: number | string | undefined) => {
    const updated = [...quoteItems];
    const item = updated[index];
    const numQty = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);

    const valStr = val !== undefined && val !== null ? String(val).trim() : "";
    if (valStr === "") {
      updated[index].discountPrice = "";
      updated[index].manualDiscount = "";
      updated[index].discount = 0;
      updated[index].total = numQty * item.price;
    } else {
      const discPriceNum = parseFloat(valStr);
      if (!isNaN(discPriceNum)) {
        if (discPriceNum > item.price) {
          setErrorMessage(`Discount Price (${currencySymbol} ${discPriceNum.toFixed(2)}) cannot be greater than Unit Price (${currencySymbol} ${item.price.toFixed(2)})`);
        } else {
          setErrorMessage(null);
        }
        const validPrice = Math.max(0, discPriceNum);
        const effective = Math.min(item.price, validPrice);
        updated[index].discountPrice = val as any;
        updated[index].manualDiscount = val as any;
        updated[index].discount = Math.max(0, item.price - effective);
        updated[index].total = numQty * effective;
      }
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
    const dateStr = new Date().toISOString().split("T")[0];

    const quotePayload = {
      quoteNumber: editQuoteNumber || undefined,
      customerId: selectedCustomerId,
      salesmanId: user?.id || "user-salesman",
      date: dateStr,
      items: quoteItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0),
        price: typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0),
        discount: typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0),
        total: typeof item.total === "number" ? item.total : (parseFloat(item.total as any) || 0),
      })),
      subtotal,
      discountTotal,
      taxTotal: 0,
      grandTotal,
      status: "Draft",
      notes,
    };

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotePayload),
      });

      const resData = await response.json();

      if (!response.ok || resData.error) {
        throw new Error(resData.error || "Failed to save quotation to Supabase");
      }

      const assignedNum = resData.quotationNumber || editQuoteNumber || "Quotation";
      setSuccessMessage(
        language === "en"
          ? `Quotation ${assignedNum} successfully saved!`
          : `تم حفظ عرض السعر ${assignedNum} بنجاح!`
      );
    } catch (err: any) {
      console.error("Save quote error:", err);
      setErrorMessage(err.message || "Failed to save quotation");
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-800">2. Items Configuration</h3>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition w-fit">
                <input
                  type="checkbox"
                  checked={showBasePrice}
                  onChange={(e) => setShowBasePrice(e.target.checked)}
                  className="w-4 h-4 rounded text-[#61989B] focus:ring-accent border-slate-300 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-700">
                  {language === "en" ? "Show Base Price Column" : "إظهار عمود السعر الأساسي"}
                </span>
              </label>
            </div>
            
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
                            {currencySymbol} {item.price.toFixed(2)}
                          </td>
                          <td className="px-2 py-4">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={item.quantity !== undefined && item.quantity !== null ? item.quantity : ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  handleUpdateQuantity(idx, "");
                                } else {
                                  const parsed = parseInt(raw, 10);
                                  handleUpdateQuantity(idx, isNaN(parsed) ? "" : Math.max(0, parsed));
                                }
                              }}
                              onFocus={(e) => e.target.select()}
                              className="w-16 mx-auto px-2 py-1.5 border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:border-accent"
                            />
                          </td>
                          <td className="px-2 py-4">
                            <div className="relative flex flex-col items-center w-32 mx-auto">
                              <div className="relative flex items-center w-full">
                                <span className="absolute left-2.5 text-xs font-bold text-slate-400">{currencySymbol}</span>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.price}
                                  step="any"
                                  inputMode="decimal"
                                  placeholder="Optional"
                                  value={item.discountPrice !== undefined && item.discountPrice !== null ? item.discountPrice : item.manualDiscount !== undefined ? item.manualDiscount : ""}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "") {
                                      handleUpdateDiscount(idx, "");
                                    } else {
                                      const parsed = parseFloat(raw);
                                      handleUpdateDiscount(idx, isNaN(parsed) ? "" : parsed);
                                    }
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  className={`w-full pl-10 pr-2 py-1.5 border rounded-lg text-right font-bold text-sm focus:outline-none transition ${
                                    (item.discountPrice !== undefined && item.discountPrice !== "" && Number(item.discountPrice) > item.price) ||
                                    (item.manualDiscount !== undefined && item.manualDiscount !== "" && Number(item.manualDiscount) > item.price)
                                      ? "border-rose-500 bg-rose-50 text-rose-800"
                                      : "border-slate-200 text-slate-800 focus:border-accent"
                                  }`}
                                />
                              </div>
                              {item.discount > 0 && (
                                <span className="text-[10px] font-bold text-emerald-600 mt-1">
                                  Disc: {currencySymbol} {item.discount.toFixed(2)}/unit
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-slate-800">
                            {currencySymbol} {item.total.toFixed(2)}
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
                <span>{quoteItems.reduce((acc, curr) => acc + (typeof curr.quantity === "number" ? curr.quantity : 0), 0)} items</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Subtotal:</span>
                <span>{currencySymbol} {subtotal.toFixed(2)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Discount Total:</span>
                  <span className="text-emerald-600">-{currencySymbol} {discountTotal.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-100 pt-4 mt-2">
                <span>Grand Total:</span>
                <span>{currencySymbol} {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Remarks / Delivery instructions */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                Special Remarks / Delivery Notes
              </label>
              <textarea
                rows={2}
                placeholder="e.g. deliver before 10 AM, check calcium batch..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>

            {/* Quotation Footer / Terms */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                Quotation Footer / Terms & Conditions
              </label>
              <textarea
                rows={2}
                placeholder="e.g. This is a computer generated quote. Pricing valid for 30 days."
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
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
