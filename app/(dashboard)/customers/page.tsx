"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Customer, UserCountry } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { Plus, X, CheckCircle2, RotateCw, AlertTriangle, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { ActionDropdown } from "@/components/ActionDropdown";
import { useAuth } from "@/hooks/useAuth";
import { SuperAdminCustomersView } from "@/components/SuperAdminCustomersView";

const COUNTRY_OPTIONS: UserCountry[] = ["UAE", "Oman"];

interface SalespersonOption {
  id: string;
  full_name: string;
  email: string;
  country: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const { t } = useLanguage();

  // Salespeople options for assignment
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [formCompany, setFormCompany] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formCountry, setFormCountry] = useState<UserCountry>("UAE");
  const [formCreditLimit, setFormCreditLimit] = useState("");
  const [formAssignedSalesmanId, setFormAssignedSalesmanId] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delete modal state
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/customers?refresh=true&t=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Failed to load customers from database");
        setCustomers([]);
      } else {
        setCustomers(data.customers || []);
      }
    } catch (err: any) {
      console.error("Failed to load customers:", err);
      setLoadError(err?.message || "Network error loading customers");
    } finally {
      setLoading(false);
    }
  };

  const loadSalespeople = async (country: UserCountry) => {
    try {
      const res = await fetch(`/api/salespeople?country=${country}`);
      const data = await res.json();
      setSalespeople(data.salespeople || []);
    } catch (err) {
      console.error("Failed to load salespeople options:", err);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (isModalOpen && user && user.role !== "salesperson") {
      loadSalespeople(formCountry);
    }
  }, [formCountry, isModalOpen, user]);

  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (statusFilter === "active") {
      list = list.filter((c) => c.is_active !== false);
    } else if (statusFilter === "inactive") {
      list = list.filter((c) => c.is_active === false);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(query)) ||
          (c.company && c.company.toLowerCase().includes(query)) ||
          (c.customerCode && c.customerCode.toLowerCase().includes(query)) ||
          (c.phone && c.phone.includes(query)) ||
          (c.email && c.email.toLowerCase().includes(query)) ||
          (c.assignedSalesmanName && c.assignedSalesmanName.toLowerCase().includes(query))
      );
    }
    return [...list].reverse();
  }, [customers, searchQuery, statusFilter]);

  const openAddModal = () => {
    const userCountryVal: UserCountry = user?.country === "Oman" ? "Oman" : "UAE";
    setEditingCustomer(null);
    setFormCompany("");
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormLocation("");
    setFormCity("");
    setFormCountry(userCountryVal);
    setFormCreditLimit("0");
    setFormAssignedSalesmanId(user?.role === "salesperson" ? user.id : "");
    setFormNotes("");
    setErrorMessage(null);
    setFormSuccess(false);
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormCompany(customer.company || customer.companyName || "");
    setFormName(customer.doctorName || customer.name || "");
    setFormEmail(customer.email || "");
    setFormPhone(customer.phone || "");
    setFormLocation(customer.address || "");
    setFormCity(customer.city || "");
    setFormCountry(customer.country === "Oman" ? "Oman" : "UAE");
    setFormCreditLimit(String(customer.creditLimit ?? 0));
    setFormAssignedSalesmanId(customer.assignedSalesmanId || "");
    setFormNotes(customer.notes || "");
    setErrorMessage(null);
    setFormSuccess(false);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formCompany || !formCompany.trim()) {
      setErrorMessage("Company / Clinic Name is required.");
      return;
    }

    setIsSubmitting(true);
    const isEdit = !!editingCustomer;

    const payload: any = {
      id: editingCustomer?.id,
      company: formCompany.trim(),
      companyName: formCompany.trim(),
      name: formName.trim(),
      doctorName: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      address: formLocation.trim(),
      city: formCity.trim(),
      country: formCountry,
      creditLimit: parseFloat(formCreditLimit) || 0,
      notes: formNotes.trim(),
    };

    if (user?.role !== "salesperson" && formAssignedSalesmanId) {
      payload.assignedSalesmanId = formAssignedSalesmanId;
    }

    try {
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch("/api/customers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();

      if (res.ok && resData.success) {
        setFormSuccess(true);
        setTimeout(() => {
          setIsModalOpen(false);
          setEditingCustomer(null);
          setFormSuccess(false);
          setErrorMessage(null);
          loadCustomers();
        }, 800);
      } else {
        const errText = resData.error || `Failed to ${isEdit ? "update" : "create"} customer`;
        setErrorMessage(errText);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Network error submitting customer form");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/customers?id=${deletingCustomer.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeletingCustomer(null);
        loadCustomers();
      } else {
        alert(data.error || "Failed to deactivate customer");
      }
    } catch (err: any) {
      alert(err.message || "Failed to deactivate customer");
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    {
      header: t("companyHeader") || "Clinic / Farm Company",
      accessor: (row: Customer) => (
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/customers/${row.id}`}
              className="font-extrabold text-slate-900 hover:text-accent transition flex items-center gap-1.5"
            >
              {row.company}
            </Link>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                row.is_active !== false
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {row.is_active !== false ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="text-xs text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
            <span>{row.address || row.city || "No address"}</span>
            {row.country && <span className="text-slate-300">• {row.country}</span>}
            {row.assignedSalesmanName && (
              <span className="text-accent font-bold">• Sales: {row.assignedSalesmanName}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: t("doctorHeader") || "Primary Contact Doctor",
      accessor: (row: Customer) => (
        <span className="font-bold text-slate-800">
          {row.name || row.doctorName || "—"}
        </span>
      ),
      className: "w-48",
    },
    {
      header: "Pending Billwise Balance",
      accessor: (row: Customer) => {
        const amt = Math.max(0, row.pendingBillwiseAmount || 0);
        return (
          <span className={`font-extrabold ${amt > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            AED {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
      className: "w-48 text-right",
    },
    {
      header: t("phoneHeader") || "Phone & Email",
      accessor: (row: Customer) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-850">{row.phone || "—"}</span>
          {row.email && <span className="text-xs text-slate-400">{row.email}</span>}
        </div>
      ),
      className: "w-44",
    },
    {
      header: "Actions",
      accessor: (row: Customer) => (
        <ActionDropdown
          options={[
            { label: "View Ledger & Details", onClick: () => router.push(`/customers/${row.id}`) },
            { label: "Edit Customer", onClick: () => openEditModal(row) },
            { label: "Issue Receipt", onClick: () => router.push(`/receipts/new?customerId=${row.id}`) },
            { label: "Create Quote", onClick: () => router.push(`/quotes/new?customerId=${row.id}`) },
            { label: "Create Invoice", onClick: () => router.push(`/invoices/new?customerId=${row.id}`) },
            { label: "Deactivate Customer", onClick: () => setDeletingCustomer(row), danger: true },
          ]}
        />
      ),
      className: "w-32 text-center",
    },
  ];

  if (authLoading || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("customersTitle") || "Customers & Accounts"}
          description={t("customersDesc") || "Manage veterinary clinics, equestrian centers, livestock farms, and key contact details."}
        />
        <LoadingSkeleton type="table" count={5} />
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin" || user?.role === "super_admin";

  if (isSuperAdmin) {
    return (
      <SuperAdminCustomersView
        customers={customers}
        loading={loading}
        loadError={loadError}
        onRefresh={loadCustomers}
        onCustomerUpdated={loadCustomers}
      />
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title={t("customersTitle") || "Customers & Accounts"}
        description={t("customersDesc") || "Manage veterinary clinics, equestrian centers, livestock farms, and key contact details."}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold disabled:opacity-50 transition cursor-pointer backdrop-blur-xs"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>{t("syncCatalog") || "Sync Customers"}</span>
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>{t("addCustomer") || "Add Customer"}</span>
            </button>
          </div>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {loadError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-700 text-sm font-semibold">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={loadCustomers}
              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold transition"
            >
              Retry
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
          <div className="flex-1">
            <SearchInput
              placeholder={t("searchCustomersPlaceholder") || "Search by clinic name, doctor, code, phone, or salesperson..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-slate-200/80 shadow-2xs min-h-[52px]">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === "all" ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === "active" ? "bg-emerald-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active ({customers.filter((c) => c.is_active !== false).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === "inactive" ? "bg-rose-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Inactive ({customers.filter((c) => c.is_active === false).length})
            </button>
          </div>
        </div>

      {loading ? (
        <LoadingSkeleton type="table" />
      ) : (
        <DataTable
          data={filteredCustomers}
          columns={columns}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/customers/${row.id}`)}
          emptyTitle="No veterinary clinics found"
          emptyDescription="Try adjusting search parameters or filter toggles."
        />
      )}

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {formSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
                <h4 className="text-lg font-bold text-slate-900">
                  {editingCustomer ? "Customer Updated" : "Customer Added"}
                </h4>
                <p className="text-sm text-slate-500">The account database has been updated.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingCustomer ? "Edit Customer" : "Add New Customer"}
                  </h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {errorMessage && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                    {errorMessage}
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Clinic / Farm Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Al Saad Vet Pharmacy"
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Primary Contact Doctor Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Junaid"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Country *
                    </label>
                    {user?.role === "salesperson" || editingCustomer ? (
                      <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-bold flex items-center justify-between">
                        <span>{formCountry}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded">
                          {editingCustomer ? "Immutable" : "Locked"}
                        </span>
                      </div>
                    ) : (
                      <select
                        value={formCountry}
                        onChange={(e) => setFormCountry(e.target.value as UserCountry)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {user?.role !== "salesperson" && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Assigned Salesperson ({formCountry})
                      </label>
                      <select
                        value={formAssignedSalesmanId}
                        onChange={(e) => setFormAssignedSalesmanId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                      >
                        <option value="">-- No Salesperson Assigned --</option>
                        {salespeople.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.full_name} ({sp.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. +971 50 123 4567"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        City
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dubai / Muscat"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. clinic@example.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Address / Location Details
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Street 14, Industrial Area 3"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Credit Limit ({formCountry === "Oman" ? "OMR" : "AED"})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formCreditLimit}
                      onChange={(e) => setFormCreditLimit(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Notes / Account Remarks
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Prefer payment via cheque. VIP client."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-5 py-3 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !formCompany.trim()}
                      className="px-5 py-3 text-sm font-bold text-white bg-[#1B2A4A] hover:bg-[#15223c] rounded-xl transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? "Saving..." : editingCustomer ? "Update Customer" : "Save Customer"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete / Soft Deactivate Confirmation Modal */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Deactivate Customer</h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to deactivate <span className="font-bold text-slate-900">{deletingCustomer.company}</span>? Historical invoices, quotations, and receipts will remain intact.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
