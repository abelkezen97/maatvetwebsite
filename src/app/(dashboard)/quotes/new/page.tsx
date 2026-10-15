"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle, FileText, Search, X } from "lucide-react";
import { CustomerBalanceStrip, CustomerCombobox, FieldRow, FormActionBar, fieldInput } from "@/components/form/EntryForm";
import { SavedDocuments } from "@/components/CustomerAccountPanels";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Product, Customer, QuoteItem, Quote } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { buildPDF } from "@/lib/pdfHelper";
import { currencyFor, decimalsFor } from "@/lib/currency";

interface QuoteItemWithManual extends QuoteItem {
  manualUnitPrice?: number;
  /** List (or quantity-tier) price before any discount. */
  listPrice?: number;
  /** What was typed in the Rate box ("" = list price). */
  rate?: number | string;
  /** Added in this session, so quantity tiers apply. */
  tiered?: boolean;
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

  // Wizard: 0 customer, 1 products, 2 terms, 3 review.
  const [step, setStep] = useState(editQuoteNumber ? 3 : 0);
  const [activeCustomer, setActiveCustomer] = useState(0);
  const [activeProduct, setActiveProduct] = useState(0);
  const [saved, setSaved] = useState<{ title: string; quoteId: string | null; quoteNumber: string } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Map<string, HTMLInputElement>>(new Map());

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
          listPrice: item.price,
          rate: item.discount > 0 ? Math.max(0, item.price - item.discount) : "",
          discountPrice: item.discount > 0 ? Math.max(0, item.price - item.discount) : "",
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
  const currencySymbol = currencyFor(activeCountry);
  const dp = decimalsFor(activeCountry);

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
  // Each line keeps the list price (price) and, when a lower rate is quoted,
  // that rate (discountPrice). The screen shows one "Rate" box.
  const tierPriceFor = (product: Product | undefined, qty: number, fallback: number) => {
    if (!product) return fallback;
    if (qty >= 100 && product.price100) return product.price100;
    if (qty >= 50 && product.price50) return product.price50;
    if (qty >= 10 && product.price10) return product.price10;
    return product.price;
  };

  const lineWith = (item: QuoteItemWithManual, listPrice: number, rateRaw: string | number | undefined, qty: number | string) => {
    const q = Number(qty) || 0;
    const rateStr = rateRaw === undefined || rateRaw === null ? "" : String(rateRaw).trim();
    const rate = rateStr === "" ? listPrice : Math.max(0, Number(rateStr) || 0);
    const price = rate > listPrice ? rate : listPrice;
    const discountPrice = rateStr === "" || rate >= price ? "" : rate;
    return {
      ...item,
      quantity: qty as any,
      price,
      listPrice,
      rate: rateStr === "" ? "" : rateRaw,
      discountPrice,
      manualDiscount: discountPrice,
      discount: Math.max(0, price - rate),
      total: Math.max(0, q * rate),
    } as QuoteItemWithManual;
  };

  const handleAddProduct = (product: Product) => {
    const existingIndex = quoteItems.findIndex((item) => item.productId === product.id);
    if (existingIndex > -1) {
      const item = quoteItems[existingIndex];
      const newQty = (Number(item.quantity) || 0) + 1;
      const list = item.tiered ? tierPriceFor(product, newQty, item.listPrice ?? item.price) : (item.listPrice ?? item.price);
      const updated = [...quoteItems];
      updated[existingIndex] = lineWith(item, list, item.rate, newQty);
      setQuoteItems(updated);
    } else {
      setQuoteItems([
        ...quoteItems,
        lineWith(
          { productId: product.id, productName: product.name, quantity: 1, price: product.price, discount: 0, total: product.price, tiered: true },
          product.price,
          "",
          1
        ),
      ]);
    }
    setSearchQuery("");
    setShowProductDropdown(false);
    setActiveProduct(0);
    setTimeout(() => {
      const el = qtyRefs.current.get(String(product.id));
      el?.focus();
      el?.select();
    }, 30);
  };

