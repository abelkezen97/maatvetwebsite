"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Info,
  Landmark,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Search,
  ShieldAlert,
  ShoppingBag,
  Trash2,
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
import { Product, Customer, QuoteItem, Quote, Invoice, Receipt, ExpiryLot } from "@/types";
import { expiryState, NEAR_EXPIRY_MONTHS } from "@/lib/db/expiry";
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
  const [step, setStep] = useState(editInvoiceNumber ? 3 : fromQuoteNumber ? 1 : 0);
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
        setStep(3);
      } else {
        fetch(`/api/invoices/${encodeURIComponent(editInvoiceNumber)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && !data.error) {
              populateFormWithInvoice(data);
              setStep(3);
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

        setStep(1);
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
    setShowCustomerDropdown(false);
    goTo(1);
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
  // Salesman: below price / FOC only from stock expiring within 6 months; never expired stock.
  const expiryProblem = (item: InvoiceItemWithManual): string | null => {
    if (!isSalesmanUser) return null;
    const lot = lotOf(item);
    const state = expiryState(lot?.expiryDate, todayStr);
    if (state === "expired") return `${item.productName}: this stock has expired. Choose another expiry date.`;
    const list = item.listPrice ?? item.price;
    if (list > 0 && rateOf(item) < list - 0.0005 && state !== "near") {
      return `${item.productName}: ${rateOf(item) <= 0.0005 ? "FOC" : "a price below list"} is only allowed on stock expiring within ${NEAR_EXPIRY_MONTHS} months.`;
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
  const maxStep = !selectedCustomerId ? 0 : productsBlocker ? 1 : paymentBlocker ? 2 : 3;
  const STEPS: WizardStep[] = [
    { label: "Customer", icon: Users },
    { label: "Products", icon: Package },
    { label: "Payment", icon: CreditCard },
    { label: "Review", icon: ClipboardCheck },
  ];
  const stepHint = step === 0 ? "Choose a customer" : step === 1 ? productsBlocker : step === 2 ? paymentBlocker : null;
  const METHODS = [
    { key: "Cash", icon: Wallet, hint: "Adds to your cash in hand" },
    { key: "Bank Transfer", icon: Landmark, hint: "Reference needed" },
    { key: "Cheque", icon: FileText, hint: "Paid once it clears" },
    { key: "Other", icon: CreditCard, hint: "Card or anything else" },
  ] as const;

  const input =
    "w-full px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";
  const label = "block text-sm font-medium text-slate-700 mb-1.5";

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
            invoiceIds={saved.invoiceIds}
            invoiceIdsForReceipts={saved.paid ? saved.invoiceIds : []}
            newHref="/invoices/new"
            newLabel="New invoice"
            listHref="/invoices"
            listLabel="Go to invoices"
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
                title="Who is this invoice for?"
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
                          <div className="text-right shrink-0">
                            {(c.pendingBillwiseAmount || 0) > 0 ? (
                              <span className="inline-block text-xs font-medium text-rose-700 bg-rose-50 rounded-full px-2 py-0.5">{money(c.pendingBillwiseAmount || 0)}</span>
                            ) : (
                              <span className="inline-block text-xs text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">Clear</span>
                            )}
                            {c.cashOnly && <div className="text-[11px] text-amber-700 mt-1">Cash only</div>}
                          </div>
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
                title="What are they buying?"
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
                              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 ${
                                off ? "opacity-50 cursor-not-allowed" : i === activeProduct ? "bg-slate-100" : ""
                              }`}
                            >
                              <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0">
                                <Package className="w-4 h-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                                <div className={`text-xs ${stock <= 0 ? "text-rose-700" : "text-slate-500"}`}>
                                  {off ? "Not available" : `${stock} in stock`}
                                  {inList ? ` · ${inList.quantity} on this invoice` : ""}
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

                {invoiceItems.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                    <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600">No products yet</p>
                    <p className="text-xs text-slate-400 mt-1">Search above and press Enter to add.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {invoiceItems.map((item, idx) => {
                      const stock = stockFor(String(item.productId));
                      const qty = Number(item.quantity) || 0;
                      const short = qty > stock;
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
                          className={`wiz-in rounded-xl border p-4 transition ${zero || short ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}
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
                                <span className={`text-[11px] rounded-full px-2 py-0.5 ${short ? "text-rose-800 bg-rose-100" : "text-slate-600 bg-slate-100"}`}>
                                  {short ? `Only ${stock} in stock` : `${stock} in stock`}
                                </span>
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
                              <div className={`inline-flex items-center rounded-xl border bg-white ${zero || short ? "border-rose-300" : "border-slate-200"}`}>
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
                              <span className="block text-xs text-slate-500 mb-1.5">Rate ({currencyCode})</span>
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
                          {(() => {
                            const lots = lotsByProduct.get(String(item.productId)) || [];
                            const chosen = lots.find((l) => l.id === item.batchId);
                            const state = expiryState(chosen?.expiryDate, todayStr);
                            const problem = expiryProblem(item);
                            const fmt = (d: string | null) =>
                              d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No date";
                            return (
                              <div className="mt-3 pt-3 border-t border-slate-100">
                                {lots.length === 0 ? (
                                  <p className="text-xs text-slate-400">
                                    No expiry dates recorded for this product.
                                    {isSalesmanUser && " It can only be sold at the list price."}
                                  </p>
                                ) : (
                                  <label className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className="text-xs text-slate-500 shrink-0">Expiry</span>
                                    <select
                                      value={item.batchId || ""}
                                      onChange={(e) => setLineLot(idx, e.target.value)}
                                      className={`h-10 px-3 rounded-xl border text-sm bg-white flex-1 sm:max-w-sm ${
                                        state === "expired" ? "border-rose-300 text-rose-800" : state === "near" ? "border-amber-300 text-amber-900" : "border-slate-200 text-slate-800"
                                      }`}
                                    >
                                      <option value="">Not chosen</option>
                                      {lots.map((l) => {
                                        const st = expiryState(l.expiryDate, todayStr);
                                        const blocked = isSalesmanUser && st === "expired";
                                        return (
                                          <option key={l.id} value={l.id} disabled={blocked}>
                                            {fmt(l.expiryDate)} · {l.qtyRemaining} left
                                            {st === "expired" ? " · expired" : st === "near" ? " · near expiry" : ""}
                                            {l.needsCheck ? " · to confirm" : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    {state === "near" && (
                                      <span className="text-[11px] font-medium text-amber-900 bg-amber-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                                        Near expiry · discount / FOC allowed
                                      </span>
                                    )}
                                    {chosen && Number(item.quantity) > chosen.qtyRemaining && (
                                      <span className="text-[11px] text-rose-800 bg-rose-100 rounded-full px-2 py-0.5 whitespace-nowrap">Only {chosen.qtyRemaining} at this date</span>
                                    )}
                                  </label>
                                )}
                                {problem && (
                                  <p className="wiz-in mt-2 flex items-start gap-1.5 text-xs text-rose-800">
                                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    {problem}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {invoiceItems.length > 0 && (
                  <p className="text-xs text-slate-400 mt-4">
                    Leave Rate empty to charge the list price. Enter 0 for a free unit.
                    {isSalesmanUser && ` Discounts and FOC only on stock expiring within ${NEAR_EXPIRY_MONTHS} months.`}
                  </p>
                )}

                {seriesSplit && seriesSplit.omanCount > 0 && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    {seriesSplit.uaeCount > 0
                      ? editInvoiceNumber
                        ? "UAE- and Oman-registered products can't share one invoice. Move one kind to a separate invoice."
                        : `This will save as two invoices: UAE-registered ${money(seriesSplit.uaeTotal)} and Oman-registered ${money(seriesSplit.omanTotal)}.`
                      : "Oman-registered products only: saved with its own number and printed without the company header."}
                  </p>
                )}
              </StepPanel>
            )}

            {/* STEP 3: PAYMENT */}
            {step === 2 && (
              <StepPanel stepKey="payment" icon={CreditCard} title="How are they paying?" subtitle={<>Invoice total <span className="font-semibold text-slate-800">{money(grandTotal)}</span></>}>
                {cashOnly && (
                  <p className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    {selectedCustomer?.cashOnlyReason || "A cheque from this customer bounced."} Cash only: no credit and no cheques.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ChoiceTile selected={status === "Paid"} icon={CheckCircle} title="Paid now" hint="A receipt is made with the invoice" onClick={() => setStatus("Paid")} />
                  <ChoiceTile
                    selected={status === "Credit"}
                    disabled={cashOnly}
                    icon={Clock}
                    title="On credit"
                    hint={cashOnly ? "Not allowed for this customer" : "Customer pays later"}
                    onClick={() => setStatus("Credit")}
                  />
                </div>

                {status === "Paid" ? (
                  <div key="paid" className="wiz-in mt-7">
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

                    {askDetails && paymentMethod === "Cheque" && (
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
                            <input value={payBank} onChange={(e) => setPayBank(e.target.value)} className={input} placeholder="e.g. Emirates NBD" />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">The invoice counts as paid once the office marks the cheque cleared.</p>
                      </div>
                    )}

                    {askDetails && paymentMethod === "Bank Transfer" && (
                      <div key="transfer" className="wiz-in mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
                          <Landmark className="w-4 h-4 text-accent" /> Transfer details
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="block">
                            <span className={label}>Transfer reference</span>
                            <input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} className={input} placeholder="Ref. no. on the transfer slip" />
                          </label>
                          <label className="block">
                            <span className={label}>
                              From bank <span className="font-normal text-slate-400">(optional)</span>
                            </span>
                            <input value={payBank} onChange={(e) => setPayBank(e.target.value)} className={input} placeholder="e.g. ADCB" />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div key="credit" className="wiz-in mt-7">
                    <span className={label}>Due in</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {[30, 60, 90].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setCreditDays(d)}
                          className={`px-5 py-3 min-h-[48px] rounded-xl text-sm font-semibold border-2 transition ${
                            creditDaysNum === d ? "border-accent bg-accent-light/60 text-accent" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {d} days
                        </button>
                      ))}
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
                          className={`${input} w-24 h-12 text-center font-semibold`}
                          aria-label="Credit days"
                        />
                        <span className="text-sm text-slate-500">days</span>
                      </div>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <Calendar className="w-4 h-4 text-accent" /> Due on <span className="font-semibold text-slate-900">{dueDateLabel}</span>
                    </p>
                  </div>
                )}

                <div className="mt-7 pt-6 border-t border-slate-100">
                  {showNotes ? (
                    <label className="block wiz-in">
                      <span className={label}>Note on the invoice</span>
                      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
                    </label>
                  ) : (
                    <button type="button" onClick={() => setShowNotes(true)} className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:bg-accent-light rounded-lg px-2.5 py-1.5 -mx-2.5 transition">
                      <MessageSquare className="w-4 h-4" /> Add a note
                    </button>
                  )}
                </div>
              </StepPanel>
            )}

            {/* STEP 4: REVIEW */}
            {step === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
                <div className="space-y-5 min-w-0">
                  <ReviewSection icon={User} title="Customer" onEdit={editInvoiceNumber ? undefined : () => goTo(0)}>
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

                  <ReviewSection icon={Package} title={`Products · ${invoiceItems.length} ${invoiceItems.length === 1 ? "line" : "lines"}, ${unitsTotal} units`} onEdit={() => goTo(1)} delay={60}>
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
                          {invoiceItems.map((item) => {
                            const rateNum = Number(item.discountPrice !== "" && item.discountPrice !== undefined ? item.discountPrice : item.price);
                            return (
                              <tr key={item.productId}>
                                <td className="py-3 px-1 text-slate-900">
                                  {item.productName}
                                  {lotOf(item)?.expiryDate && (
                                    <span className={`block text-[11px] ${expiryState(lotOf(item)?.expiryDate, todayStr) === "near" ? "text-amber-800" : "text-slate-500"}`}>
                                      Exp. {new Date(`${lotOf(item)!.expiryDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-1 text-right text-slate-700">{item.quantity}</td>
                                <td className="py-3 px-1 text-right text-slate-700">{rateNum.toFixed(dp)}</td>
                                <td className="py-3 px-1 text-right font-medium text-slate-900">{(Number(item.total) || 0).toFixed(dp)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {seriesSplit && seriesSplit.omanCount > 0 && seriesSplit.uaeCount > 0 && !editInvoiceNumber && (
                      <p className="mt-4 flex items-start gap-2 text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Saves as two invoices: UAE-registered {money(seriesSplit.uaeTotal)} and Oman-registered {money(seriesSplit.omanTotal)}.
                      </p>
                    )}
                  </ReviewSection>

                  <ReviewSection icon={CreditCard} title="Payment" onEdit={() => goTo(2)} delay={120}>
                    <div className="flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-xl grid place-items-center ${status === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {status === "Paid" ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                      </span>
                      <div>
                        {status === "Paid" ? (
                          <>
                            <div className="font-semibold text-slate-900">Paid now · {methodLabel(paymentMethod)}</div>
                            {askDetails && paymentMethod === "Cheque" && (
                              <div className="text-sm text-slate-500">
                                Cheque {chequeNumber} dated {fmtDate(chequeDate)}
                                {payBank ? ` · ${payBank}` : ""}
                              </div>
                            )}
                            {askDetails && paymentMethod === "Bank Transfer" && (
                              <div className="text-sm text-slate-500">
                                Ref. {transferRef}
                                {payBank ? ` · ${payBank}` : ""}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="font-semibold text-slate-900">On credit · {creditDaysNum} days</div>
                            <div className="text-sm text-slate-500">Due {dueDateLabel}</div>
                          </>
                        )}
                      </div>
                    </div>
                    {notes && <p className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-lg px-3 py-2">{notes}</p>}
                  </ReviewSection>
                </div>

                <div className="space-y-5 lg:sticky lg:top-6">
                  <section className="wiz-in rounded-2xl overflow-hidden shadow-lg shadow-primary/10" style={{ animationDelay: "80ms" }}>
                    <div className="bg-gradient-to-br from-primary to-accent text-white px-6 py-6">
                      <div className="text-xs uppercase tracking-wide text-white/70">Invoice total</div>
                      <div className="text-3xl font-semibold mt-1">{money(grandTotal)}</div>
                      <div className="text-sm text-white/80 mt-1">
                        {unitsTotal} units · {status === "Paid" ? `paid by ${methodLabel(paymentMethod).toLowerCase()}` : `due ${dueDateLabel}`}
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
                          <Hash className="w-3.5 h-3.5" /> Invoice no.
                        </dt>
                        <dd>
                          {canEditNumber ? (
                            <input
                              value={invoiceNumber}
                              onChange={(e) => {
                                setInvoiceNumber(e.target.value);
                                setIsCustomInvoiceNumber(true);
                              }}
                              className="w-28 px-2 py-1 border border-slate-200 focus:border-accent rounded-lg font-semibold text-right text-slate-900 bg-white focus:outline-none"
                            />
                          ) : (
                            <span className="font-semibold text-slate-900">{editInvoiceNumber || invoiceNumber || "—"}</span>
                          )}
                        </dd>
                      </div>
                      <p className="text-[11px] text-slate-400 text-right">
                        {canEditNumber
                          ? isCustomInvoiceNumber
                            ? "New numbers will continue after this one"
                            : editInvoiceNumber
                              ? "You can change the number"
                              : "Next in the series. Type to use another"
                          : editInvoiceNumber
                            ? ""
                            : "Final number is given on save"}
                      </p>
                    </dl>
                  </section>

                  {selectedCustomerId && !editInvoiceNumber && (
                    <AccountSnapshot
                      customerId={selectedCustomerId}
                      change={{ kind: "invoice", amount: grandTotal, credit: status === "Credit", cheque: status === "Paid" && paymentMethod === "Cheque" }}
                    />
                  )}
                </div>
              </div>
            )}

            <WizardBar
              step={step}
              onBack={() => goTo(step - 1)}
              cancelHref="/invoices"
              summaryLabel={step >= 1 && invoiceItems.length > 0 ? `${unitsTotal} units` : undefined}
              summaryValue={step >= 1 && invoiceItems.length > 0 ? money(grandTotal) : undefined}
              next={
                step < 3
                  ? { label: step === 2 ? "Review" : "Next", disabled: step >= maxStep, onClick: () => goTo(step + 1), hint: stepHint }
                  : { label: isSaving ? "Saving…" : editInvoiceNumber ? "Save changes" : "Save invoice", disabled: isSaving || maxStep < 3, submit: true, tone: "accent" }
              }
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
