"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Search, ArrowLeft, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Product, Customer, QuoteItem, Quote, Invoice, Receipt } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { mockQuotes, mockInvoices } from "@/lib/mockData";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";

interface InvoiceItemWithManual extends QuoteItem {
  manualDiscount?: number | string;
  discountPrice?: number | string;
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const editInvoiceNumber = searchParams.get("edit");
  const fromQuoteNumber = searchParams.get("fromQuote");
  const { user, profile } = useAuth();
  
  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isCustomInvoiceNumber, setIsCustomInvoiceNumber] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemWithManual[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"Paid" | "Credit">("Paid");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Bank Transfer" | "Cheque" | "Other">("Cash");
  const [creditDays, setCreditDays] = useState<number | string>(30);
  
  // Data loading states
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotesList, setQuotesList] = useState<Quote[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, { uae: number; oman: number; total: number }>>(new Map());
  
  // UI states
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // New Customer inline modal states
  const [isCustModalOpen, setIsCustModalOpen] = useState(false);
  const [formCustCompany, setFormCustCompany] = useState("");
  const [formCustName, setFormCustName] = useState("");
  const [formCustLocation, setFormCustLocation] = useState("");
  const [isCustSubmitting, setIsCustSubmitting] = useState(false);
  const [formCustSuccess, setFormCustSuccess] = useState(false);

  // Success and Error Modal states
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  // Load products, customers, quotes and existing invoices on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, custRes, quotesRes, invsRes, invenRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/customers"),
          fetch("/api/quotes"),
          fetch("/api/invoices"),
          fetch("/api/inventory"),
        ]);

        const prodData = await prodRes.json();
        const custData = await custRes.json();
        const quotesData = await quotesRes.json();
        const invsData = await invsRes.json();

        if (prodData.products) {
          setProducts(prodData.products);
        }

        if (custData.customers) {
          setCustomers(custData.customers);
        }

        if (Array.isArray(quotesData)) {
          setQuotesList(quotesData);
        }

        if (Array.isArray(invsData)) {
          const parsedInvoices = invsData.map((item: any) => {
            if (item && Array.isArray(item.items)) {
              return item;
            }
            if (item.invoiceJson) {
              try {
                return JSON.parse(item.invoiceJson);
              } catch (e) {}
            }
            return {
              id: item.id || item.invoiceNumber || `inv-${Date.now()}`,
              invoiceNumber: item.invoiceNumber || "",
              customerId: item.customerId || "",
              customerName: item.customerName || "",
              companyName: item.companyName || "",
              salesmanName: item.salesmanName || "",
              date: item.date || "",
              grandTotal: parseFloat(item.grandTotal) || 0,
              status: item.status || "Paid",
              items: item.items || [],
              subtotal: parseFloat(item.subtotal ?? item.grandTotal) || 0,
              discountTotal: parseFloat(item.discountTotal) || 0,
              taxTotal: parseFloat(item.taxTotal) || 0,
            };
          });

          setInvoicesList(parsedInvoices);
        }

        if (invenRes.ok) {
          const invenData = await invenRes.json();
          const map = new Map<string, { uae: number; oman: number; total: number }>();
          (invenData.summaries || []).forEach((s: any) => {
            map.set(String(s.productId), { uae: s.uaeStock, oman: s.omanStock, total: s.totalStock });
          });
          setStockMap(map);
        }
      } catch (err) {
        console.error("Failed to load setup data:", err);
      } finally {
        setIsPageLoading(false);
      }
    }

    loadData();
  }, []);

  const computeNextInvoiceNumber = (list: Invoice[]) => {
    const dateSuffix = new Date().getFullYear();
    let maxSeq = 0;
    (list || []).forEach((inv) => {
      if (!inv.invoiceNumber) return;
      const match = inv.invoiceNumber.match(/INV-\d{4}-(\d+)/) || inv.invoiceNumber.match(/(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    });
    return `INV-${dateSuffix}-${String(maxSeq + 1).padStart(6, "0")}`;
  };

  // Set default / prepopulated states once databases load
  useEffect(() => {
    if (isPageLoading) return;

    // Mode A: EDIT EXISTING INVOICE
    if (editInvoiceNumber && invoicesList.length > 0) {
      const existing = invoicesList.find((i) => i.invoiceNumber === editInvoiceNumber);
      if (existing) {
        setInvoiceNumber(existing.invoiceNumber);
        setSelectedCustomerId(existing.customerId);
        setStatus(existing.status);
        setCreditDays(existing.creditDays || 30);
        setNotes(existing.notes || "");
        
        // Find matching customer to set labels
        const cust = customers.find((c) => c.id === existing.customerId);
        if (cust) {
          setCustomerSearchQuery(`${cust.company} ${cust.name ? `(${cust.name})` : ""}`);
        } else {
          setCustomerSearchQuery(existing.companyName);
        }

        setInvoiceItems(existing.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          total: item.total,
          manualDiscount: item.discount < item.price ? item.discount : undefined,
        })));
      }
    }
    // Mode B: CONVERT FROM QUOTE
    else if (fromQuoteNumber && quotesList.length > 0) {
      const quote = quotesList.find((q) => q.quoteNumber === fromQuoteNumber);
      if (quote) {
        if (!isCustomInvoiceNumber) {
          setInvoiceNumber(computeNextInvoiceNumber(invoicesList));
        }

        setSelectedCustomerId(quote.customerId);
        setStatus("Paid");
        setCreditDays(30);
        setNotes(quote.notes || "");

        const cust = customers.find((c) => c.id === quote.customerId);
        if (cust) {
          setCustomerSearchQuery(`${cust.company} ${cust.name ? `(${cust.name})` : ""}`);
        } else {
          setCustomerSearchQuery(quote.companyName);
        }

        setInvoiceItems(quote.items.map(item => {
          const unitPrice = Number(item.price) || 0;
          const discPerUnit = Number(item.discount) || 0;
          const effectivePrice = item.discountPrice !== undefined && item.discountPrice !== null && String(item.discountPrice).trim() !== ""
            ? Number(item.discountPrice)
            : Math.max(0, unitPrice - discPerUnit);
          const discPriceVal = (item.discountPrice !== undefined && item.discountPrice !== null && String(item.discountPrice).trim() !== "")
            ? item.discountPrice
            : (discPerUnit > 0 ? effectivePrice : "");

          return {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: unitPrice,
            discount: Math.max(0, unitPrice - effectivePrice),
            discountPrice: discPriceVal,
            manualDiscount: discPriceVal,
            total: (Number(item.quantity) || 0) * effectivePrice,
          };
        }));
      }
    }
    // Mode C: NEW INVOICE FROM SCRATCH
    else if (!editInvoiceNumber && !isCustomInvoiceNumber) {
      setInvoiceNumber(computeNextInvoiceNumber(invoicesList));
    }
  }, [editInvoiceNumber, fromQuoteNumber, quotesList, invoicesList, customers, isPageLoading, isCustomInvoiceNumber]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [selectedCustomerId, customers]);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) return customers;
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

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return [];
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, products]);

  // Calculations
  // Calculations
  const subtotal = useMemo(() => {
    return invoiceItems.reduce((acc, item) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const p = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);
      return acc + p * q;
    }, 0);
  }, [invoiceItems]);

  const discountTotal = useMemo(() => {
    return invoiceItems.reduce((acc, item) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const d = typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0);
      return acc + Math.max(0, d) * q;
    }, 0);
  }, [invoiceItems]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discountTotal);
  }, [subtotal, discountTotal]);

  const taxTotal = 0.00;

  // Handlers
  const handleAddProduct = (product: Product) => {
    const existingIndex = invoiceItems.findIndex((item) => item.productId === product.id);

    if (existingIndex > -1) {
      const updated = [...invoiceItems];
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
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([
        ...invoiceItems,
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

  const handleUpdateUnitPrice = (index: number, val: number | string) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const numQty = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);

    const newUnitPrice = typeof val === "number" ? val : (val === "" ? 0 : parseFloat(val) || 0);
    updated[index].price = val as any;

    const rawDiscPrice = item.discountPrice ?? item.manualDiscount;
    let discountVal = typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0);

    if (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "") {
      const discPriceNum = parseFloat(String(rawDiscPrice));
      if (!isNaN(discPriceNum)) {
        const effective = Math.min(newUnitPrice, Math.max(0, discPriceNum));
        discountVal = Math.max(0, newUnitPrice - effective);
      }
    } else {
      discountVal = Math.min(newUnitPrice, Math.max(0, discountVal));
    }

    updated[index].discount = discountVal;
    const effectiveUnitPrice = Math.max(0, newUnitPrice - discountVal);
    updated[index].total = Math.max(0, numQty * effectiveUnitPrice);
    setInvoiceItems(updated);
  };

  const handleUpdateQuantity = (index: number, val: number | string) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const numQty = typeof val === "number" ? val : (parseInt(val as any, 10) || 0);
    const unitPrice = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);

    updated[index].quantity = val as any;

    const rawDiscPrice = item.discountPrice ?? item.manualDiscount;
    let discountVal = typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0);

    if (rawDiscPrice !== undefined && rawDiscPrice !== null && String(rawDiscPrice).trim() !== "") {
      const discPriceNum = parseFloat(String(rawDiscPrice));
      if (!isNaN(discPriceNum)) {
        const effective = Math.min(unitPrice, Math.max(0, discPriceNum));
        discountVal = Math.max(0, unitPrice - effective);
      }
    } else {
      discountVal = Math.min(unitPrice, Math.max(0, discountVal));
    }

    updated[index].discount = discountVal;
    const effective = Math.max(0, unitPrice - discountVal);
    updated[index].total = Math.max(0, numQty * effective);
    setInvoiceItems(updated);
  };

  const handleUpdateDiscount = (index: number, val: number | string | undefined) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const numQty = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
    const unitPrice = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);

    const valStr = val !== undefined && val !== null ? String(val).trim() : "";
    if (valStr === "") {
      updated[index].discountPrice = "";
      updated[index].manualDiscount = "";
      updated[index].discount = 0;
      updated[index].total = Math.max(0, numQty * unitPrice);
    } else {
      const discPriceNum = parseFloat(valStr);
      if (!isNaN(discPriceNum)) {
        if (discPriceNum > unitPrice) {
          setErrorMessage(`Discount Price (AED ${discPriceNum.toFixed(2)}) cannot be greater than Unit Price (AED ${unitPrice.toFixed(2)})`);
        } else {
          setErrorMessage(null);
        }
        const validPrice = Math.max(0, discPriceNum);
        const effective = Math.min(unitPrice, validPrice);
        updated[index].discountPrice = val as any;
        updated[index].manualDiscount = val as any;
        updated[index].discount = Math.max(0, unitPrice - effective);
        updated[index].total = Math.max(0, numQty * effective);
      }
    }
    setInvoiceItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...invoiceItems];
    updated.splice(index, 1);
    setInvoiceItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || invoiceItems.length === 0 || isSaving) return;

    // Validate available stock before posting invoice
    const targetCountry = selectedCustomer?.country || user?.country || "UAE";
    for (const item of invoiceItems) {
      if (item.productId) {
        const stocks = stockMap.get(String(item.productId));
        const available = targetCountry === "Oman" ? (stocks?.oman ?? 0) : (stocks?.uae ?? 0);
        const requested = Number(item.quantity) || 0;
        if (requested > available) {
          setErrorMessage(`Insufficient stock for ${item.productName}. Available quantity: ${available}.`);
          return;
        }
      }
    }

    let finalInvoiceNum = invoiceNumber.trim();

    // Check for duplicate invoice number if creating or editing to a different one
    if (!editInvoiceNumber) {
      const duplicate = invoicesList.some(
        (inv) => inv.invoiceNumber.toLowerCase().trim() === finalInvoiceNum.toLowerCase().trim()
      );
      if (duplicate) {
        if (!isCustomInvoiceNumber) {
          // Auto-recalculate to next available sequence if user didn't manually lock this number
          finalInvoiceNum = computeNextInvoiceNumber(invoicesList);
          setInvoiceNumber(finalInvoiceNum);
        } else {
          setErrorMessage(`Invoice number ${finalInvoiceNum} already exists. Please choose a different number or reset to auto-sequence.`);
          return;
        }
      }
    }

    setIsSaving(true);
    setErrorMessage(null);

    const dateStr = new Date().toISOString().split("T")[0];

    const newInvoice: Invoice = {
      id: editInvoiceNumber
        ? (invoicesList.find((i) => i.invoiceNumber === editInvoiceNumber)?.id || `inv-mock-${Date.now()}`)
        : `inv-mock-${Date.now()}`,
      invoiceNumber: finalInvoiceNum,
      quoteNumber: fromQuoteNumber || undefined,
      customerId: selectedCustomerId || `cust-manual-${Date.now()}`,
      customerName: selectedCustomer?.name || "",
      companyName: selectedCustomer?.company || customerSearchQuery.replace(/\s*\([^)]*\)/, "").trim(),
      salesmanId: user?.id || "user-salesman",
      salesmanName: user?.name || "Dr. Kaleemullah M.",
      country: selectedCustomer?.country || "UAE",
      date: dateStr,
      items: invoiceItems,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      status,
      paymentMethod,
      creditDays: status === "Credit" ? (typeof creditDays === "number" ? creditDays : (parseInt(creditDays as string, 10) || 0)) : undefined,
      notes,
    };

    const payload = {
      invoiceNumber: newInvoice.invoiceNumber,
      quoteNumber: newInvoice.quoteNumber,
      customerId: newInvoice.customerId,
      customerName: newInvoice.customerName,
      companyName: newInvoice.companyName,
      salesmanId: user?.id || newInvoice.salesmanId,
      salesmanName: newInvoice.salesmanName,
      date: newInvoice.date,
      subtotal: newInvoice.subtotal,
      discountTotal: newInvoice.discountTotal,
      taxTotal: newInvoice.taxTotal,
      grandTotal: newInvoice.grandTotal,
      status: newInvoice.status,
      paymentMethod,
      creditDays: newInvoice.creditDays,
      notes: newInvoice.notes,
      items: invoiceItems,
    };

    try {
      const endpoint = editInvoiceNumber ? `/api/invoices/${newInvoice.id}` : "/api/invoices";
      const method = editInvoiceNumber ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save invoice");
      }

      setSuccessMessage(
        language === "en"
          ? `Invoice ${newInvoice.invoiceNumber} successfully saved!`
          : `تم حفظ الفاتورة ${newInvoice.invoiceNumber} بنجاح!`
      );
      setIsSaving(false);

      setTimeout(() => {
        router.push("/invoices");
      }, 800);
    } catch (err: any) {
      console.error("Invoice save error:", err);
      setErrorMessage(err.message || "Failed to save invoice to database.");
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
      setErrorMessage("Failed to add customer. Please try again.");
    } finally {
      setIsCustSubmitting(false);
    }
  };

  if (isPageLoading) {
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
        title={editInvoiceNumber ? `Edit Invoice` : `New Invoice`}
        description={
          editInvoiceNumber
            ? `Modify billing items, payment status, or adjust notes for Ref: ${editInvoiceNumber}.`
            : `Draft a new invoice, set custom billing rates, or compile from an existing quotation.`
        }
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: editInvoiceNumber ? "Edit Invoice" : "New Invoice" }
        ]}
      />

      <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto space-y-6">
        {errorMessage && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            <span className="font-semibold">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Builder Details (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Metadata: Invoice Number & Status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Invoice Number (Editable)
                </label>
                {isCustomInvoiceNumber && !editInvoiceNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomInvoiceNumber(false);
                      setInvoiceNumber(computeNextInvoiceNumber(invoicesList));
                    }}
                    className="text-[11px] font-bold text-[#61989B] hover:underline cursor-pointer"
                  >
                    Reset to Auto-Sequence
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  setIsCustomInvoiceNumber(true);
                }}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
              />
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Payment Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-850 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
                >
                  <option value="Paid">Paid</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>

              {status === "Paid" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-850 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
                  >
                    <option value="Cash">Cash (Contributes to Cash in Hand)</option>
                    <option value="Bank Transfer">Bank Transfer (Receipt only - No Cash in Hand)</option>
                    <option value="Cheque">Cheque (Receipt only - No Cash in Hand)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              {status === "Credit" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Credit Days
                  </label>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    required
                    value={creditDays}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreditDays(v === "" ? "" : Math.max(0, parseInt(v, 10) || 0));
                    }}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => {
                      if (creditDays === "" || creditDays === undefined || creditDays === null) setCreditDays(30);
                    }}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
                  />
                </div>
              )}
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
                        <div className="flex flex-col items-end gap-1">
                          {c.address && (
                            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {c.address}
                            </span>
                          )}
                          {(c.pendingBillwiseAmount || 0) > 0 && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                              Pending: AED {Math.max(0, c.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                  <span className={`text-sm font-extrabold ${Math.max(0, selectedCustomer.pendingBillwiseAmount || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    AED {Math.max(0, selectedCustomer.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>


          {/* Product Items Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-800">2. Items Configuration</h3>
            
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

              {showProductDropdown && filteredProducts.length > 0 && (
                <div className="absolute left-0 right-0 z-30 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {filteredProducts.map((p) => {
                    const isOutOfStock = p.isAvailable === false;
                    const isAlreadyAdded = invoiceItems.some((item) => item.productId === p.id);
                    const isDisabled = isOutOfStock || isAlreadyAdded;
                    const stockInfo = stockMap.get(p.id);
                    const userCountry = profile?.country || "UAE";
                    const isSalesperson = profile?.role === "salesperson";
                    const stockVal = isSalesperson
                      ? (userCountry === "Oman" ? (stockInfo?.oman ?? 0) : (stockInfo?.uae ?? 0))
                      : (stockInfo?.total ?? 0);

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && handleAddProduct(p)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between ${
                          isDisabled ? "opacity-60 cursor-not-allowed bg-slate-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
                          <div className="text-xs text-slate-400 font-medium">
                            Unit: {p.unit} • Stock: <strong className="text-slate-700">{stockVal}</strong>
                          </div>
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

            {invoiceItems.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <p className="text-sm font-semibold text-slate-400">Search and add items to list to build invoice</p>
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
                      {invoiceItems.map((item, idx) => {
                        const itemCountry = selectedCustomer?.country || user?.country || "UAE";
                        const stocks = stockMap.get(String(item.productId));
                        const availableStock = itemCountry === "Oman" ? (stocks?.oman ?? 0) : (stocks?.uae ?? 0);
                        const isInsufficient = (Number(item.quantity) || 0) > availableStock;

                        return (
                          <tr key={item.productId} className="align-middle">
                            <td className="px-4 py-4">
                              <span className="font-bold text-slate-700 block">{item.productName}</span>
                              <span className="text-[11px] font-medium text-slate-400">
                                Available Stock ({itemCountry}): <span className="font-bold text-slate-700">{availableStock}</span>
                              </span>
                              {isInsufficient && (
                                <div className="text-[11px] font-bold text-rose-600 mt-0.5">
                                  Insufficient stock. Available quantity: {availableStock}.
                                </div>
                              )}
                            </td>
                          <td className="px-2 py-4">
                            <div className="relative flex items-center w-28 mx-auto">
                              <span className="absolute left-2.5 text-xs font-bold text-slate-400">AED</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={item.price !== undefined && item.price !== null ? item.price : ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    handleUpdateUnitPrice(idx, "");
                                  } else {
                                    const parsed = parseFloat(raw);
                                    handleUpdateUnitPrice(idx, isNaN(parsed) ? "" : Math.max(0, parsed));
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full pl-10 pr-2 py-1.5 border border-slate-200 rounded-lg text-right font-bold text-sm text-slate-800 focus:outline-none focus:border-accent"
                              />
                            </div>
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
                                <span className="absolute left-2.5 text-xs font-bold text-slate-400">AED</span>
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
                                    (item.discountPrice !== undefined && item.discountPrice !== null && String(item.discountPrice).trim() !== "" && Number(item.discountPrice) > item.price) ||
                                    (item.manualDiscount !== undefined && item.manualDiscount !== null && String(item.manualDiscount).trim() !== "" && Number(item.manualDiscount) > item.price)
                                      ? "border-rose-500 bg-rose-50 text-rose-800"
                                      : "border-slate-200 text-slate-800 focus:border-accent"
                                  }`}
                                />
                              </div>
                              {item.discount > 0 && (
                                <span className="text-[10px] font-bold text-emerald-600 mt-1">
                                  Disc: AED {item.discount.toFixed(2)}/unit
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-slate-800">AED {item.total.toFixed(2)}</td>
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
                        );
                      })}
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
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">Invoice Summary</h3>
            
            <div className="space-y-3.5 text-sm font-semibold">
              <div className="flex justify-between text-slate-500">
                <span>Items Count:</span>
                <span>{invoiceItems.reduce((acc, curr) => acc + curr.quantity, 0)} items</span>
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

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                Special Remarks / Delivery Notes
              </label>
              <textarea
                rows={3}
                placeholder="e.g. standard payment terms 30 days..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={isSaving || !selectedCustomerId || invoiceItems.length === 0}
                className="flex w-full justify-center items-center gap-2 py-3.5 px-4 text-base font-bold text-white bg-primary rounded-xl hover:bg-[#15223c] focus:outline-none disabled:opacity-50 transition duration-150 cursor-pointer shadow-md shadow-primary/10"
              >
                <CheckCircle className="w-5 h-5" />
                {isSaving ? "Saving Invoice..." : "Save Invoice"}
              </button>
              <Link
                href="/invoices"
                className="flex w-full justify-center items-center py-3.5 px-4 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition duration-150"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </form>
      </div>

      {showProductDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowProductDropdown(false)} />
      )}

      {/* Success Modal */}
      {successMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Invoice Saved</h3>
            <p className="text-sm text-slate-500 mb-6">{successMessage}</p>
            <button
              onClick={() => {
                setSuccessMessage(null);
                router.push("/invoices");
              }}
              className="w-full py-3 bg-primary hover:bg-[#15223c] text-white font-bold rounded-xl transition duration-150"
            >
              Go to Invoices
            </button>
          </div>
        </div>
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

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Primary Contact Doctor Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Mohammed"
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
                      placeholder="e.g. Al Ain, UAE"
                      value={formCustLocation}
                      onChange={(e) => setFormCustLocation(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsCustModalOpen(false)}
                      className="w-1/2 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCustSubmitting}
                      className="w-1/2 py-3 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] transition disabled:opacity-50"
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

export default function NewInvoicePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#61989B] mb-2" />
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading Invoice Interface...</p>
      </div>
    }>
      <NewInvoiceForm />
    </Suspense>
  );
}
