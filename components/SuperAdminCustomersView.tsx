"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ActionDropdown } from "@/components/ActionDropdown";
import { Customer, UserCountry } from "@/types";
import {
  Plus,
  RotateCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Users,
  Building2,
  CreditCard,
  MapPin,
  UserCheck,
  ShieldAlert,
  FilterX,
} from "lucide-react";

const COUNTRY_OPTIONS: UserCountry[] = ["UAE", "Oman"];

interface SalespersonOption {
  id: string;
  full_name: string;
  email: string;
  country: string;
}

interface SuperAdminCustomersViewProps {
  customers: Customer[];
  loading: boolean;
  loadError: string | null;
  onRefresh: () => void;
  onCustomerUpdated: () => void;
}

export function SuperAdminCustomersView({
  customers,
  loading,
  loadError,
  onRefresh,
  onCustomerUpdated,
}: SuperAdminCustomersViewProps) {
  const router = useRouter();

  // Search and Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<"all" | UserCountry>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [salespersonFilter, setSalespersonFilter] = useState<string>("all");
  const [creditFilter, setCreditFilter] = useState<"all" | "outstanding" | "clear">("all");

  // All salespeople list (for filters and modal)
  const [allSalespeople, setAllSalespeople] = useState<SalespersonOption[]>([]);
  const [modalSalespeople, setModalSalespeople] = useState<SalespersonOption[]>([]);

  // Modal states
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

  // Deactivate modal state
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load all salespeople across UAE & Oman for the filter dropdown
  useEffect(() => {
    async function fetchAllSalespeople() {
      try {
        const res = await fetch("/api/salespeople");
        const data = await res.json();
        setAllSalespeople(data.salespeople || []);
      } catch (err) {
        console.error("Failed to load all salespeople:", err);
      }
    }
    fetchAllSalespeople();
  }, []);

  // Load salespeople for modal based on formCountry
  useEffect(() => {
    if (isModalOpen) {
      async function fetchModalSalespeople() {
        try {
          const res = await fetch(`/api/salespeople?country=${formCountry}`);
          const data = await res.json();
          setModalSalespeople(data.salespeople || []);
        } catch (err) {
          console.error("Failed to load modal salespeople:", err);
        }
      }
      fetchModalSalespeople();
    }
  }, [formCountry, isModalOpen]);

  // Compute live KPIs from actual customers array
  const kpis = useMemo(() => {
    const list = Array.isArray(customers) ? customers : [];
    const total = list.length;
    const active = list.filter((c) => c && c.is_active !== false).length;
    const inactive = total - active;

    const uaeCustomers = list.filter((c) => c && (c.country === "UAE" || !c.country));
    const omanCustomers = list.filter((c) => c && c.country === "Oman");

    const uaeOutstanding = uaeCustomers.reduce(
      (acc, c) => acc + Math.max(0, Number(c?.pendingBillwiseAmount) || 0),
      0
    );
    const omanOutstanding = omanCustomers.reduce(
      (acc, c) => acc + Math.max(0, Number(c?.pendingBillwiseAmount) || 0),
      0
    );

    const uaeCreditLimit = uaeCustomers.reduce((acc, c) => acc + (Number(c?.creditLimit) || 0), 0);
    const omanCreditLimit = omanCustomers.reduce((acc, c) => acc + (Number(c?.creditLimit) || 0), 0);

    const totalOutstandingCount = list.filter(
      (c) => (Number(c?.pendingBillwiseAmount) || 0) > 0
    ).length;

    return {
      total,
      active,
      inactive,
      uaeCount: uaeCustomers.length,
      omanCount: omanCustomers.length,
      uaeOutstanding,
      omanOutstanding,
      uaeCreditLimit,
      omanCreditLimit,
      totalOutstandingCount,
    };
  }, [customers]);

  // Filter logic
  const filteredCustomers = useMemo(() => {
    let list = customers;

    // Country filter
    if (countryFilter !== "all") {
      list = list.filter((c) => c.country === countryFilter);
    }

    // Status filter
    if (statusFilter === "active") {
      list = list.filter((c) => c.is_active !== false);
    } else if (statusFilter === "inactive") {
      list = list.filter((c) => c.is_active === false);
    }

    // Salesperson filter
    if (salespersonFilter !== "all") {
      if (salespersonFilter === "unassigned") {
        list = list.filter((c) => !c.assignedSalesmanId);
      } else {
        list = list.filter((c) => c.assignedSalesmanId === salespersonFilter);
      }
    }

    // Credit status filter
    if (creditFilter === "outstanding") {
      list = list.filter((c) => (c.pendingBillwiseAmount || 0) > 0);
    } else if (creditFilter === "clear") {
      list = list.filter((c) => (c.pendingBillwiseAmount || 0) <= 0);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.companyName && c.companyName.toLowerCase().includes(q)) ||
          (c.customerCode && c.customerCode.toLowerCase().includes(q)) ||
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.doctorName && c.doctorName.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.assignedSalesmanName && c.assignedSalesmanName.toLowerCase().includes(q))
      );
    }

    return [...list].reverse();
  }, [customers, countryFilter, statusFilter, salespersonFilter, creditFilter, searchQuery]);

  const hasActiveFilters =
    countryFilter !== "all" ||
    statusFilter !== "all" ||
    salespersonFilter !== "all" ||
    creditFilter !== "all" ||
    searchQuery.trim() !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setCountryFilter("all");
    setStatusFilter("all");
    setSalespersonFilter("all");
    setCreditFilter("all");
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormCompany("");
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormLocation("");
    setFormCity("");
    setFormCountry("UAE");
    setFormCreditLimit("0");
    setFormAssignedSalesmanId("");
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
      assignedSalesmanId: formAssignedSalesmanId || null,
    };

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
          onCustomerUpdated();
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

  const handleDeactivate = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/customers?id=${deletingCustomer.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeletingCustomer(null);
        onCustomerUpdated();
      } else {
        alert(data.error || "Failed to deactivate customer");
      }
    } catch (err: any) {
      alert(err.message || "Failed to deactivate customer");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCurrency = (amount: number, country: UserCountry) => {
    const symbol = country === "Oman" ? "OMR" : "AED";
    return `${symbol} ${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-[#1B2A4A] space-y-6">
      {/* Super Admin Administrative Control Center Header */}
      <PageHeader
        title="Customers"
        description="Manage customers, accounts, credit exposure and sales assignments."
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer shadow-2xs"
            >
              <RotateCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
              <span>Sync Customers</span>
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B2A4A] text-white font-bold hover:bg-[#15223c] transition shadow-md shadow-[#1B2A4A]/20 cursor-pointer text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Customer</span>
            </button>
          </div>
        }
      />

      {loadError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-700 text-sm font-semibold">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top Summary Row (Live KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Customers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total Customers
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{kpis.total}</h3>
            </div>
            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
              {kpis.active} Active
            </span>
            {kpis.inactive > 0 && (
              <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {kpis.inactive} Inactive
              </span>
            )}
          </div>
        </div>

        {/* Total Outstanding */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total Outstanding
              </p>
              <div className="mt-1">
                <div className="text-lg font-black text-rose-600">
                  AED {kpis.uaeOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                {kpis.omanOutstanding > 0 && (
                  <div className="text-xs font-extrabold text-rose-500">
                    OMR {kpis.omanOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            </div>
            <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 font-medium">
            {kpis.totalOutstandingCount} customer{kpis.totalOutstandingCount === 1 ? "" : "s"} with balance
          </p>
        </div>

        {/* Country Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Country Breakdown
            </p>
            <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-2 text-xs font-semibold">
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>🇦🇪 UAE</span>
                <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full">
                  {kpis.uaeCount}
                </span>
              </div>
              <span className="text-rose-600 font-extrabold">
                AED {kpis.uaeOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>🇴🇲 Oman</span>
                <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full">
                  {kpis.omanCount}
                </span>
              </div>
              <span className="text-rose-600 font-extrabold">
                OMR {kpis.omanOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter / Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Bar */}
          <div className="flex-1">
            <SearchInput
              placeholder="Search customers by company, code, doctor, phone, email, salesperson..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
            />
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Country Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mr-1">
                Country:
              </span>
              <button
                onClick={() => setCountryFilter("all")}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  countryFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setCountryFilter("UAE")}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  countryFilter === "UAE" ? "bg-slate-900 text-white shadow-2xs" : "hover:text-slate-900"
                }`}
              >
                UAE
              </button>
              <button
                onClick={() => setCountryFilter("Oman")}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  countryFilter === "Oman" ? "bg-slate-900 text-white shadow-2xs" : "hover:text-slate-900"
                }`}
              >
                Oman
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mr-1">
                Status:
              </span>
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  statusFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  statusFilter === "active" ? "bg-emerald-600 text-white shadow-2xs" : "hover:text-slate-900"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter("inactive")}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  statusFilter === "inactive" ? "bg-slate-700 text-white shadow-2xs" : "hover:text-slate-900"
                }`}
              >
                Inactive
              </button>
            </div>

            {/* Assigned Salesperson Dropdown */}
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
            >
              <option value="all">Salesperson: All</option>
              <option value="unassigned">Unassigned Only</option>
              {allSalespeople.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.full_name} ({sp.country})
                </option>
              ))}
            </select>

            {/* Credit Status Filter */}
            <select
              value={creditFilter}
              onChange={(e) => setCreditFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
            >
              <option value="all">Credit Status: All</option>
              <option value="outstanding">Outstanding Only</option>
              <option value="clear">No Outstanding (Clear)</option>
            </select>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Results counter indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold pt-1 border-t border-slate-100">
          <span>
            Showing <strong className="text-slate-900">{filteredCustomers.length}</strong> of{" "}
            <strong className="text-slate-900">{customers.length}</strong> customers
          </span>
          {hasActiveFilters && (
            <span className="text-slate-400 font-medium italic">Filtered view active</span>
          )}
        </div>
      </div>

      {/* Customer Data Table (Desktop & Tablet) & Cards (Mobile) */}
      {loading ? (
        <LoadingSkeleton type="table" />
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
          <h4 className="text-base font-bold text-slate-800">No Customers Found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? "No customers match your active search and filter criteria. Try clearing filters."
              : "No customer records have been added yet."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <FilterX className="w-4 h-4" /> Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View (hidden on small mobile screens) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Customer Code</th>
                    <th className="py-3.5 px-4">Doctor / Contact</th>
                    <th className="py-3.5 px-4">Salesperson</th>
                    <th className="py-3.5 px-4">Country</th>
                    <th className="py-3.5 px-4 text-right">Pending Balance</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm font-medium">
                  {filteredCustomers.map((row) => {
                    const outstanding = Math.max(0, row.pendingBillwiseAmount || 0);
                    const isOutstanding = outstanding > 0;

                    return (
                      <tr
                        key={row.id}
                        onClick={() => router.push(`/customers/${row.id}`)}
                        className="hover:bg-slate-50/80 transition cursor-pointer group"
                      >
                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          <Link
                            href={`/customers/${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-extrabold text-slate-900 hover:text-accent transition"
                          >
                            {row.company || row.companyName}
                          </Link>
                        </td>

                        {/* Customer Code */}
                        <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-600">
                          {row.customerCode || "—"}
                        </td>

                        {/* Doctor / Contact */}
                        <td className="py-3.5 px-4 font-bold text-slate-800 text-xs">
                          {row.doctorName || row.name || "—"}
                        </td>

                        {/* Salesperson (Subtle secondary text) */}
                        <td className="py-3.5 px-4 text-xs font-bold text-slate-700">
                          {row.assignedSalesmanName || <span className="text-slate-400 font-normal italic">Unassigned</span>}
                        </td>

                        {/* Country */}
                        <td className="py-3.5 px-4 text-xs font-bold text-slate-700">
                          {row.country}
                        </td>

                        {/* Pending Balance */}
                        <td className="py-3.5 px-4 text-right">
                          <span className={`font-extrabold text-xs ${isOutstanding ? "text-rose-600" : "text-emerald-600"}`}>
                            {formatCurrency(outstanding, row.country)}
                          </span>
                        </td>

                        {/* Status (Only meaningful status uses pills) */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              row.is_active !== false
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {row.is_active !== false ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* Last Activity */}
                        <td className="py-3.5 px-4 text-xs text-slate-500 font-semibold">
                          {formatDate(row.createdAt)}
                        </td>

                        {/* Actions */}
                        <td
                          className="py-3.5 px-4 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ActionDropdown
                            options={[
                              {
                                label: "View Ledger & Details",
                                onClick: () => router.push(`/customers/${row.id}`),
                              },
                              {
                                label: "Edit Customer",
                                onClick: () => openEditModal(row),
                              },
                              {
                                label: "Issue Receipt",
                                onClick: () =>
                                  router.push(`/receipts/new?customerId=${row.id}`),
                              },
                              {
                                label: "Create Quote",
                                onClick: () =>
                                  router.push(`/quotes/new?customerId=${row.id}`),
                              },
                              {
                                label: "Create Invoice",
                                onClick: () =>
                                  router.push(`/invoices/new?customerId=${row.id}`),
                              },
                              {
                                label:
                                  row.is_active !== false
                                    ? "Deactivate Customer"
                                    : "Activate Customer",
                                onClick: () => setDeletingCustomer(row),
                                danger: row.is_active !== false,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View (shown on screens < md) */}
          <div className="block md:hidden space-y-3">
            {filteredCustomers.map((row) => {
              const outstanding = Math.max(0, row.pendingBillwiseAmount || 0);
              const isOutstanding = outstanding > 0;

              return (
                <div
                  key={row.id}
                  onClick={() => router.push(`/customers/${row.id}`)}
                  className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 cursor-pointer active:scale-[0.99] transition"
                >
                  {/* Header Row */}
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-base">
                          {row.company || row.companyName}
                        </span>
                      </div>
                      {(row.doctorName || row.name) && (
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                          Dr: {row.doctorName || row.name}
                        </p>
                      )}
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <ActionDropdown
                        options={[
                          {
                            label: "View Ledger & Details",
                            onClick: () => router.push(`/customers/${row.id}`),
                          },
                          {
                            label: "Edit Customer",
                            onClick: () => openEditModal(row),
                          },
                          {
                            label: "Issue Receipt",
                            onClick: () =>
                              router.push(`/receipts/new?customerId=${row.id}`),
                          },
                          {
                            label: "Create Quote",
                            onClick: () =>
                              router.push(`/quotes/new?customerId=${row.id}`),
                          },
                          {
                            label: "Create Invoice",
                            onClick: () =>
                              router.push(`/invoices/new?customerId=${row.id}`),
                          },
                          {
                            label:
                              row.is_active !== false
                                ? "Deactivate Customer"
                                : "Activate Customer",
                            onClick: () => setDeletingCustomer(row),
                            danger: row.is_active !== false,
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px]">
                        Country & City
                      </span>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {row.country === "Oman" ? "🇴🇲 Oman" : "🇦🇪 UAE"}{" "}
                        {row.city ? `• ${row.city}` : ""}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px]">
                        Salesperson
                      </span>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {row.assignedSalesmanName || "Unassigned"}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px]">
                        Credit Limit
                      </span>
                      <p className="font-bold text-slate-700 mt-0.5">
                        {formatCurrency(row.creditLimit || 0, row.country)}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px]">
                        Outstanding
                      </span>
                      <div className="mt-0.5">
                        {isOutstanding ? (
                          <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            {formatCurrency(outstanding, row.country)}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Clear
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {formSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
                <h4 className="text-lg font-bold text-slate-900">
                  {editingCustomer ? "Customer Account Updated" : "New Customer Created"}
                </h4>
                <p className="text-sm text-slate-500">
                  The account and salesman assignments have been updated.
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {editingCustomer ? "Edit Customer Account" : "Add New Customer"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure company details, country, credit exposure and sales assignment.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {errorMessage && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* Company Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Company / Clinic / Farm Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Al Saad Veterinary Clinic"
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all font-semibold"
                    />
                  </div>

                  {/* Doctor Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Primary Contact Doctor / Representative Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Rashid Ahmad"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                    />
                  </div>

                  {/* Country Selection */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Country *
                      </label>
                      <select
                        value={formCountry}
                        onChange={(e) => {
                          const newCountry = e.target.value as UserCountry;
                          setFormCountry(newCountry);
                          setFormAssignedSalesmanId("");
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all cursor-pointer"
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c === "Oman" ? "🇴🇲 Oman" : "🇦🇪 UAE"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dubai / Muscat"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Assigned Salesperson */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Assigned Salesperson ({formCountry})
                    </label>
                    <select
                      value={formAssignedSalesmanId}
                      onChange={(e) => setFormAssignedSalesmanId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all cursor-pointer font-medium"
                    >
                      <option value="">-- No Salesperson Assigned --</option>
                      {modalSalespeople.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.full_name} ({sp.email})
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                      Only active salespeople in {formCountry} are shown.
                    </p>
                  </div>

                  {/* Phone & Email */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. +971 50 123 4567"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="e.g. clinic@example.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Address / Street Details
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Industrial Area 3, Street 14"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                    />
                  </div>

                  {/* Credit Limit & Outstanding Read-only info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
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
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Pending Balance (Read-Only)
                      </label>
                      <div className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-sm font-bold flex items-center justify-between">
                        <span>
                          {formatCurrency(
                            editingCustomer?.pendingBillwiseAmount || 0,
                            formCountry
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-200 px-1.5 py-0.5 rounded">
                          Auto-Calculated
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Notes / Account Remarks
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Prefer payment via cheque. VIP account."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 transition-all"
                    />
                  </div>

                  {/* Form Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !formCompany.trim()}
                      className="px-5 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] hover:bg-[#15223c] rounded-xl transition disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {isSubmitting
                        ? "Saving..."
                        : editingCustomer
                        ? "Update Customer"
                        : "Save Customer"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Deactivate / Soft Toggle Modal */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {deletingCustomer.is_active !== false
                ? "Deactivate Customer Account"
                : "Reactivate Customer Account"}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to{" "}
              {deletingCustomer.is_active !== false ? "deactivate" : "activate"}{" "}
              <strong className="text-slate-900">{deletingCustomer.company}</strong>?
              Historical invoices, quotations, and receipts remain completely intact.
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
                onClick={handleDeactivate}
                disabled={isDeleting}
                className={`px-4 py-2.5 text-sm font-bold text-white rounded-xl transition cursor-pointer disabled:opacity-50 ${
                  deletingCustomer.is_active !== false
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isDeleting
                  ? "Updating..."
                  : deletingCustomer.is_active !== false
                  ? "Deactivate"
                  : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
