"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Customer } from "@/types";
import { useLanguage } from "@/context/LanguageContext";
import { Plus, X, CheckCircle2, RotateCw } from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useLanguage();

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formCompany, setFormCompany] = useState("");
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formPendingAmount, setFormPendingAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?refresh=true&t=${Date.now()}`);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error("Failed to load customers:", err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );
  }, [customers, searchQuery]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompany) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("company", formCompany);
    formData.append("name", formName);
    formData.append("location", formLocation);
    formData.append("pendingAmount", formPendingAmount || "0");

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setFormSuccess(true);
        setTimeout(() => {
          setIsModalOpen(false);
          setFormCompany("");
          setFormName("");
          setFormLocation("");
          setFormPendingAmount("");
          setFormSuccess(false);
          loadCustomers();
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to submit customer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      header: t("companyHeader") || "Clinic / Farm Company",
      accessor: (row: Customer) => (
        <div>
          <div className="font-extrabold text-slate-800">{row.company}</div>
          <div className="text-xs text-slate-400 font-semibold mt-0.5">{row.address}</div>
        </div>
      ),
    },
    {
      header: t("doctorHeader") || "Primary Contact Doctor",
      accessor: (row: Customer) => (
        <span className="font-bold text-slate-800">
          {row.name || "—"}
        </span>
      ),
      className: "w-48",
    },
    {
      header: "Pending Billwise Amount",
      accessor: (row: Customer) => {
        const amt = row.pendingBillwiseAmount || 0;
        return (
          <span className={`font-extrabold ${amt > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            AED {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
      className: "w-48 text-right",
    },
    {
      header: t("phoneHeader") || "Phone Number",
      accessor: (row: Customer) => (
        <span className="font-bold text-slate-850">
          {row.phone || "—"}
        </span>
      ),
      className: "w-36",
    },
  ];


  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customersTitle") || "Customers & Accounts"}
        description={t("customersDesc") || "Manage veterinary clinics, equestrian centers, livestock farms, and key contact details."}
        action={
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadCustomers}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Sync Customers
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-bold hover:bg-[#4e7d80] transition shadow-md shadow-[#61989B]/15 cursor-pointer text-sm"
            >
              <Plus className="w-5 h-5" /> Add Customer
            </button>
          </div>
        }
      />

      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <SearchInput
          placeholder="Search by clinic name, doctor, phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
        />
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
          Showing {filteredCustomers.length} Clients
        </div>
      </div>

      {/* Customers table */}
      {loading ? (
        <LoadingSkeleton type="table" />
      ) : (
        <DataTable
          data={filteredCustomers}
          columns={columns}
          keyExtractor={(row) => row.id}
          emptyTitle="No veterinary clinics found"
          emptyDescription="Try typing alternative names or phone prefixes."
        />
      )}

      {/* Add Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl relative">
            {formSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
                <h4 className="text-lg font-bold text-slate-900">Customer Added</h4>
                <p className="text-sm text-slate-500">The account database has been updated.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900">Add New Customer</h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* Company/Clinic Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Clinic / Farm Company Name
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

                  {/* Contact Doctor Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Primary Contact Doctor (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Junaid"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
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
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>

                  {/* Pending Billwise Amount */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Pending Billwise Amount (AED)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formPendingAmount}
                      onChange={(e) => setFormPendingAmount(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all"
                    />
                  </div>


                  {/* Modal Action buttons */}
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
                      disabled={isSubmitting || !formCompany}
                      className="px-5 py-3 text-sm font-bold text-white bg-[#1B2A4A] hover:bg-[#15223c] rounded-xl transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? "Adding..." : "Add Customer"}
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
