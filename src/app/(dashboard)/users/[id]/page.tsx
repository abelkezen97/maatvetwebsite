"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  UserCheck, 
  Users, 
  FileText, 
  CreditCard, 
  DollarSign, 
  TrendingUp,
  Globe,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar
} from "lucide-react";
import { Profile, Customer, Quote, Invoice, Receipt } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { DataTable } from "@/components/DataTable";

export default function SalespersonProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "quotes" | "invoices" | "receipts">("overview");

  useEffect(() => {
    async function loadSalespersonData() {
      if (!userId) return;
      try {
        setLoading(true);
        const [usersRes, custRes, quotesRes, invRes, recRes] = await Promise.all([
          fetch("/api/admin/users").then((r) => r.json()).catch(() => ({ profiles: [] })),
          fetch("/api/customers").then((r) => r.json()).catch(() => ({ customers: [] })),
          fetch("/api/quotes").then((r) => r.json()).catch(() => []),
          fetch("/api/invoices").then((r) => r.json()).catch(() => []),
          fetch("/api/receipts").then((r) => r.json()).catch(() => []),
        ]);

        const rawProfiles: Profile[] = usersRes.profiles || [];
        const found = rawProfiles.find((p) => p.id === userId);
        if (found) setProfile(found);

        const allCust: Customer[] = custRes.customers || [];
        const allQuotes: Quote[] = Array.isArray(quotesRes) ? quotesRes : [];
        const allInvoices: Invoice[] = Array.isArray(invRes) ? invRes : [];
        const allReceipts: Receipt[] = Array.isArray(recRes) ? recRes : [];

        // Filter salesperson owned records
        setCustomers(allCust.filter((c) => c.assignedSalesmanId === userId || (c as any).assigned_salesman_id === userId));
        setQuotes(allQuotes.filter((q) => q.salesmanId === userId || q.createdBy === userId));
        setInvoices(allInvoices.filter((i) => i.salesmanId === userId || i.createdBy === userId));
        setReceipts(allReceipts.filter((r) => r.createdBy === userId || (r as any).salesman_id === userId));

      } catch (err) {
        console.error("Failed to load salesperson profile data:", err);
      } finally {
        setLoading(false);
      }
    }

    if (isSuperAdmin) {
      loadSalespersonData();
    }
  }, [userId, isSuperAdmin]);

  // Outstanding Balance Managed by salesperson
  const totalOutstanding = useMemo(() => {
    return customers.reduce((sum, c) => sum + Math.max(0, c.pendingBillwiseAmount || 0), 0);
  }, [customers]);

  const customerColumns = [
    {
      header: "Customer",
      accessor: (row: Customer) => (
        <div>
          <div className="font-extrabold text-slate-900">{row.company || row.companyName}</div>
          {row.doctorName && <div className="text-xs text-slate-400 font-semibold">Dr: {row.doctorName}</div>}
        </div>
      ),
    },
    {
      header: "Customer Code",
      accessor: (row: Customer) => <span className="font-mono text-xs font-bold text-slate-600">{row.customerCode || "—"}</span>,
    },
    {
      header: "Pending Balance",
      accessor: (row: Customer) => (
        <span className="font-extrabold text-xs text-rose-600">
          {row.country === "Oman" ? "OMR" : "AED"} {Math.max(0, row.pendingBillwiseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Status",
      accessor: (row: Customer) => (
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${row.is_active !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
          {row.is_active !== false ? "Active" : "Inactive"}
        </span>
      ),
      className: "text-center",
    },
  ];

  const invoiceColumns = [
    {
      header: "Invoice Ref",
      accessor: (row: Invoice) => <span className="font-bold text-[#1B2A4A]">{row.invoiceNumber}</span>,
    },
    {
      header: "Customer",
      accessor: (row: Invoice) => row.companyName || row.customerName,
    },
    {
      header: "Grand Total",
      accessor: (row: Invoice) => (
        <span className="font-extrabold text-slate-900">
          {row.country === "Oman" ? "OMR" : "AED"} {row.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Status",
      accessor: (row: Invoice) => (
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${row.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
          {row.status}
        </span>
      ),
      className: "text-center",
    },
    {
      header: "Date",
      accessor: (row: Invoice) => row.date,
    },
  ];

  if (authLoading || loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4" />
        <p className="text-sm font-semibold">Loading salesperson profile details...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-12 text-center text-slate-500 space-y-4">
        <p className="text-lg font-bold">Salesperson profile not found.</p>
        <Link href="/users" className="text-sm font-bold text-accent hover:underline">
          &larr; Return to Salesperson List
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Profile Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/users")}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer shrink-0"
              title="Back to Salespersons List"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-[#1B2A4A] text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
              {profile.full_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                  {profile.full_name}
                </h1>
                <span className={`px-3 py-0.5 rounded-full text-xs font-bold border ${
                  profile.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  {profile.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-1">
                Salesperson · <strong className="text-slate-800">{profile.country}</strong> · {profile.email}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Metric Operational Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL CUSTOMERS</span>
          <span className="text-2xl font-black text-[#1B2A4A] mt-1 block">{customers.length}</span>
          <span className="text-xs text-slate-400 font-semibold mt-0.5 block">Assigned accounts</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL QUOTATIONS</span>
          <span className="text-2xl font-black text-[#1B2A4A] mt-1 block">{quotes.length}</span>
          <span className="text-xs text-slate-400 font-semibold mt-0.5 block">Proposals issued</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL INVOICES</span>
          <span className="text-2xl font-black text-[#1B2A4A] mt-1 block">{invoices.length}</span>
          <span className="text-xs text-slate-400 font-semibold mt-0.5 block">Billed tax invoices</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL RECEIPTS</span>
          <span className="text-2xl font-black text-[#1B2A4A] mt-1 block">{receipts.length}</span>
          <span className="text-xs text-slate-400 font-semibold mt-0.5 block">Collections logged</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">OUTSTANDING MANAGED</span>
          <span className="text-2xl font-black text-rose-600 mt-1 block">
            {profile.country === "Oman" ? "OMR" : "AED"} {totalOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-slate-400 font-semibold mt-0.5 block">Pending credit exposure</span>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-2xl border">
        <button
          onClick={() => setActiveTab("overview")}
          className={`py-3.5 px-5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === "overview" ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`py-3.5 px-5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === "customers" ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Customers ({customers.length})
        </button>
        <button
          onClick={() => setActiveTab("quotes")}
          className={`py-3.5 px-5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === "quotes" ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Quotations ({quotes.length})
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`py-3.5 px-5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === "invoices" ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab("receipts")}
          className={`py-3.5 px-5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === "receipts" ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Receipts ({receipts.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-[#1B2A4A] uppercase tracking-wider">Assigned Territory & Portfolio Summary</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Dr. {profile.full_name} manages <strong>{customers.length} assigned customer accounts</strong> in <strong>{profile.country}</strong>.
              Currently supervising <strong>{profile.country === "Oman" ? "OMR" : "AED"} {totalOutstanding.toLocaleString()}</strong> in active customer pending credit balances across field accounts.
            </p>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-extrabold text-[#1B2A4A]">Assigned Customer Accounts</h3>
          <DataTable data={customers} columns={customerColumns} keyExtractor={(r) => r.id} />
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-extrabold text-[#1B2A4A]">Issued Tax Invoices</h3>
          <DataTable data={invoices} columns={invoiceColumns} keyExtractor={(r) => r.id} />
        </div>
      )}

      {activeTab === "quotes" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-extrabold text-[#1B2A4A]">Quotations & Proposals</h3>
          <div className="text-xs text-slate-500 font-medium">Showing {quotes.length} quotations issued by {profile.full_name}.</div>
        </div>
      )}

      {activeTab === "receipts" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-extrabold text-[#1B2A4A]">Collected Customer Receipts</h3>
          <div className="text-xs text-slate-500 font-medium">Showing {receipts.length} payment receipts logged by {profile.full_name}.</div>
        </div>
      )}
    </div>
  );
}