  const handleUpdateQuantity = (index: number, val: string) => {
    const item = quoteItems[index];
    const qty = val === "" ? "" : Math.max(0, parseInt(val, 10) || 0);
    const product = products.find((p) => p.id === item.productId);
    const list = item.tiered ? tierPriceFor(product, Number(qty) || 0, item.listPrice ?? item.price) : (item.listPrice ?? item.price);
    const updated = [...quoteItems];
    updated[index] = lineWith(item, list, item.rate, qty);
    setQuoteItems(updated);
  };

  const handleUpdateRate = (index: number, val: string) => {
    const item = quoteItems[index];
    const updated = [...quoteItems];
    updated[index] = lineWith(item, item.listPrice ?? item.price, val, item.quantity);
    setQuoteItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...quoteItems];
    updated.splice(index, 1);
    setQuoteItems(updated);
  };

  const goTo = (s: number) => {
    setStep(s);
    setTimeout(() => {
      topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      if (s === 1) productSearchRef.current?.focus({ preventScroll: true });
    }, 30);
  };

  const pickCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerSearchQuery(`${c.company} ${c.name ? `(${c.name})` : ""}`);
    setTimeout(() => productSearchRef.current?.focus(), 30);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedCustomerId || quoteItems.length === 0 || isSaving) return;

    setIsSaving(true);
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());

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
      setSaved({
        title: `Quotation ${assignedNum} ${editQuoteNumber ? "updated" : "saved"}`,
        quoteId: resData.quotationId || null,
        quoteNumber: assignedNum,
      });
      setTimeout(() => topRef.current?.scrollIntoView({ block: "start" }), 30);
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

  const money = (n: number) =>
    `${currencySymbol} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const unitsTotal = quoteItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const zeroLine = quoteItems.find((it) => !(Number(it.quantity) > 0));
  const blocker = !selectedCustomerId
    ? "Choose a customer"
    : quoteItems.length === 0
      ? "Add at least one item"
      : zeroLine
        ? `Set a quantity for ${zeroLine.productName} or remove it`
        : null;
  const validityFooter = (days: number) => `This is a computer generated quote. Pricing valid for ${days} days.`;
  const validityDays = [7, 15, 30, 60].find((d) => footerText === validityFooter(d));
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const owed = Math.max(0, selectedCustomer?.pendingBillwiseAmount || 0);

  const downloadQuote = async () => {
    if (!saved) return;
    let quote: Quote | null = null;
    if (saved.quoteId) {
      const res = await fetch(`/api/quotes/${saved.quoteId}?t=${Date.now()}`);
      const data = res.ok ? await res.json() : null;
      quote = data?.quote || null;
    }
    if (!quote) {
      const res = await fetch(`/api/quotes?t=${Date.now()}`);
      const list = res.ok ? await res.json() : [];
      quote = Array.isArray(list) ? list.find((q: Quote) => q.quoteNumber === saved.quoteNumber) || null : null;
    }
    if (!quote) {
      setErrorMessage("Could not load the quotation for the PDF. Try again from the quotations list.");
      return;
    }
    buildPDF({ ...quote, footerText }).save(`MAAT-QUOTE-${quote.quoteNumber}.pdf`);
  };

  return (
    <div className="w-full">
      <PageHeader
        title={editQuoteNumber ? `Edit quotation ${editQuoteNumber}` : "New quotation"}
        breadcrumbs={[
          { label: "Quotations", href: "/quotes" },
          { label: editQuoteNumber ? "Edit" : "New" },
        ]}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocker) handleSubmit();
        }}
        className="px-4 sm:px-6 lg:px-8 pt-6 max-w-6xl mx-auto text-start"
      >
        <div ref={topRef} className="scroll-mt-24" />

        {saved ? (
          <SavedDocuments
            title={saved.title}
            customerId={selectedCustomerId}
            extraDownloads={[{ key: "quote", label: `Quotation ${saved.quoteNumber}`, icon: FileText, tone: "bg-sky-50 text-sky-700", onClick: downloadQuote }]}
            extraAction={{ href: `/invoices/new?fromQuote=${encodeURIComponent(saved.quoteNumber)}`, label: "Convert to invoice" }}
            newHref="/quotes/new"
            newLabel="New quotation"
            listHref="/quotes"
            listLabel="Go to quotations"
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
              {/* Header fields */}
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
                    autoFocus={!selectedCustomerId && !editQuoteNumber}
                  />
                  {selectedCustomer && (
                    <CustomerBalanceStrip
                      items={[
                        { label: "Owes", value: money(owed), tone: owed > 0 ? "bad" : "ok" },
                        ...(selectedCustomer.address ? [{ label: "Location", value: selectedCustomer.address }] : []),
                        ...(selectedCustomer.cashOnly ? [{ label: "Status", value: "Cash only", tone: "warn" as const }] : []),
                      ]}
                    />
                  )}
                </FieldRow>

                <FieldRow label="Quotation#">
                  <div className={`${fieldInput} max-w-xs flex items-center bg-slate-50 text-slate-500`}>{editQuoteNumber || "Given on save"}</div>
                </FieldRow>

                <FieldRow label="Quotation date">
                  <div className={`${fieldInput} max-w-xs flex items-center bg-slate-50 text-slate-700`}>{today}</div>
                </FieldRow>

                <FieldRow label="Valid for">
                  <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden" role="radiogroup" aria-label="Valid for">
                    {[7, 15, 30, 60].map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={validityDays === d}
                        onClick={() => setFooterText(validityFooter(d))}
                        className={`h-10 px-4 text-sm transition-colors ${i > 0 ? "border-l border-slate-300" : ""} ${
                          validityDays === d ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {d} days
                      </button>
                    ))}
                  </div>
                </FieldRow>
              </div>

              {/* Item table */}
              <div className="border-t border-slate-200">
                <div className="px-5 md:px-8 pt-5 pb-3">
                  <h2 className="text-sm font-semibold text-slate-900">Item table</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="text-left font-semibold px-5 md:px-8 py-2.5">Item details</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-32">Quantity</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-36">Rate</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-36">Amount</th>
                        <th className="w-12 pr-5 md:pr-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quoteItems.map((item, idx) => {
                        const qty = Number(item.quantity) || 0;
                        const zero = qty <= 0;
                        const list = item.listPrice ?? item.price;
                        const rateNum = Number(item.discountPrice !== "" && item.discountPrice !== undefined ? item.discountPrice : item.price);
                        const off = Math.max(0, list - rateNum);
                        const backToSearch = (e: React.KeyboardEvent) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            productSearchRef.current?.focus();
                          }
                        };
                        return (
                          <tr key={item.productId} className="wiz-in align-top hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 md:px-8 py-3">
                              <div className="text-slate-900 font-medium">{item.productName}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                List {money(list)}
                                {off > 0 && rateNum > 0 && <span className="text-emerald-700"> · {money(off)} off each</span>}
                                {rateNum === 0 && <span className="text-emerald-700"> · free</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                ref={(el) => {
                                  if (el) qtyRefs.current.set(String(item.productId), el);
                                  else qtyRefs.current.delete(String(item.productId));
                                }}
                                type="number"
                                min="0"
                                inputMode="numeric"
                                value={item.quantity ?? ""}
                                onChange={(e) => handleUpdateQuantity(idx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={backToSearch}
                                className={`${fieldInput} h-9 text-right ${zero ? "border-rose-400 bg-rose-50" : ""}`}
                                aria-label={`Quantity of ${item.productName}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                placeholder={list.toFixed(dp)}
                                value={item.rate ?? ""}
                                onChange={(e) => handleUpdateRate(idx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={backToSearch}
                                className={`${fieldInput} h-9 text-right`}
                                aria-label={`Rate of ${item.productName}`}
                              />
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-slate-900 whitespace-nowrap">{(Number(item.total) || 0).toFixed(dp)}</td>
                            <td className="pr-5 md:pr-8 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                aria-label={`Remove ${item.productName}`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* New line: pick an item */}
                      <tr>
                        <td className="px-5 md:px-8 py-3" colSpan={5}>
                          <div className="relative max-w-xl">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <input
                              ref={productSearchRef}
                              type="text"
                              autoFocus={!!editQuoteNumber}
                              placeholder="Type or click to select an item"
                              value={searchQuery}
                              onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowProductDropdown(true);
                                setActiveProduct(0);
                              }}
                              onFocus={() => setShowProductDropdown(true)}
                              onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                              onKeyDown={(e) => {
                                const list = filteredProducts.slice(0, 30);
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setActiveProduct((i) => Math.min(i + 1, list.length - 1));
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setActiveProduct((i) => Math.max(i - 1, 0));
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  const p = list[activeProduct];
                                  if (p && p.isAvailable !== false) handleAddProduct(p);
                                } else if (e.key === "Escape") {
                                  setShowProductDropdown(false);
                                }
                              }}
                              className={`${fieldInput} pl-9 border-dashed`}
                            />
                            {showProductDropdown && searchQuery && (
                              <div className="wiz-in absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-72 overflow-y-auto">
                                {filteredProducts.length === 0 ? (
                                  <div className="px-3 py-3 text-sm text-slate-500">No item matches “{searchQuery}”.</div>
                                ) : (
                                  filteredProducts.slice(0, 30).map((p, i) => {
                                    const off = p.isAvailable === false;
                                    const inList = quoteItems.find((it) => it.productId === p.id);
                                    const on = i === activeProduct && !off;
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        disabled={off}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => !off && handleAddProduct(p)}
                                        onMouseEnter={() => setActiveProduct(i)}
                                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${off ? "opacity-50 cursor-not-allowed" : on ? "bg-accent text-white" : "text-slate-900"}`}
                                      >
                                        <span className="min-w-0">
                                          <span className="block text-sm truncate">{p.name}</span>
                                          <span className={`block text-xs ${on ? "text-white/80" : "text-slate-500"}`}>
                                            {off ? "Not available" : p.unit || ""}
                                            {inList ? ` · ${inList.quantity} on this quotation` : ""}
                                          </span>
                                        </span>
                                        <span className={`text-sm shrink-0 ${on ? "text-white" : "text-slate-700"}`}>{money(p.price)}</span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                          {quoteItems.length === 0 && <p className="text-xs text-slate-500 mt-2">Add the first item. Press Enter to add, type the quantity, then Enter again for the next item.</p>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Notes and totals */}
                <div className="px-5 md:px-8 py-5 flex flex-col md:flex-row gap-6 md:justify-between border-t border-slate-200">
                  <div className="w-full md:max-w-md space-y-4">
                    <label className="block">
                      <span className="block text-sm text-slate-600 mb-1.5">Customer notes</span>
                      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${fieldInput} h-auto py-2`} placeholder="e.g. Delivery within 2 days of confirmation" />
                    </label>
                    <label className="block">
                      <span className="block text-sm text-slate-600 mb-1.5">Terms &amp; conditions</span>
                      <textarea rows={2} value={footerText} onChange={(e) => setFooterText(e.target.value)} className={`${fieldInput} h-auto py-2`} />
                      <span className="block text-xs text-slate-500 mt-1">Printed at the bottom of the PDF.</span>
                    </label>
                  </div>
                  <dl className="w-full md:w-80 bg-slate-50 rounded-md border border-slate-200 p-4 text-sm space-y-2 self-start">
                    <div className="flex justify-between text-slate-600">
                      <dt>Sub total</dt>
                      <dd className="font-medium text-slate-900">{money(subtotal)}</dd>
                    </div>
                    {discountTotal > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <dt>Discount</dt>
                        <dd className="font-medium">−{money(discountTotal)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500 text-xs">
                      <dt>Items</dt>
                      <dd>
                        {quoteItems.length} lines · {unitsTotal} units
                      </dd>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                      <dt className="font-semibold text-slate-900">Total ({currencySymbol})</dt>
                      <dd key={grandTotal} className="wiz-in font-semibold text-slate-900">{grandTotal.toFixed(dp)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            <FormActionBar
              saveLabel={editQuoteNumber ? "Save changes" : "Save quotation"}
              saving={isSaving}
              disabled={!!blocker}
              cancelHref="/quotes"
              hint={blocker}
              total={quoteItems.length > 0 ? money(grandTotal) : undefined}
            />
          </>
        )}
      </form>

      {/* Add Customer Modal */}
      {isCustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl relative text-left">
            {formCustSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <CheckCircle className="wiz-pop w-12 h-12 text-emerald-500" />
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
