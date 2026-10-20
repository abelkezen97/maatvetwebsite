"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle, CreditCard, FileText, Info, Landmark, Search, ShieldAlert, Wallet, X } from "lucide-react";
import { CustomerBalanceStrip, CustomerCombobox, FieldRow, FormActionBar, StaticValue, fieldInput, useWide } from "@/components/form/EntryForm";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { AccountSnapshot, SavedDocuments } from "@/components/CustomerAccountPanels";
import { Product, Customer, QuoteItem, Quote, Invoice, Receipt, ExpiryLot } from "@/types";
import { expiryState } from "@/lib/db/expiry";
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
  const { user, profile, isStaff } = useAuth();
  const currencyCode = currencyFor(profile?.country);
  const dp = decimalsFor(profile?.country);
  const wide = useWide();
  
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
  // Stock by expiry date per product, earliest first.
  const [lotsByProduct, setLotsByProduct] = useState<Map<string, ExpiryLot[]>>(new Map());
  
  // UI states
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [activeProduct, setActiveProduct] = useState(0);
  const [activeCustomer, setActiveCustomer] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  // Wizard: 0 customer, 1 products, 2 payment, 3 review.
  const [saved, setSaved] = useState<{ title: string; invoiceIds: string[]; paid: boolean } | null>(null);
  // Payment details (cheque / bank transfer paid at invoice time).
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()));
  const [payBank, setPayBank] = useState("");
  const [transferRef, setTransferRef] = useState("");

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
        try {
          const lotRes = await fetch("/api/lots");
          const lotData = await lotRes.json();
          const lm = new Map<string, ExpiryLot[]>();
          (lotData.lots || []).forEach((l: ExpiryLot) => {
            const list = lm.get(l.productId) || [];
            list.push(l);
            lm.set(l.productId, list);
          });
          setLotsByProduct(lm);
        } catch (e) {
          console.error("Failed to load expiry dates:", e);
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
            batchId: defaultLotFor(item.productId),
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

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  // First expiry first: the earliest lot that has stock and hasn't expired.
  const defaultLotFor = (productId: string): string | undefined => {
    const lots = lotsByProduct.get(String(productId)) || [];
    const pick = lots.find((l) => l.qtyRemaining > 0 && expiryState(l.expiryDate, todayStr) !== "expired");
    return pick?.id;
  };
  const setLineLot = (index: number, batchId: string) => {
    const updated = [...invoiceItems];
    updated[index] = { ...updated[index], batchId: batchId || undefined };
    setInvoiceItems(updated);
  };

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
          { productId: product.id, productName: product.name, quantity: 1, price: product.price, discount: 0, total: product.price, tiered: true, batchId: defaultLotFor(product.id) },
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

  const topRef = useRef<HTMLDivElement>(null);
  const pickCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerSearchQuery(`${c.company} ${c.name ? `(${c.name})` : ""}`);
    setShowCustomerDropdown(false);
    setTimeout(() => productSearchRef.current?.focus({ preventScroll: true }), 30);
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
      chequeNumber: status === "Paid" && paymentMethod === "Cheque" ? chequeNumber.trim() : undefined,
      chequeDate: status === "Paid" && paymentMethod === "Cheque" ? chequeDate : undefined,
      bankName: status === "Paid" && (paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") ? payBank.trim() || undefined : undefined,
      referenceNo: status === "Paid" && paymentMethod === "Bank Transfer" ? transferRef.trim() : undefined,
      // Admin / accountant typed the number: the server uses it and the series carries on after it.
      customNumber: !editInvoiceNumber && isCustomInvoiceNumber && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
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

      // Editing: a changed number is saved separately (admin / accountant only).
      let renamedTo: string | null = null;
      if (editInvoiceNumber && isStaff && invoiceNumber.trim() && invoiceNumber.trim() !== editInvoiceNumber) {
        const rn = await fetch("/api/documents/renumber", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docType: "invoice", id: newInvoice.id, number: invoiceNumber.trim() }),
        });
        const rnData = await rn.json().catch(() => ({}));
        if (!rn.ok) throw new Error(`Invoice saved, but the number was not changed: ${rnData.error || "unknown error"}`);
        renamedTo = rnData.number || invoiceNumber.trim();
      }

      // The server gives the real numbers (a mixed UAE sale becomes two invoices).
      const savedNumbers: string[] = renamedTo
        ? [renamedTo]
        : Array.isArray(resData.invoices) && resData.invoices.length > 0
          ? resData.invoices.map((i: any) => i.invoiceNumber)
          : [resData.invoiceNumber || newInvoice.invoiceNumber];
      const numbersText = savedNumbers.join(" and ");
      const savedIds: string[] = Array.isArray(resData.invoices) && resData.invoices.length > 0
        ? resData.invoices.map((i: any) => i.id).filter(Boolean)
        : [resData.id || newInvoice.id].filter((x: any) => x && !String(x).startsWith("inv-mock"));
      setSaved({
        title: `${savedNumbers.length > 1 ? "Invoices" : "Invoice"} ${numbersText} ${editInvoiceNumber ? "updated" : "saved"}`,
        invoiceIds: savedIds,
        paid: status === "Paid",
      });
      setIsSaving(false);
      setTimeout(() => topRef.current?.scrollIntoView({ block: "start" }), 30);
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
  const cashOnly = Boolean(selectedCustomer?.cashOnly);
  const creditDaysNum = typeof creditDays === "number" ? creditDays : parseInt(String(creditDays), 10) || 0;
  const fmtDate = (iso: string) =>
    iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  const dueDateLabel = (() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + creditDaysNum);
    return fmtDate(d.toISOString().slice(0, 10));
  })();
  // Admin / accountant can type the number of a new invoice or change an existing one.
  const canEditNumber = isStaff;
  const askDetails = !editInvoiceNumber && status === "Paid";
  const methodLabel = (m: string) => (m === "Bank Transfer" ? "Bank transfer" : m);

  const zeroLine = invoiceItems.find((it) => !(Number(it.quantity) > 0));
  const isSalesmanUser = profile?.role === "salesperson";
  const lotOf = (item: InvoiceItemWithManual) => (lotsByProduct.get(String(item.productId)) || []).find((l) => l.id === item.batchId);
  const rateOf = (item: InvoiceItemWithManual) => Number(item.discountPrice !== "" && item.discountPrice !== undefined ? item.discountPrice : item.price);
  // Salesman: never expired stock. Any price is allowed; the admin is told about prices below list.
  const expiryProblem = (item: InvoiceItemWithManual): string | null => {
    if (!isSalesmanUser) return null;
    const lot = lotOf(item);
    const state = expiryState(lot?.expiryDate, todayStr);
    if (state === "expired") return `${item.productName}: this stock has expired. Choose another expiry date.`;
    return null;
  };
  const belowListNote = (item: InvoiceItemWithManual): string | null => {
    if (!isSalesmanUser) return null;
    const list = item.listPrice ?? item.price;
    if (list > 0 && rateOf(item) < list - 0.0005) {
      return rateOf(item) <= 0.0005 ? "Free (FOC) line. The admin is told about this." : "Below the list price. The admin is told about this.";
    }
    return null;
  };
  const expiryBlock = invoiceItems.map(expiryProblem).find(Boolean) || null;
  const productsBlocker =
    invoiceItems.length === 0
      ? "Add at least one product"
      : zeroLine
        ? `Set a quantity for ${zeroLine.productName} or remove it`
        : expiryBlock;
  const paymentBlocker = (() => {
    if (cashOnly && status === "Credit") return "This customer is cash only. Choose Paid now.";
    if (cashOnly && status === "Paid" && paymentMethod === "Cheque") return "This customer is cash only. Cheques are not accepted.";
    if (askDetails && paymentMethod === "Cheque" && (!chequeNumber.trim() || !chequeDate)) return "Enter the cheque number and date";
    if (askDetails && paymentMethod === "Bank Transfer" && !transferRef.trim()) return "Enter the transfer reference";
    return null;
  })();
  const METHODS = [
    { key: "Cash", icon: Wallet, hint: "Adds to your cash in hand" },
    { key: "Bank Transfer", icon: Landmark, hint: "Reference needed" },
    { key: "Cheque", icon: FileText, hint: "Paid once it clears" },
    { key: "Other", icon: CreditCard, hint: "Card or anything else" },
  ] as const;


  const blocker = !selectedCustomerId ? "Choose a customer" : productsBlocker || paymentBlocker;
  const todayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const pill = (on: boolean) =>
    `h-10 px-4 text-sm transition-colors ${on ? "bg-accent text-white font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"} disabled:opacity-40 disabled:cursor-not-allowed`;

  const lineExtras = (item: InvoiceItemWithManual) => {
    const lots = lotsByProduct.get(String(item.productId)) || [];
    const chosen = lots.find((l) => l.id === item.batchId);
    const state = expiryState(chosen?.expiryDate, todayStr);
    const problem = expiryProblem(item);
    const fmt = (d: string | null) =>
      d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No date";
    const stock = stockFor(String(item.productId));
    const qty = Number(item.quantity) || 0;
    const list = item.listPrice ?? item.price;
    const rateNum = rateOf(item);
    const off = Math.max(0, list - rateNum);
    return (
      <>
        <div className="text-xs text-slate-500 mt-0.5">
          List {money(list)}
          {off > 0 && rateNum > 0 && <span className="text-emerald-700"> · {money(off)} off each</span>}
          {rateNum === 0 && <span className="text-emerald-700"> · free</span>}
          <span className={qty > stock ? "text-rose-700 font-medium" : ""}> · {qty > stock ? `only ${stock} in stock` : `${stock} in stock`}</span>
        </div>
        {lots.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={item.batchId || ""}
              onChange={(e) => setLineLot(invoiceItems.indexOf(item), e.target.value)}
              aria-label={`Expiry date of ${item.productName}`}
              className={`h-8 px-2 rounded-md border text-xs bg-white max-w-full ${
                state === "expired" ? "border-rose-300 text-rose-800" : state === "near" ? "border-amber-300 text-amber-900" : "border-slate-300 text-slate-700"
              }`}
            >
              <option value="">Expiry: not chosen</option>
              {lots.map((l) => {
                const st = expiryState(l.expiryDate, todayStr);
                const blockedLot = isSalesmanUser && st === "expired";
                return (
                  <option key={l.id} value={l.id} disabled={blockedLot}>
                    {fmt(l.expiryDate)} · {l.qtyRemaining} left{st === "expired" ? " · expired" : st === "near" ? " · near expiry" : ""}
                    {l.needsCheck ? " · to confirm" : ""}
                  </option>
                );
              })}
            </select>
            {state === "near" && <span className="text-[11px] font-medium text-amber-900 bg-amber-100 rounded-full px-2 py-0.5">Near expiry</span>}
            {chosen && qty > chosen.qtyRemaining && (
              <span className="text-[11px] text-rose-800 bg-rose-100 rounded-full px-2 py-0.5">Only {chosen.qtyRemaining} at this date</span>
            )}
          </div>
        )}
        {!problem && belowListNote(item) && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {belowListNote(item)}
          </p>
        )}
        {problem && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-800">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {problem}
          </p>
        )}
      </>
    );
  };

  const itemSearch = (
    <div className="relative max-w-xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        ref={productSearchRef}
        type="text"
        autoFocus={!!editInvoiceNumber || !!fromQuoteNumber}
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
              const inList = invoiceItems.find((it) => it.productId === p.id);
              const on = i === activeProduct && !off;
              const stock = stockFor(p.id);
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
                    <span className={`block text-xs ${on ? "text-white/80" : stock <= 0 ? "text-rose-700" : "text-slate-500"}`}>
                      {off ? "Not available" : `${stock} in stock`}
                      {inList ? ` · ${inList.quantity} on this invoice` : ""}
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
  );

  const qtyInput = (item: InvoiceItemWithManual, idx: number, cls: string) => {
    const zero = !(Number(item.quantity) > 0);
    const short = (Number(item.quantity) || 0) > stockFor(String(item.productId));
    return (
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
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            productSearchRef.current?.focus();
          }
        }}
        className={`${fieldInput} ${cls} text-right ${zero || short ? "border-rose-400 bg-rose-50" : ""}`}
        aria-label={`Quantity of ${item.productName}`}
      />
    );
  };
  const rateInput = (item: InvoiceItemWithManual, idx: number, cls: string) => (
    <input
      type="number"
      min="0"
      step="any"
      inputMode="decimal"
      placeholder={(item.listPrice ?? item.price).toFixed(dp)}
      value={item.rate ?? ""}
      onChange={(e) => handleUpdateRate(idx, e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          productSearchRef.current?.focus();
        }
      }}
      className={`${fieldInput} ${cls} text-right`}
      aria-label={`Rate of ${item.productName}`}
    />
  );

  return (
    <div className="w-full">
      <PageHeader
        title={editInvoiceNumber ? `Edit invoice ${editInvoiceNumber}` : "New invoice"}
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: editInvoiceNumber ? "Edit" : "New" },
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
            invoiceIds={saved.invoiceIds}
            invoiceIdsForReceipts={saved.paid ? saved.invoiceIds : []}
            newHref="/invoices/new"
            newLabel="New invoice"
            listHref="/invoices"
            listLabel="Go to invoices"
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
                    disabled={!!editInvoiceNumber}
                    autoFocus={!selectedCustomerId && !editInvoiceNumber && !fromQuoteNumber}
                  />
                  {selectedCustomer && (
                    <CustomerBalanceStrip
                      items={[
                        { label: "Owes", value: money(owed), tone: owed > 0 ? "bad" : "ok" },
                        ...(selectedCustomer.address ? [{ label: "Location", value: selectedCustomer.address }] : []),
                        ...(cashOnly ? [{ label: "Status", value: "Cash only", tone: "warn" as const }] : []),
                      ]}
                    />
                  )}
                </FieldRow>

                <FieldRow
                  label="Invoice#"
                  hint={
                    canEditNumber
                      ? isCustomInvoiceNumber
                        ? "New numbers will continue after this one."
                        : editInvoiceNumber
                          ? "You can change the number."
                          : "Next in the series. Type to use another."
                      : undefined
                  }
                >
                  {canEditNumber ? (
                    <input
                      value={invoiceNumber}
                      onChange={(e) => {
                        setInvoiceNumber(e.target.value);
                        setIsCustomInvoiceNumber(true);
                      }}
                      className={`${fieldInput} max-w-[12rem]`}
                      aria-label="Invoice number"
                    />
                  ) : (
                    <StaticValue muted={!editInvoiceNumber}>{editInvoiceNumber || "Given automatically on save"}</StaticValue>
                  )}
                </FieldRow>

                <FieldRow label="Invoice date">
                  <StaticValue>{todayLabel}</StaticValue>
                </FieldRow>

                <FieldRow label="Payment" required>
                  <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden" role="radiogroup" aria-label="Payment">
                    <button type="button" role="radio" aria-checked={status === "Paid"} onClick={() => setStatus("Paid")} className={pill(status === "Paid")}>
                      Paid now
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={status === "Credit"}
                      disabled={cashOnly}
                      onClick={() => setStatus("Credit")}
                      className={`border-l border-slate-300 ${pill(status === "Credit")}`}
                    >
                      On credit
                    </button>
                  </div>
                  {cashOnly && (
                    <p className="mt-2 flex items-start gap-2 text-sm text-amber-900">
                      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                      {selectedCustomer?.cashOnlyReason || "A cheque from this customer bounced."} Cash only: no credit and no cheques.
                    </p>
                  )}
                </FieldRow>

                {status === "Paid" ? (
                  <>
                    <FieldRow label="Paid by">
                      <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden" role="radiogroup" aria-label="Paid by">
                        {METHODS.map((m, i) => {
                          const blockedM = cashOnly && m.key === "Cheque";
                          return (
                            <button
                              key={m.key}
                              type="button"
                              role="radio"
                              aria-checked={paymentMethod === m.key}
                              disabled={blockedM}
                              onClick={() => setPaymentMethod(m.key)}
                              className={`${i > 0 ? "border-l border-slate-300" : ""} ${pill(paymentMethod === m.key)}`}
                            >
                              {methodLabel(m.key)}
                            </button>
                          );
                        })}
                      </div>
                      {paymentMethod === "Cash" && <p className="mt-1.5 text-xs text-slate-500">Adds to your cash in hand.</p>}
                    </FieldRow>
                    {askDetails && paymentMethod === "Cheque" && (
                      <>
                        <FieldRow label="Cheque no." required>
                          <input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`${fieldInput} max-w-xs`} inputMode="numeric" placeholder="e.g. 000123" />
                        </FieldRow>
                        <FieldRow label="Cheque date" required hint="The invoice counts as paid once the office marks the cheque cleared.">
                          <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={`${fieldInput} max-w-xs`} />
                        </FieldRow>
                        <FieldRow label="Bank">
                          <input value={payBank} onChange={(e) => setPayBank(e.target.value)} className={`${fieldInput} max-w-xs`} placeholder="Optional, e.g. Emirates NBD" />
                        </FieldRow>
                      </>
                    )}
                    {askDetails && paymentMethod === "Bank Transfer" && (
                      <>
                        <FieldRow label="Transfer ref." required>
                          <input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} className={`${fieldInput} max-w-xs`} placeholder="Ref. no. on the transfer slip" />
                        </FieldRow>
                        <FieldRow label="From bank">
                          <input value={payBank} onChange={(e) => setPayBank(e.target.value)} className={`${fieldInput} max-w-xs`} placeholder="Optional, e.g. ADCB" />
                        </FieldRow>
                      </>
                    )}
                  </>
                ) : (
                  <FieldRow label="Due in" hint={`Due on ${dueDateLabel}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex flex-wrap rounded-md border border-slate-300 overflow-hidden" role="radiogroup" aria-label="Due in">
                        {[30, 60, 90].map((d, i) => (
                          <button key={d} type="button" role="radio" aria-checked={creditDaysNum === d} onClick={() => setCreditDays(d)} className={`${i > 0 ? "border-l border-slate-300" : ""} ${pill(creditDaysNum === d)}`}>
                            {d} days
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={creditDays}
                          onChange={(e) => setCreditDays(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0))}
                          onBlur={() => {
                            if (creditDays === "") setCreditDays(30);
                          }}
                          className={`${fieldInput} w-20 text-center`}
                          aria-label="Credit days"
                        />
                        <span className="text-sm text-slate-500">days</span>
                      </div>
                    </div>
                  </FieldRow>
                )}
              </div>

              {/* Item table */}
              <div className="border-t border-slate-200">
                <div className="px-5 md:px-8 pt-5 pb-3">
                  <h2 className="text-sm font-semibold text-slate-900">Item table</h2>
                </div>
                {wide ? (
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
                        {invoiceItems.map((item, idx) => (
                          <tr key={item.productId} className="wiz-in align-top hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 md:px-8 py-3">
                              <div className="text-slate-900 font-medium">{item.productName}</div>
                              {lineExtras(item)}
                            </td>
                            <td className="px-3 py-2">{qtyInput(item, idx, "h-9")}</td>
                            <td className="px-3 py-2">{rateInput(item, idx, "h-9")}</td>
                            <td className="px-3 py-3 text-right font-medium text-slate-900 whitespace-nowrap">{(Number(item.total) || 0).toFixed(dp)}</td>
                            <td className="pr-5 md:pr-8 py-2.5 text-right">
                              <button type="button" onClick={() => handleRemoveItem(idx)} className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition" aria-label={`Remove ${item.productName}`}>
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td className="px-5 md:px-8 py-3" colSpan={5}>
                            {itemSearch}
                            {invoiceItems.length === 0 && <p className="text-xs text-slate-500 mt-2">Add the first item. Press Enter to add, type the quantity, then Enter again for the next item.</p>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 border-t border-slate-200">
                    {invoiceItems.map((item, idx) => (
                      <li key={item.productId} className="wiz-in px-5 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900">{item.productName}</div>
                            {lineExtras(item)}
                          </div>
                          <button type="button" onClick={() => handleRemoveItem(idx)} className="p-1.5 -m-1 rounded text-slate-400 hover:text-rose-600" aria-label={`Remove ${item.productName}`}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2.5 items-end">
                          <label className="block">
                            <span className="block text-[11px] text-slate-500 mb-1">Qty</span>
                            {qtyInput(item, idx, "")}
                          </label>
                          <label className="block">
                            <span className="block text-[11px] text-slate-500 mb-1">Rate</span>
                            {rateInput(item, idx, "")}
                          </label>
                          <div className="text-right">
                            <span className="block text-[11px] text-slate-500 mb-1">Amount</span>
                            <span className="h-10 flex items-center justify-end text-sm font-semibold text-slate-900">{(Number(item.total) || 0).toFixed(dp)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                    <li className="px-5 py-3.5">
                      {itemSearch}
                      {invoiceItems.length === 0 && <p className="text-xs text-slate-500 mt-2">Add the first item, type the quantity, then press Enter for the next one.</p>}
                    </li>
                  </ul>
                )}

                {invoiceItems.length > 0 && <p className="px-5 md:px-8 pb-3 text-xs text-slate-500">Leave Rate empty to charge the list price. Enter 0 for a free unit.</p>}

                {seriesSplit && seriesSplit.omanCount > 0 && (
                  <p className="mx-5 md:mx-8 mb-4 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    {seriesSplit.uaeCount > 0
                      ? editInvoiceNumber
                        ? "UAE- and Oman-registered products can't share one invoice. Move one kind to a separate invoice."
                        : `This will save as two invoices: UAE-registered ${money(seriesSplit.uaeTotal)} and Oman-registered ${money(seriesSplit.omanTotal)}.`
                      : "Oman-registered products only: saved with its own number and printed without the company header."}
                  </p>
                )}

                {/* Notes and totals */}
                <div className="px-5 md:px-8 py-5 flex flex-col md:flex-row gap-6 md:justify-between border-t border-slate-200">
                  <div className="w-full md:max-w-md space-y-4">
                    <label className="block">
                      <span className="block text-sm text-slate-600 mb-1.5">Customer notes</span>
                      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${fieldInput} h-auto py-2`} placeholder="Note printed on the invoice" />
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
                        {invoiceItems.length} lines · {unitsTotal} units
                      </dd>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                      <dt className="font-semibold text-slate-900">Total ({currencyCode})</dt>
                      <dd key={grandTotal} className="wiz-in font-semibold text-slate-900">{grandTotal.toFixed(dp)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {selectedCustomerId && !editInvoiceNumber && (
              <div className="mt-5">
                <AccountSnapshot
                  customerId={selectedCustomerId}
                  change={{ kind: "invoice", amount: grandTotal, credit: status === "Credit", cheque: status === "Paid" && paymentMethod === "Cheque" }}
                />
              </div>
            )}

            <FormActionBar
              saveLabel={editInvoiceNumber ? "Save changes" : "Save invoice"}
              saving={isSaving}
              disabled={!!blocker}
              cancelHref="/invoices"
              hint={blocker}
              total={invoiceItems.length > 0 ? money(grandTotal) : undefined}
            />
          </>
        )}
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
