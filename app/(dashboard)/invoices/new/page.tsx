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
  manualDiscount?: number;
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const editInvoiceNumber = searchParams.get("edit");
  const fromQuoteNumber = searchParams.get("fromQuote");
  const { user } = useAuth();
  
  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemWithManual[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"Paid" | "Credit">("Paid");
  const [creditDays, setCreditDays] = useState<number | string>(30);
  
  // Data loading states
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotesList, setQuotesList] = useState<Quote[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);
  
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
    // 1. Instant sync load from local storage to eliminate delay
    try {
      const localCusts = localStorage.getItem("maat_customers");
      if (localCusts) setCustomers(JSON.parse(localCusts));

      const localProds = localStorage.getItem("maat_products");
      if (localProds) setProducts(JSON.parse(localProds));

      const localQuotes = localStorage.getItem("maat_quotes");
      if (localQuotes) setQuotesList(JSON.parse(localQuotes));

      const localInvs = localStorage.getItem("maat_invoices");
      if (localInvs) setInvoicesList(JSON.parse(localInvs));

      if (localCusts && localProds) {
        setIsPageLoading(false);
      }
    } catch (e) {}

    // 2. Background fresh revalidation
    async function loadData() {
      try {
        const [prodRes, custRes, quotesRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/customers"),
          fetch("/api/quotes"),
        ]);

        const prodData = await prodRes.json();
        const custData = await custRes.json();
        const quotesData = await quotesRes.json();

        if (prodData.products) {
          setProducts(prodData.products);
          localStorage.setItem("maat_products", JSON.stringify(prodData.products));
        }

        if (custData.customers) {
          setCustomers(custData.customers);
          localStorage.setItem("maat_customers", JSON.stringify(custData.customers));
        }

        if (Array.isArray(quotesData) && quotesData.length > 0) {
          let localQ: Quote[] = [];
          try {
            const qStr = localStorage.getItem("maat_quotes");
            if (qStr) localQ = JSON.parse(qStr);
          } catch (e) {}

          const mergedQ = [...quotesData];
          localQ.forEach((lq) => {
            if (lq.quoteNumber && !mergedQ.some((rq) => rq.quoteNumber === lq.quoteNumber)) {
              mergedQ.unshift(lq);
            }
          });
          setQuotesList(mergedQ);
          localStorage.setItem("maat_quotes", JSON.stringify(mergedQ));
        }

        try {
          const invsRes = await fetch("/api/invoices");
          const invsData = await invsRes.json();
          if (Array.isArray(invsData) && invsData.length > 0) {
            let localI: Invoice[] = [];
            try {
              const iStr = localStorage.getItem("maat_invoices");
              if (iStr) localI = JSON.parse(iStr);
            } catch (e) {}

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
                id: item.invoiceNumber || `inv-${Date.now()}`,
                invoiceNumber: item.invoiceNumber || "",
                customerName: item.customerName || "",
                companyName: item.companyName || "",
                salesmanName: item.salesmanName || "",
                date: item.date || "",
                grandTotal: parseFloat(item.grandTotal) || 0,
                status: item.status || "Unpaid",
                items: [],
                subtotal: parseFloat(item.grandTotal) || 0,
                discountTotal: 0,
                taxTotal: 0,
              };
            });

            const mergedI = [...parsedInvoices];
            localI.forEach((li) => {
              if (li.invoiceNumber && !mergedI.some((ri) => ri.invoiceNumber === li.invoiceNumber)) {
                mergedI.unshift(li);
              }
            });

            setInvoicesList(mergedI);
            localStorage.setItem("maat_invoices", JSON.stringify(mergedI));
          }
        } catch (e) {}
      } catch (err) {
        console.error("Failed to load setup data:", err);
      } finally {
        setIsPageLoading(false);
      }
    }
    loadData();
  }, []);

  // Set default / prepopulated states once databases load
  useEffect(() => {
    if (isPageLoading || customers.length === 0) return;

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
        setInvoiceNumber(`INV-${quote.quoteNumber.replace("QT-", "")}`);
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

        setInvoiceItems(quote.items.map(item => ({
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
    // Mode C: NEW INVOICE FROM SCRATCH
    else if (!invoiceNumber) {
      // Generate default unique invoice number
      const count = invoicesList.length + 1;
      const dateSuffix = new Date().getFullYear();
      setInvoiceNumber(`INV-${dateSuffix}-0${String(count).padStart(3, "0")}`);
    }
  }, [editInvoiceNumber, fromQuoteNumber, quotesList, invoicesList, customers, isPageLoading]);

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
  const subtotal = useMemo(() => {
    return invoiceItems.reduce((acc, item) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const p = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);
      return acc + p * q;
    }, 0);
  }, [invoiceItems]);

  const grandTotal = useMemo(() => {
    return invoiceItems.reduce((acc, item) => {
      const q = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
      const d = typeof item.discount === "number" ? item.discount : (parseFloat(item.discount as any) || 0);
      return acc + d * q;
    }, 0);
  }, [invoiceItems]);

  const discountTotal = useMemo(() => {
    return subtotal - grandTotal;
  }, [subtotal, grandTotal]);

  const taxTotal = 0.00;

  // Handlers
  const handleAddProduct = (product: Product) => {
    const existingIndex = invoiceItems.findIndex((item) => item.productId === product.id);

    if (existingIndex > -1) {
      const updated = [...invoiceItems];
      const newQty = updated[existingIndex].quantity + 1;
      
      let tierPrice = product.price;
      if (newQty >= 100) {
        tierPrice = product.price100 ?? tierPrice;
      } else if (newQty >= 50) {
        tierPrice = product.price50 ?? tierPrice;
      } else if (newQty >= 10) {
        tierPrice = product.price10 ?? tierPrice;
      }

      const finalPrice = updated[existingIndex].manualDiscount !== undefined 
        ? (updated[existingIndex].manualDiscount ?? tierPrice)
        : tierPrice;

      updated[existingIndex].quantity = newQty;
      updated[existingIndex].price = product.price;
      updated[existingIndex].discount = finalPrice;
      updated[existingIndex].total = newQty * finalPrice;
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([
        ...invoiceItems,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          price: product.price,
          discount: product.price,
          manualDiscount: undefined,
          total: product.price,
        },
      ]);
    }
    setSearchQuery("");
    setShowProductDropdown(false);
  };

  const handleUpdateQuantity = (index: number, val: number | string) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const product = products.find((p) => p.id === item.productId);
    const basePrice = product ? product.price : item.price;

    const numQty = typeof val === "number" ? val : (parseInt(val, 10) || 0);
    let tierPrice = basePrice;
    if (product && numQty > 0) {
      if (numQty >= 100) tierPrice = product.price100 ?? tierPrice;
      else if (numQty >= 50) tierPrice = product.price50 ?? tierPrice;
      else if (numQty >= 10) tierPrice = product.price10 ?? tierPrice;
    }

    const finalPrice = item.manualDiscount !== undefined ? item.manualDiscount : tierPrice;
    const discNum = typeof finalPrice === "number" ? finalPrice : (parseFloat(finalPrice as any) || 0);

    updated[index].quantity = val as any;
    updated[index].price = basePrice;
    updated[index].discount = finalPrice;
    updated[index].total = numQty * discNum;
    setInvoiceItems(updated);
  };

  const handleUpdateDiscount = (index: number, val: number | string | undefined) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const numQty = typeof item.quantity === "number" ? item.quantity : (parseInt(item.quantity as any, 10) || 0);
    const discNum = typeof val === "number" ? val : (parseFloat(val as any) || 0);

    updated[index].manualDiscount = val as any;
    updated[index].discount = val as any;
    updated[index].total = numQty * discNum;
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
    if (!invoiceNumber.trim()) {
      setErrorMessage("Invoice Number is required");
      return;
    }

    // Check for duplicate invoice number if creating or editing to a different one
    const duplicate = invoicesList.some(
      (inv) => inv.invoiceNumber.toLowerCase().trim() === invoiceNumber.toLowerCase().trim() && inv.invoiceNumber !== editInvoiceNumber
    );
    if (duplicate) {
      setErrorMessage(`Invoice number ${invoiceNumber} already exists.`);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const dateStr = new Date().toISOString().split("T")[0];

    const newInvoice: Invoice = {
      id: editInvoiceNumber
        ? (invoicesList.find((i) => i.invoiceNumber === editInvoiceNumber)?.id || `inv-mock-${Date.now()}`)
        : `inv-mock-${Date.now()}`,
      invoiceNumber: invoiceNumber.trim(),
      quoteNumber: fromQuoteNumber || undefined,
      customerId: selectedCustomerId || `cust-manual-${Date.now()}`,
      customerName: selectedCustomer?.name || "",
      companyName: selectedCustomer?.company || customerSearchQuery.replace(/\s*\([^)]*\)/, "").trim(),

      salesmanId: user?.id || "user-salesman",
      salesmanName: user?.name || "Dr. Kaleemullah M.",
      date: dateStr,
      items: invoiceItems,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      status,
      creditDays: status === "Credit" ? (typeof creditDays === "number" ? creditDays : (parseInt(creditDays as string, 10) || 0)) : undefined,
      notes,
    };

    // 1. Instant local persistence & UI redirect
    let updatedInvoices = [...invoicesList];
    if (editInvoiceNumber) {
      const idx = updatedInvoices.findIndex((i) => i.invoiceNumber === editInvoiceNumber);
      if (idx > -1) {
        updatedInvoices[idx] = newInvoice;
      } else {
        updatedInvoices.unshift(newInvoice);
      }
    } else {
      updatedInvoices.unshift(newInvoice);
    }

    localStorage.setItem("maat_invoices", JSON.stringify(updatedInvoices));

    const mockIdx = mockInvoices.findIndex((i) => i.invoiceNumber === newInvoice.invoiceNumber);
    if (mockIdx > -1) {
      mockInvoices[mockIdx] = newInvoice;
    } else {
      mockInvoices.unshift(newInvoice);
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

    // 2. Non-blocking Background API Cloud Save, PDF Generation, and Auto Receipt creation
    (async () => {
      try {
        const doc = buildInvoicePDF(newInvoice);
        const pdfBase64 = doc.output("datauristring").split(",")[1];

        const productsSummary = invoiceItems
          .map((item) => `${item.quantity} x ${item.productName} (@ AED ${item.discount.toFixed(2)})`)
          .join(", ");

        const payload = {
          invoiceNumber: newInvoice.invoiceNumber,
          customerName: newInvoice.customerName,
          companyName: newInvoice.companyName,
          salesmanName: newInvoice.salesmanName,
          date: newInvoice.date,
          grandTotal: newInvoice.grandTotal,
          status: newInvoice.status === "Credit" ? `Credit (${creditDays} Days)` : newInvoice.status,
          fileName: `MAAT-INVOICE-${newInvoice.invoiceNumber}.pdf`,
          pdfBase64: pdfBase64,
          productsListText: productsSummary,
          invoiceJson: JSON.stringify(newInvoice),
        };

        await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("Background invoice save error:", err);
      }

      // Auto-create receipt voucher if payment status is 'Paid'
      if (status === "Paid") {
        try {
          const localRecsStr = localStorage.getItem("maat_receipts");
          const localRecs: Receipt[] = localRecsStr ? JSON.parse(localRecsStr) : [];
          const recCount = localRecs.length + 1;
          const year = new Date().getFullYear();
          const autoRecNum = `REC-${year}-0${String(recCount).padStart(3, "0")}`;

          const autoReceipt: Receipt = {
            id: `rec-${Date.now()}`,
            receiptNumber: autoRecNum,
            customerId: newInvoice.customerId,
            customerName: newInvoice.customerName,
            companyName: newInvoice.companyName,
            amountPaid: newInvoice.grandTotal,
            remainingPendingAmount: 0,
            paymentDate: newInvoice.date,
            paymentMethod: "Cash",
            referenceNo: `Auto-Paid for ${newInvoice.invoiceNumber}`,
            notes: `Auto-generated receipt voucher for Paid Invoice ${newInvoice.invoiceNumber}`,
            createdBy: user?.name || "Admin",
          };

          const updatedRecs = [autoReceipt, ...localRecs];
          localStorage.setItem("maat_receipts", JSON.stringify(updatedRecs));

          const recDoc = buildReceiptPDF(autoReceipt);
          const recPdfBase64 = recDoc.output("datauristring").split(",")[1];

          const recParams = new URLSearchParams();
          recParams.append("receiptNumber", autoReceipt.receiptNumber);
          recParams.append("companyName", autoReceipt.companyName);
          recParams.append("customerName", autoReceipt.customerName || "");
          recParams.append("amountPaid", autoReceipt.amountPaid.toString());
          recParams.append("paymentDate", autoReceipt.paymentDate);
          recParams.append("paymentMethod", autoReceipt.paymentMethod);
          recParams.append("referenceNo", autoReceipt.referenceNo || "");

          await fetch(`/api/receipts?${recParams.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiptNumber: autoReceipt.receiptNumber,
              customerName: autoReceipt.customerName,
              companyName: autoReceipt.companyName,
              amountPaid: autoReceipt.amountPaid,
              paymentDate: autoReceipt.paymentDate,
              paymentMethod: autoReceipt.paymentMethod,
              referenceNo: autoReceipt.referenceNo,
              fileName: `MAAT-RECEIPT-${autoReceipt.receiptNumber}.pdf`,
              pdfBase64: recPdfBase64,
            }),
          });
        } catch (recErr) {
          console.error("Failed to auto-create receipt for paid invoice:", recErr);
        }
      }

      if (status === "Credit" && newInvoice.companyName) {
        try {
          await fetch("/api/customers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyName: newInvoice.companyName,
              customerId: newInvoice.customerId,
              amountToAdd: newInvoice.grandTotal,
            }),
          });
        } catch (custErr) {
          console.error("Background pending update error:", custErr);
        }
      }
    })();
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
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[#61989B]">
        <Link href="/invoices" className="hover:text-[#4e7d80] transition flex items-center gap-1 text-sm font-bold">
          <ArrowLeft className="w-4.5 h-4.5" />
          Back to Invoices
        </Link>
      </div>

      <PageHeader
        title={editInvoiceNumber ? `Edit Invoice` : `New Invoice`}
        description={
          editInvoiceNumber
            ? `Modify billing items, payment status, or adjust notes for Ref: ${editInvoiceNumber}.`
            : `Draft a new invoice, set custom billing rates, or compile from an existing quotation.`
        }
      />

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
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Invoice Number (Editable)
              </label>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
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
                      {invoiceItems.map((item, idx) => (
                        <tr key={item.productId} className="align-middle">
                          <td className="px-4 py-4 font-bold text-slate-700">{item.productName}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-700">AED {item.price.toFixed(2)}</td>
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
                            <div className="relative flex items-center w-28 mx-auto">
                              <span className="absolute left-2.5 text-xs font-bold text-slate-400">AED</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={item.discount !== undefined && item.discount !== null ? item.discount : ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    handleUpdateDiscount(idx, "");
                                  } else {
                                    const parsed = parseFloat(raw);
                                    handleUpdateDiscount(idx, isNaN(parsed) ? "" : Math.max(0, parsed));
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full pl-10 pr-2 py-1.5 border border-slate-200 rounded-lg text-right font-bold text-sm focus:outline-none focus:border-accent text-slate-800"
                              />
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
