"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  FileText,
  Hash,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Avatar, ReviewSection, StepPanel, WizardBar, WizardStep, WizardStepper } from "@/components/wizard/WizardUI";
import { AccountSnapshot, SavedDocuments } from "@/components/CustomerAccountPanels";
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
    goTo(1);
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
        goTo(1);
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
  const productsBlocker = quoteItems.length === 0 ? "Add at least one product" : zeroLine ? `Set a quantity for ${zeroLine.productName} or remove it` : null;
  const maxStep = !selectedCustomerId ? 0 : productsBlocker ? 1 : 3;
  const STEPS: WizardStep[] = [
    { label: "Customer", icon: Users },
    { label: "Products", icon: Package },
    { label: "Terms", icon: MessageSquare },
    { label: "Review", icon: ClipboardCheck },
  ];
  const stepHint = step === 0 ? "Choose a customer" : step === 1 ? productsBlocker : null;
  const validityFooter = (days: number) => `This is a computer generated quote. Pricing valid for ${days} days.`;
  const validityDays = [7, 15, 30, 60].find((d) => footerText === validityFooter(d));

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

  const input =
    "w-full px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";
  const label = "block text-sm font-medium text-slate-700 mb-1.5";

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
          if (step < 3) {
            if (step < maxStep) goTo(step + 1);
          } else {
            handleSubmit();
          }
        }}
        className="px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 pb-4 max-w-5xl mx-auto text-start"
      >
        <div ref={topRef} className="scroll-mt-24" />

        {saved && (
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
                title="Who is this quotation for?"
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
                    <button type="button" onClick={() => setIsCustModalOpen(true)} className="mt-2 text-sm font-semibold text-accent hover:underline">
                      Add a new customer
                    </button>
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

            {/* STEP 2: PRODUCTS */}
            {step === 1 && (
              <StepPanel
                stepKey="products"
                icon={Package}
                title="What are you quoting?"
                subtitle={selectedCustomer ? <>for <span className="font-medium text-slate-700">{selectedCustomer.company}</span></> : undefined}
              >
                <div className="relative mb-5">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                  <input
                    ref={productSearchRef}
                    type="text"
                    placeholder="Search product name or code, then press Enter"
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
                    className={`${input} pl-12 py-3.5 text-base`}
                  />
                  {showProductDropdown && searchQuery && (
                    <div className="wiz-in absolute left-0 right-0 z-30 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl shadow-slate-900/10 max-h-80 overflow-y-auto p-1.5">
                      {filteredProducts.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-slate-500">No product matches “{searchQuery}”.</div>
                      ) : (
                        filteredProducts.slice(0, 30).map((p, i) => {
                          const off = p.isAvailable === false;
                          const inList = quoteItems.find((it) => it.productId === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={off}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => !off && handleAddProduct(p)}
                              onMouseEnter={() => setActiveProduct(i)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 ${
                                off ? "opacity-50 cursor-not-allowed" : i === activeProduct ? "bg-slate-100" : ""
                              }`}
                            >
                              <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0">
                                <Package className="w-4 h-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                                <div className="text-xs text-slate-500">
                                  {off ? "Not available" : p.unit || ""}
                                  {inList ? ` · ${inList.quantity} on this quotation` : ""}
                                </div>
                              </div>
                              <span className="text-sm font-semibold text-slate-800 shrink-0">{money(p.price)}</span>
                              {!off && <Plus className="w-4 h-4 text-accent shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {quoteItems.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                    <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600">No products yet</p>
                    <p className="text-xs text-slate-400 mt-1">Search above and press Enter to add.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
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
                        <li
                          key={item.productId}
                          className={`wiz-in rounded-xl border p-4 transition ${zero ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="w-10 h-10 rounded-lg bg-accent-light text-accent grid place-items-center shrink-0">
                              <Package className="w-5 h-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-900">{item.productName}</div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-[11px] text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">List {money(list)}</span>
                                {off > 0 && rateNum > 0 && <span className="text-[11px] text-emerald-800 bg-emerald-50 rounded-full px-2 py-0.5">{money(off)} off each</span>}
                                {rateNum === 0 && <span className="text-[11px] text-emerald-800 bg-emerald-50 rounded-full px-2 py-0.5">Free</span>}
                                {zero && <span className="text-[11px] text-rose-800 bg-rose-100 rounded-full px-2 py-0.5">Quantity is 0</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-2 -m-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              aria-label={`Remove ${item.productName}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-[auto_auto_1fr] gap-3 sm:gap-5 items-end">
                            <div>
                              <span className="block text-xs text-slate-500 mb-1.5">Quantity</span>
                              <div className={`inline-flex items-center rounded-xl border bg-white ${zero ? "border-rose-300" : "border-slate-200"}`}>
                                <button type="button" onClick={() => handleUpdateQuantity(idx, String(Math.max(0, qty - 1)))} className="w-11 h-11 grid place-items-center text-slate-600 hover:bg-slate-100 rounded-l-xl transition" aria-label="One less">
                                  <Minus className="w-4 h-4" />
                                </button>
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
                                  className="w-14 h-11 text-center text-base font-semibold text-slate-900 border-x border-slate-200 focus:outline-none"
                                  aria-label={`Quantity of ${item.productName}`}
                                />
                                <button type="button" onClick={() => handleUpdateQuantity(idx, String(qty + 1))} className="w-11 h-11 grid place-items-center text-slate-600 hover:bg-slate-100 rounded-r-xl transition" aria-label="One more">
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <label className="block">
                              <span className="block text-xs text-slate-500 mb-1.5">Rate ({currencySymbol})</span>
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
                                className={`${input} w-full sm:w-32 h-11 py-0 text-right font-semibold`}
                              />
                            </label>
                            <div className="col-span-2 sm:col-span-1 text-right">
                              <span className="block text-xs text-slate-500 mb-1">Amount</span>
                              <span className="text-lg font-semibold text-slate-900">{money(item.total)}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {quoteItems.length > 0 && <p className="text-xs text-slate-400 mt-4">Leave Rate empty to quote the list price. Enter 0 for a free unit.</p>}
              </StepPanel>
            )}

            {/* STEP 3: TERMS */}
            {step === 2 && (
              <StepPanel stepKey="terms" icon={MessageSquare} title="Notes and terms" subtitle="Both are optional. The terms print at the bottom of the PDF.">
                <span className={label}>Prices valid for</span>
                <div className="flex flex-wrap gap-2 mb-5">
                  {[7, 15, 30, 60].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setFooterText(validityFooter(d))}
                      className={`flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-xl text-sm font-semibold border-2 transition ${
                        validityDays === d ? "border-accent bg-accent-light/60 text-accent" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <Calendar className="w-4 h-4" /> {d} days
                    </button>
                  ))}
                </div>
                <label className="block mb-6">
                  <span className={label}>Terms printed on the quotation</span>
                  <textarea rows={2} value={footerText} onChange={(e) => setFooterText(e.target.value)} className={input} />
                </label>
                <label className="block">
                  <span className={label}>
                    Note <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} placeholder="e.g. Delivery within 2 days of confirmation" />
                </label>
              </StepPanel>
            )}

            {/* STEP 4: REVIEW */}
            {step === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
                <div className="space-y-5 min-w-0">
                  <ReviewSection icon={User} title="Customer" onEdit={() => goTo(0)}>
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

                  <ReviewSection icon={Package} title={`Products · ${quoteItems.length} ${quoteItems.length === 1 ? "line" : "lines"}, ${unitsTotal} units`} onEdit={() => goTo(1)} delay={60}>
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm min-w-[420px]">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="text-left font-medium pb-2.5 px-1">Product</th>
                            <th className="text-right font-medium pb-2.5 px-1 w-14">Qty</th>
                            <th className="text-right font-medium pb-2.5 px-1 w-24">Rate</th>
                            <th className="text-right font-medium pb-2.5 px-1 w-28">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {quoteItems.map((item) => {
                            const rateNum = Number(item.discountPrice !== "" && item.discountPrice !== undefined ? item.discountPrice : item.price);
                            return (
                              <tr key={item.productId}>
                                <td className="py-3 px-1 text-slate-900">{item.productName}</td>
                                <td className="py-3 px-1 text-right text-slate-700">{item.quantity}</td>
                                <td className="py-3 px-1 text-right text-slate-700">{rateNum.toFixed(dp)}</td>
                                <td className="py-3 px-1 text-right font-medium text-slate-900">{(Number(item.total) || 0).toFixed(dp)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </ReviewSection>

                  <ReviewSection icon={MessageSquare} title="Notes and terms" onEdit={() => goTo(2)} delay={120}>
                    {notes ? <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 mb-2">{notes}</p> : <p className="text-sm text-slate-400 mb-2">No note.</p>}
                    <p className="text-sm text-slate-500">{footerText || "No terms."}</p>
                  </ReviewSection>
                </div>

                <div className="space-y-5 lg:sticky lg:top-6">
                  <section className="wiz-in rounded-2xl overflow-hidden shadow-lg shadow-primary/10" style={{ animationDelay: "80ms" }}>
                    <div className="bg-gradient-to-br from-primary to-accent text-white px-6 py-6">
                      <div className="text-xs uppercase tracking-wide text-white/70">Quotation total</div>
                      <div className="text-3xl font-semibold mt-1">{money(grandTotal)}</div>
                      <div className="text-sm text-white/80 mt-1">
                        {unitsTotal} units{validityDays ? ` · valid ${validityDays} days` : ""}
                      </div>
                    </div>
                    <dl className="bg-white border-x border-b border-slate-200 rounded-b-2xl px-6 py-4 space-y-2 text-sm">
                      {discountTotal > 0 && (
                        <>
                          <div className="flex justify-between text-slate-500">
                            <dt>At list price</dt>
                            <dd>{money(subtotal)}</dd>
                          </div>
                          <div className="flex justify-between text-emerald-700">
                            <dt>Discount</dt>
                            <dd>−{money(discountTotal)}</dd>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between items-center text-slate-500">
                        <dt className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5" /> Quotation no.
                        </dt>
                        <dd className="font-semibold text-slate-900">{editQuoteNumber || "Given on save"}</dd>
                      </div>
                    </dl>
                  </section>

                  {selectedCustomerId && <AccountSnapshot customerId={selectedCustomerId} />}
                </div>
              </div>
            )}

            <WizardBar
              step={step}
              onBack={() => goTo(step - 1)}
              cancelHref="/quotes"
              summaryLabel={step >= 1 && quoteItems.length > 0 ? `${unitsTotal} units` : undefined}
              summaryValue={step >= 1 && quoteItems.length > 0 ? money(grandTotal) : undefined}
              next={
                step < 3
                  ? { label: step === 2 ? "Review" : "Next", disabled: step >= maxStep, onClick: () => goTo(step + 1), hint: stepHint }
                  : { label: isSaving ? "Saving…" : editQuoteNumber ? "Save changes" : "Save quotation", disabled: isSaving || maxStep < 3, submit: true, tone: "accent" }
              }
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
