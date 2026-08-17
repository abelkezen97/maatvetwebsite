"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Globe, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Search, 
  RefreshCw,
  Eye,
  FileText,
  CreditCard,
  Receipt as ReceiptIcon
} from "lucide-react";
import { Profile, UserRole, UserCountry } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";

interface UserStats extends Profile {
  customersCount?: number;
  quotesCount?: number;
  invoicesCount?: number;
  receiptsCount?: number;
  lastActive?: string;
}

export default function UsersManagementPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchUsersWithStats = async () => {
    setLoading(true);
    try {
      const [usersRes, custRes, quotesRes, invRes, recRes] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()).catch(() => ({ profiles: [] })),
        fetch("/api/customers").then((r) => r.json()).catch(() => ({ customers: [] })),
        fetch("/api/quotes").then((r) => r.json()).catch(() => []),
        fetch("/api/invoices").then((r) => r.json()).catch(() => []),
        fetch("/api/receipts").then((r) => r.json()).catch(() => []),
      ]);

      const rawProfiles: Profile[] = usersRes.profiles || [];
      const customersList: any[] = custRes.customers || [];
      const quotesList: any[] = Array.isArray(quotesRes) ? quotesRes : [];
      const invoicesList: any[] = Array.isArray(invRes) ? invRes : [];
      const receiptsList: any[] = Array.isArray(recRes) ? recRes : [];

      const enrichedUsers: UserStats[] = rawProfiles.map((user) => {
        const userCust = customersList.filter((c) => c.assignedSalesmanId === user.id || c.assigned_salesman_id === user.id);
        const userQuotes = quotesList.filter((q) => q.salesmanId === user.id || q.createdBy === user.id);
        const userInvoices = invoicesList.filter((i) => i.salesmanId === user.id || i.createdBy === user.id);
        const userReceipts = receiptsList.filter((r) => r.createdBy === user.id);

        return {
          ...user,
          customersCount: userCust.length,
          quotesCount: userQuotes.length,
          invoicesCount: userInvoices.length,
          receiptsCount: userReceipts.length,
          lastActive: user.created_at ? String(user.created_at).split("T")[0] : "Active",
        };
      });

      setUsers(enrichedUsers);
    } catch (err) {
      console.error("Failed to load user management dashboard:", err);
      setErrorMsg("Failed to fetch operational user metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsersWithStats();
    }
  }, [isSuperAdmin]);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.country.toLowerCase().includes(q)
    );
  });

  if (authLoading) return null;

  return (
    <div className="w-full">
      {/* Header */}
      <PageHeader
        title="Salespersons & User Directory"
        description="Operational team management, territory assignments, and performance overview across field agents."
        action={
          <Link
            href="/settings/users"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-white text-[#1B2A4A] font-extrabold hover:bg-slate-100 transition shadow-md cursor-pointer text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Provision New User
          </Link>
        }
      />

      <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto space-y-6 pb-12">

      {/* Search & Actions Bar */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search salesperson by name, email, country, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <button
          onClick={fetchUsersWithStats}
          className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition cursor-pointer"
          title="Refresh User Directory"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Operational Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] uppercase tracking-wider font-extrabold text-slate-500">
                <th className="py-4 px-5">Name</th>
                <th className="py-4 px-4">Role</th>
                <th className="py-4 px-4">Country</th>
                <th className="py-4 px-4 text-center">Customers #</th>
                <th className="py-4 px-4 text-center">Quotations #</th>
                <th className="py-4 px-4 text-center">Invoices #</th>
                <th className="py-4 px-4 text-center">Receipts #</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4">Last Active</th>
                <th className="py-4 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    Loading team operations directory...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    No users matching criteria found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => router.push(`/users/${u.id}`)}
                    className="hover:bg-slate-50/80 transition cursor-pointer group"
                  >
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#1B2A4A]/10 text-[#1B2A4A] flex items-center justify-center font-bold text-sm shrink-0">
                          {u.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 group-hover:text-accent transition">{u.full_name}</div>
                          <div className="text-[11px] text-slate-400 font-medium">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                        u.role === "super_admin"
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : u.role === "accountant"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}>
                        {u.role === "super_admin" ? "Super Admin" : u.role === "accountant" ? "Accountant" : "Salesperson"}
                      </span>
                    </td>

                    <td className="py-4 px-4 font-bold text-slate-800">
                      {u.country}
                    </td>

                    <td className="py-4 px-4 text-center font-extrabold text-slate-800">
                      {u.customersCount || 0}
                    </td>

                    <td className="py-4 px-4 text-center font-extrabold text-slate-800">
                      {u.quotesCount || 0}
                    </td>

                    <td className="py-4 px-4 text-center font-extrabold text-slate-800">
                      {u.invoicesCount || 0}
                    </td>

                    <td className="py-4 px-4 text-center font-extrabold text-slate-800">
                      {u.receiptsCount || 0}
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        u.is_active !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {u.is_active !== false ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-slate-500 font-medium">
                      {u.lastActive}
                    </td>

                    <td className="py-4 px-5 text-center" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/users/${u.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#1B2A4A] hover:text-white text-slate-700 text-xs font-bold transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View / Manage
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
