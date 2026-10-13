"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Product, Customer, QuoteItem, Quote, Invoice, Receipt } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Permissions } from "@/lib/auth/permissions";
import { buildInvoicePDF } from "@/lib/pdfHelper";
import { buildReceiptPDF } from "@/lib/pdfReceiptHelper";
import { currencyFor, decimalsFor } from "@/lib/currency";

interface InvoiceItemWithManual extends QuoteItem {
  manualDiscount?: number | string;
  discountPrice?: number | string;
  /** List (or quantity-tier) price before any discount. */
  listPrice?: number;
  /** What the salesman typed in the Rate box ("" = list price). */
  rate?: number | string;
  /** Added in this session from the product list, so quantity tiers apply. */
  tiered?: boolean;
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const editInvoiceNumber = searchParams.get("edit");
  const fromQuoteNumber = searchParams.get("fromQuote");
  const { user, profile } = useAuth();
  const currencyCode = currencyFor(profile?.country);
  const dp = decimalsFor(profile?.country);
  
  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isCustomInvoiceNumber, setIsCustomInvoiceNumber] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemWithManual[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"Paid" | "Credit">("Paid");
  const [originalInvoiceStatus, setOriginalInvoiceStatus] = useState<"Paid" | "Credit" | "Cancelled">("Paid");
  const [showReconcileConfirmModal, setShowReconcileConfirmModal] = useState(false);
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
  const [activeProduct, setActiveProduct] = useState(0);
  const [activeCustomer, setActiveCustomer] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

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

  const isKaleemullah = useMemo(() => {
    const KALEEM_ID = "59ce7b2c-156f-4b91-9ee9-a55c05aa160f";
    if (user?.id === KALEEM_ID || profile?.id === KALEEM_ID) return true;
    if (user?.name?.toLowerCase().includes("kaleem") || profile?.full_name?.toLowerCase().includes("kaleem") || user?.email?.toLowerCase().includes("kaleem")) return true;
    return false;
  }, [user, profile]);

  const computeNextInvoiceNumber = (list: Invoice[], _isKaleem?: boolean) => {
    let maxSeq = 352;
    (list || []).forEach((inv) => {
      if (!inv.invoiceNumber) return;
      const matchD = inv.invoiceNumber.match(/^D(\d+)$/i);
      if (matchD && matchD[1]) {
        const num = parseInt(matchD[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
      const matchInv = inv.invoiceNumber.match(/^INV-\d{4}-(\d+)$/i);
      if (matchInv && matchInv[1]) {
        const num = parseInt(matchInv[1], 10);
        if (!isNaN(num) && num < 1000000 && num > maxSeq) maxSeq = num;
      }
    });
    return `D${String(maxSeq + 1).padStart(4, "0")}`;
  };

  const populateFormWithInvoice = (existing: Invoice) => {
    setInvoiceNumber(existing.invoiceNumber);
    setSelectedCustomerId(existing.customerId);
    setStatus(existing.status);
    setOriginalInvoiceStatus(existing.status);
    setCreditDays(existing.creditDays || 30);
    setNotes(existing.notes || "");
    
    const cust = customers.find((c) => c.id === existing.customerId);
    if (cust) {
      setCustomerSearchQuery(`${cust.company} ${cust.name ? `(${cust.name})` : ""}`);
    } else {
      setCustomerSearchQuery(existing.companyName || existing.customerName || "");
    }

    if (Array.isArray(existing.items)) {
      setInvoiceItems(existing.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
        total: item.total,
        manualDiscount: item.discountPrice ?? (item.discount > 0 ? (item.price - item.discount) : undefined),
        discountPrice: item.discountPrice,
        listPrice: item.price,
        rate: item.discount > 0 ? Math.max(0, item.price - item.discount) : "",
      })));
      if (existing.notes) setShowNotes(true);
    }
  };

  // Set default / prepopulated states once databases load
  useEffect(() => {
    if (isPageLoading) return;

    // Mode A: EDIT EXISTING INVOICE
    if (editInvoiceNumber) {
      if (profile && !Permissions.canEditInvoice(profile)) {
        alert("Only an Admin or Accountant can edit existing invoices.");
        router.push("/invoices");
        return;
      }
      const existing = invoicesList.find((i) => i.invoiceNumber === editInvoiceNumber || i.id === editInvoiceNumber);
      if (existing && existing.items && existing.items.length > 0) {
        populateFormWithInvoice(existing);
      } else {
        fetch(`/api/invoices/${encodeURIComponent(editInvoiceNumber)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && !data.error) {
              populateFormWithInvoice(data);
            }
          })
          .catch((err) => console.error("Failed to fetch invoice for editing:", err));
      }
    }
    // Mode B: CONVERT FROM QUOTE
    else if (fromQuoteNumber && quotesList.length > 0) {
      const quote = quotesList.find((q) => q.quoteNumber === fromQuoteNumber);
      if (quote) {
        if (!isCustomInvoiceNumber) {
          setInvoiceNumber(computeNextInvoiceNumber(invoicesList, isKaleemullah));
        }

        setSelectedCustomerId(quote.customerId);
        setStatus("Paid");
        setCreditDays(30);
        setNotes(quote.notes || "");
        if (quote.notes) setShowNotes(true);

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
            listPrice: unitPrice,
            rate: effectivePrice < unitPrice ? effectivePrice : "",
            total: (Number(item.quantity) || 0) * effectivePrice,
          };
        }));
      }
    }
    // Mode C: NEW INVOICE FROM SCRATCH
    else if (!editInvoiceNumber && !isCustomInvoiceNumber) {
      setInvoiceNumber(computeNextInvoiceNumber(invoicesList, isKaleemullah));
    }
  }, [editInvoiceNumber, fromQuoteNumber, quotesList, invoicesList, customers, isPageLoading, isCustomInvoiceNumber, isKaleemullah]);

  // Fetch authoritative next invoice number from server
  useEffect(() => {
    if (isPageLoading || editInvoiceNumber || isCustomInvoiceNumber) return;

    fetch("/api/invoices?nextNumber=true")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.nextInvoiceNumber) {
          setInvoiceNumber(data.nextInvoiceNumber);
        }
      })
      .catch((err) => console.error("Failed to fetch server next invoice number:", err));
  }, [isPageLoading, editInvoiceNumber, isCustomInvoiceNumber, isKaleemullah]);

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

  // UAE: Oman-registered products go on their own invoice (no header, own number).
  const seriesSplit = useMemo(() => {
    const country = selectedCustomer?.country || user?.country || "UAE";
    if (country !== "UAE") return null;
    const regById = new Map(products.map((p) => [String(p.id), p.registeredIn === "Oman"]));
    const lineTotal = (item: InvoiceItemWithManual) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const p = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);
      const d = typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0);
      return Math.max(0, (p - Math.max(0, d)) * q);
    };
    const omanItems = invoiceItems.filter((it) => it.productId && regById.get(String(it.productId)));
    const uaeItems = invoiceItems.filter((it) => !(it.productId && regById.get(String(it.productId))));
    return {
      uaeCount: uaeItems.length,
      omanCount: omanItems.length,
      uaeTotal: uaeItems.reduce((s, it) => s + lineTotal(it), 0),
      omanTotal: omanItems.reduce((s, it) => s + lineTotal(it), 0),
    };
  }, [invoiceItems, products, selectedCustomer, user]);

  // Handlers
  // Each line keeps the list price (price) and, when the salesman charges
  // less, the rate charged (discountPrice). The screen shows one "Rate" box.
  const tierPriceFor = (product: Product | undefined, qty: number, fallback: number) => {
    if (!product) return fallback;
    if (qty >= 100 && product.price100) return product.price100;
    if (qty >= 50 && product.price50) return product.price50;
    if (qty >= 10 && product.price10) return product.price10;
    return product.price;
  };

  const lineWith = (item: InvoiceItemWithManual, listPrice: number, rateRaw: string | number | undefined, qty: number | string) => {
    const q = Number(qty) || 0;
    const rateStr = rateRaw === undefined || rateRaw === null ? "" : String(rateRaw).trim();
    const rate = rateStr === "" ? listPrice : Math.max(0, Number(rateStr) || 0);
    // Charging more than the list price raises the price itself; less is a discount.
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
    } as InvoiceItemWithManual;
  };

  const qtyRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const productSearchRef = useRef<HTMLInputElement>(null);

  const handleAddProduct = (product: Product) => {
    const existingIndex = invoiceItems.findIndex((item) => item.productId === product.id);
    if (existingIndex > -1) {
      const item = invoiceItems[existingIndex];
      const newQty = (Number(item.quantity) || 0) + 1;
      const list = item.tiered ? tierPriceFor(product, newQty, item.listPrice ?? item.price) : (item.listPrice ?? item.price);
      const updated = [...invoiceItems];
      updated[existingIndex] = lineWith(item, list, item.rate, newQty);
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([
        ...invoiceItems,
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
    // Jump straight to the quantity of the line just added.
    setTimeout(() => {
      const el = qtyRefs.current.get(String(product.id));
      el?.focus();
      el?.select();
    }, 30);
  };

  const handleUpdateQuantity = (index: number, val: string) => {
    const item = invoiceItems[index];
    const qty = val === "" ? "" : Math.max(0, parseInt(val, 10) || 0);
    const product = products.find((p) => p.id === item.productId);
    const list = item.tiered ? tierPriceFor(product, Number(qty) || 0, item.listPrice ?? item.price) : (item.listPrice ?? item.price);
    const updated = [...invoiceItems];
    updated[index] = lineWith(item, list, item.rate, qty);
    setInvoiceItems(updated);
  };

  const handleUpdateRate = (index: number, val: string) => {
    const item = invoiceItems[index];
    const updated = [...invoiceItems];
    updated[index] = lineWith(item, item.listPrice ?? item.price, val, item.quantity);
    setInvoiceItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...invoiceItems];
    updated.splice(index, 1);
    setInvoiceItems(updated);
  };

  const pickCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerSearchQuery(`${c.company} ${c.name ? `(${c.name})` : ""}`);
    setShowCustomerDropdown(false);
    setTimeout(() => productSearchRef.current?.focus(), 30);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCustomerId || invoiceItems.length === 0 || isSaving) return;

    if (editInvoiceNumber && originalInvoiceStatus === "Paid" && status === "Credit" && !showReconcileConfirmModal) {
      setShowReconcileConfirmModal(true);
      return;
    }

    await executeSave();
  };

  const executeSave = async () => {
    // Validate available stock before posting invoice (accounting for restored quantities on edit)
    const targetCountry = selectedCustomer?.country || user?.country || "UAE";
    const editingInv = editInvoiceNumber
      ? invoicesList.find((i) => i.invoiceNumber === editInvoiceNumber || i.id === editInvoiceNumber)
      : null;

    const originalQtyMap = new Map<string, number>();
    if (editingInv && Array.isArray(editingInv.items)) {
      editingInv.items.forEach((it) => {
        if (it.productId) {
          originalQtyMap.set(String(it.productId), (originalQtyMap.get(String(it.productId)) || 0) + Number(it.quantity));
        }
      });
    }

    for (const item of invoiceItems) {
      if (item.productId) {
        const stocks = stockMap.get(String(item.productId));
        const availableInDb = targetCountry === "Oman" ? (stocks?.oman ?? 0) : (stocks?.uae ?? 0);
        const originalQtyInThisInv = originalQtyMap.get(String(item.productId)) || 0;
        const restoredAvailable = availableInDb + originalQtyInThisInv;
        const requested = Number(item.quantity) || 0;

        if (requested > restoredAvailable) {
          setErrorMessage(`Insufficient stock for ${item.productName}. Available quantity: ${restoredAvailable}.`);
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

    // Business day in the Gulf (UTC+4), not UTC.
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());

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

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || "Failed to save invoice");
      }

      // The server gives the real numbers (a mixed UAE sale becomes two invoices).
      const savedNumbers: string[] = Array.isArray(resData.invoices) && resData.invoices.length > 0
        ? resData.invoices.map((i: any) => i.invoiceNumber)
        : [resData.invoiceNumber || newInvoice.invoiceNumber];
      const numbersText = savedNumbers.join(" and ");
      setSuccessMessage(
        language === "en"
          ? `${savedNumbers.length > 1 ? "Invoices" : "Invoice"} ${numbersText} successfully saved!`
          : `تم حفظ الفاتورة ${numbersText} بنجاح!`
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
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading…</p>
      </div>
    );
  }

  const money = (n: number) =>
    `${currencyCode} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const stockCountry = selectedCustomer?.country || profile?.country || user?.country || "UAE";
  const stockFor = (productId: string) => {
    const s = stockMap.get(String(productId));
    return stockCountry === "Oman" ? (s?.oman ?? 0) : (s?.uae ?? 0);
  };
  const unitsTotal = invoiceItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const owed = Math.max(0, selectedCustomer?.pendingBillwiseAmount || 0);
  const creditDaysNum = typeof creditDays === "number" ? creditDays : parseInt(String(creditDays), 10) || 0;
  const dueDateLabel = (() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + creditDaysNum);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  })();
  const canEditNumber = profile?.role !== "salesperson" && !editInvoiceNumber;
  const saveBlocker = !selectedCustomerId ? "Choose a customer" : invoiceItems.length === 0 ? "Add at least one product" : null;

  const chip = (on: boolean) =>
    `px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-semibold border transition cursor-pointer ${
      on ? "bg-primary text-white border-primary" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
    }`;
  const card = "bg-white border border-slate-200 rounded-xl p-4 md:p-5";
  const heading = "text-sm font-semibold text-slate-900";
  const input =
    "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";

  return (
    <div className="w-full">
      <PageHeader
        title={editInvoiceNumber ? `Edit invoice ${editInvoiceNumber}` : "New invoice"}
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: editInvoiceNumber ? "Edit" : "New" },
        ]}
      />

      <form onSubmit={handleSubmit} className="px-4 md:px-6 pt-5 max-w-4xl mx-auto space-y-4 text-start">
        {errorMessage && (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Invoice number */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Invoice no.</span>
          {canEditNumber ? (
            <input
              value={invoiceNumber}
              onChange={(e) => {
                setInvoiceNumber(e.target.value);
                setIsCustomInvoiceNumber(true);
              }}
              className="w-32 px-2 py-1 border border-transparent hover:border-slate-200 focus:border-accent rounded-md font-semibold text-slate-900 bg-transparent focus:bg-white focus:outline-none"
              title="Click to change the number"
            />
          ) : (
            <span className="font-semibold text-slate-900">{invoiceNumber || "—"}</span>
          )}
          {isCustomInvoiceNumber && canEditNumber && (
            <button
              type="button"
              onClick={() => {
                setIsCustomInvoiceNumber(false);
                setInvoiceNumber(computeNextInvoiceNumber(invoicesList));
              }}
              className="text-xs font-semibold text-accent hover:underline"
            >
              Use next number
            </button>
          )}
          {!editInvoiceNumber && <span className="text-xs text-slate-400">· final number is given on save</span>}
        </div>

        {/* Customer */}
        <section className={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={heading}>Customer</h2>
            {!selectedCustomer && (
              <button
                type="button"
                onClick={() => setIsCustModalOpen(true)}
                className="text-sm font-semibold text-accent hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> New customer
              </button>
            )}
          </div>

          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{selectedCustomer.company}</div>
                <div className="text-sm text-slate-500 truncate">
                  {[selectedCustomer.name, selectedCustomer.address].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Owes</div>
                  <div className={`text-sm font-semibold ${owed > 0 ? "text-rose-700" : "text-slate-700"}`}>{money(owed)}</div>
                </div>
                {!editInvoiceNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId("");
                      setCustomerSearchQuery("");
                      setShowCustomerDropdown(true);
                    }}
                    className="text-sm font-semibold text-accent hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                autoFocus={!editInvoiceNumber && !fromQuoteNumber}
                placeholder="Search clinic, farm or doctor"
                value={customerSearchQuery}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setShowCustomerDropdown(true);
                  setActiveCustomer(0);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                onKeyDown={(e) => {
                  const list = filteredCustomers.slice(0, 50);
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
                className={`${input} pl-9`}
              />
              {showCustomerDropdown && (
                <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">
                      No match.{" "}
                      <button type="button" onMouseDown={() => setIsCustModalOpen(true)} className="font-semibold text-accent hover:underline">
                        Add a new customer
                      </button>
                    </div>
                  ) : (
                    filteredCustomers.slice(0, 50).map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickCustomer(c)}
                        onMouseEnter={() => setActiveCustomer(i)}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 ${i === activeCustomer ? "bg-slate-50" : ""}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{c.company}</div>
                          <div className="text-xs text-slate-500 truncate">{[c.name, c.address].filter(Boolean).join(" · ")}</div>
                        </div>
                        {(c.pendingBillwiseAmount || 0) > 0 && (
                          <span className="text-xs text-rose-700 shrink-0">owes {money(c.pendingBillwiseAmount || 0)}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Products */}
        <section className={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={heading}>Products</h2>
            {invoiceItems.length > 0 && (
              <span className="text-xs text-slate-500">
                {invoiceItems.length} {invoiceItems.length === 1 ? "line" : "lines"} · {unitsTotal} units
              </span>
            )}
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
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
              className={`${input} pl-9`}
            />
            {showProductDropdown && searchQuery && (
              <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">No product matches “{searchQuery}”.</div>
                ) : (
                  filteredProducts.slice(0, 30).map((p, i) => {
                    const off = p.isAvailable === false;
                    const inList = invoiceItems.find((it) => it.productId === p.id);
                    const stock = stockFor(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={off}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => !off && handleAddProduct(p)}
                        onMouseEnter={() => setActiveProduct(i)}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 ${
                          off ? "opacity-50 cursor-not-allowed" : i === activeProduct ? "bg-slate-50" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                          <div className={`text-xs ${stock <= 0 ? "text-rose-700" : "text-slate-500"}`}>
                            {off ? "Not available" : `${stock} in stock`}
                            {inList ? ` · already added (${inList.quantity})` : ""}
                          </div>
                        </div>
                        <span className="text-sm text-slate-700 shrink-0">{money(p.price)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {invoiceItems.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
              No products yet. Search above to add one.
            </p>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[1fr_84px_120px_110px_32px] gap-3 px-1 pb-2 text-xs text-slate-500 border-b border-slate-100">
                <span>Product</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              <ul className="divide-y divide-slate-100">
                {invoiceItems.map((item, idx) => {
                  const stock = stockFor(String(item.productId));
                  const short = (Number(item.quantity) || 0) > stock;
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
                    <li key={item.productId} className="py-3 md:grid md:grid-cols-[1fr_84px_120px_110px_32px] md:gap-3 md:items-center">
                      <div className="flex items-start justify-between gap-2 md:block min-w-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">{item.productName}</div>
                          <div className="text-xs text-slate-500">
                            List {money(list)}
                            {off > 0 && rateNum > 0 && <span className="text-emerald-700"> · {money(off)} off each</span>}
                            {rateNum === 0 && <span className="text-emerald-700"> · free</span>}
                          </div>
                          <div className={`text-xs ${short ? "text-rose-700 font-medium" : "text-slate-400"}`}>
                            {short ? `Only ${stock} in stock` : `${stock} in stock`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="md:hidden p-1.5 text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${item.productName}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 md:contents">
                        <label className="block">
                          <span className="md:hidden text-xs text-slate-500">Qty</span>
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
                            className={`${input} text-center px-2 ${short ? "border-rose-300" : ""}`}
                          />
                        </label>
                        <label className="block">
                          <span className="md:hidden text-xs text-slate-500">Rate</span>
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
                            className={`${input} text-right px-2`}
                          />
                        </label>
                        <div className="text-right">
                          <span className="md:hidden text-xs text-slate-500 block">Amount</span>
                          <span className="text-sm font-semibold text-slate-900 leading-[42px] md:leading-normal">{money(item.total)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="hidden md:flex p-1.5 text-slate-400 hover:text-rose-600 justify-center"
                        aria-label={`Remove ${item.productName}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-400 pt-2">Leave Rate empty to charge the list price. Enter 0 for a free unit.</p>
            </div>
          )}

          {seriesSplit && seriesSplit.omanCount > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900">
              {seriesSplit.uaeCount > 0
                ? editInvoiceNumber
                  ? "UAE- and Oman-registered products can't share one invoice. Move one kind to a separate invoice."
                  : `This will save as two invoices: UAE-registered ${money(seriesSplit.uaeTotal)} and Oman-registered ${money(seriesSplit.omanTotal)} (printed without the company header).`
                : "Oman-registered products only: saved with its own number and printed without the company header."}
            </p>
          )}
        </section>

        {/* Payment */}
        <section className={card}>
          <h2 className={`${heading} mb-3`}>Payment</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(status === "Paid")} onClick={() => setStatus("Paid")}>
              Paid now
            </button>
            <button type="button" className={chip(status === "Credit")} onClick={() => setStatus("Credit")}>
              On credit
            </button>
          </div>

          {status === "Paid" ? (
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-2">Paid by</div>
              <div className="flex flex-wrap gap-2">
                {(["Cash", "Bank Transfer", "Cheque", "Other"] as const).map((m) => (
                  <button key={m} type="button" className={chip(paymentMethod === m)} onClick={() => setPaymentMethod(m)}>
                    {m === "Bank Transfer" ? "Bank transfer" : m}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {paymentMethod === "Cash" ? "A receipt is made and the cash is added to your cash in hand." : "A receipt is made. Cash in hand is not changed."}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-2">Due in</div>
              <div className="flex flex-wrap items-center gap-2">
                {[30, 60, 90].map((d) => (
                  <button key={d} type="button" className={chip(creditDaysNum === d)} onClick={() => setCreditDays(d)}>
                    {d} days
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0))}
                    onBlur={() => {
                      if (creditDays === "") setCreditDays(30);
                    }}
                    className={`${input} w-20 text-center`}
                    aria-label="Credit days"
                  />
                  <span className="text-sm text-slate-500">days</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">Due on {dueDateLabel}.</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100">
            {showNotes ? (
              <>
                <label htmlFor="inv-notes" className="text-xs text-slate-500 block mb-1.5">
                  Note on the invoice
                </label>
                <textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
              </>
            ) : (
              <button type="button" onClick={() => setShowNotes(true)} className="text-sm font-semibold text-accent hover:underline">
                + Add a note
              </button>
            )}
          </div>
        </section>

        {/* Total and save */}
        <div className="sticky bottom-0 z-20 -mx-4 md:mx-0 px-4 md:px-5 py-3 bg-white/95 backdrop-blur border-t md:border border-slate-200 md:rounded-t-xl flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">
              Total{discountTotal > 0 ? ` · ${money(discountTotal)} discount` : ""}
            </div>
            <div className="text-xl font-semibold text-slate-900">{money(grandTotal)}</div>
          </div>
          <div className="flex items-center gap-3">
            {saveBlocker && <span className="hidden sm:inline text-xs text-slate-500">{saveBlocker}</span>}
            <Link href="/invoices" className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-2 py-2">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSaving || !!saveBlocker}
              className="px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving…" : editInvoiceNumber ? "Save changes" : status === "Paid" ? "Save invoice & receipt" : "Save invoice"}
            </button>
          </div>
        </div>
      </form>

      {/* Success Modal */}
      {successMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
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
                <CheckCircle className="w-10 h-10 text-emerald-600" />
                <h4 className="text-lg font-bold text-slate-900">Customer added</h4>
                
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

      {/* Reconcile Paid -> Credit Confirmation Modal */}
      {showReconcileConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl relative text-left border border-amber-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
                            <h3 className="text-base font-bold text-slate-900">Change paid invoice to credit?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Changing this invoice from <strong>Paid</strong> to <strong>Credit</strong> will reverse the associated receipt and collection entry and update the customer's outstanding balance.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReconcileConfirmModal(false)}
                className="w-1/2 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReconcileConfirmModal(false);
                  executeSave();
                }}
                className="w-1/2 py-2.5 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition"
              >
                Change to credit
              </button>
            </div>
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
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading…</p>
      </div>
    }>
      <NewInvoiceForm />
    </Suspense>
  );
}
