"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Expense, ApprovalStatus, ExpenseCategory, ExpensePaymentMethod } from "@/types";
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
} from "lucide-react";

export default function ExpensesPage() {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<"All" | ApprovalStatus>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Modal & Form state for Add Expense
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("Petrol");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState<ExpensePaymentMethod>("Cash");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [expDescription, setExpDescription] = useState("");
  const [expAttachment, setExpAttachment] = useState("");

  const canApprove = profile?.role === "super_admin" || profile?.role === "accountant";

  const loadExpenses = async () => {
    setLoading(true);
    try {
      let url = "/api/expenses";
      if (activeTab !== "All") {
        url += `?status=${activeTab}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setExpenses(data);
      } else {
        console.error("Failed to load expenses:", data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [activeTab, profile]);

  // Attachment Handler
  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setExpAttachment(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Create Expense Handler
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || Number(expAmount) <= 0) {
      alert("Amount must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: expCategory,
          amount: Number(expAmount),
          paymentMethod: expMethod,
          expenseDate: expDate,
          description: expDescription,
          attachmentUrl: expAttachment,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setExpAmount("");
        setExpDescription("");
        setExpAttachment("");
        await loadExpenses();
      } else {
        alert(data.error || "Failed to create expense");
      }
    } catch (err) {
      console.error("Error submitting expense:", err);
      alert("Error submitting expense request");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Approve
  const handleApprove = async (id: string) => {
    setActioningId(id);
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, { method: "POST" });
      if (res.ok) {
        await loadExpenses();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to approve expense");
      }
    } catch (e) {
      console.error(e);
      alert("Error approving expense");
    } finally {
      setActioningId(null);
    }
  };

  // Handle Reject
  const handleReject = async (id: string) => {
    const reason = prompt("Enter reason for rejecting this expense (optional):");
    setActioningId(id);
    try {
      const res = await fetch(`/api/expenses/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        await loadExpenses();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to reject expense");
      }
    } catch (e) {
      console.error(e);
      alert("Error rejecting expense");
    } finally {
      setActioningId(null);
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadExpenses();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete expense");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered List
  const filteredExpenses = expenses.filter((e) => {
    if (activeTab !== "All" && e.status !== activeTab) return false;
    if (categoryFilter !== "ALL" && e.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNum = e.expenseNumber?.toLowerCase().includes(q);
      const matchDesc = e.description?.toLowerCase().includes(q);
      const matchSP = e.salespersonName?.toLowerCase().includes(q);
      if (!matchNum && !matchDesc && !matchSP) return false;
    }
    return true;
  });

  const getStatusBadge = (status: ApprovalStatus) => {
    switch (status) {
      case "Approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case "Rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 rounded-full border border-rose-200">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded-full border border-amber-200">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> Pending Approval
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-600">
              <CreditCard className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Expenses Management</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Monitor, approve, and track salesperson business expenses
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all duration-150 cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {(["All", "Pending", "Approved", "Rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg capitalize transition duration-150 cursor-pointer ${
                activeTab === tab
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A] w-48 sm:w-64"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
          >
            <option value="ALL">All Categories</option>
            <option value="Petrol">Petrol</option>
            <option value="Food">Food</option>
            <option value="Rent">Rent</option>
            <option value="Travel">Travel</option>
            <option value="Vehicle">Vehicle</option>
            <option value="Accommodation">Accommodation</option>
            <option value="Office">Office</option>
            <option value="Miscellaneous">Miscellaneous</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="px-6 py-3">Expense #</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Salesperson</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    Loading expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    No expense records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isPending = expense.status === "Pending";
                  const currency = expense.country === "Oman" ? "OMR" : "AED";

                  return (
                    <tr key={expense.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                        {expense.expenseNumber}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700 whitespace-nowrap">
                        {expense.expenseDate}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                        {expense.salespersonName || "Salesperson"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-800">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                          expense.paymentMethod === "Cash" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                        }`}>
                          {expense.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {currency} {expense.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(expense.status)}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap space-x-2">
                        {canApprove && isPending && (
                          <>
                            <button
                              onClick={() => handleApprove(expense.id)}
                              disabled={actioningId === expense.id}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(expense.id)}
                              disabled={actioningId === expense.id}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {(canApprove || (isPending && expense.salespersonId === profile?.id)) && (
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition duration-150 cursor-pointer"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Expense */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">Record Business Expense</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>
            <form onSubmit={handleAddExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Category *
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                >
                  <option value="Petrol">Petrol</option>
                  <option value="Food">Food</option>
                  <option value="Rent">Rent</option>
                  <option value="Travel">Travel</option>
                  <option value="Vehicle">Vehicle Maintenance</option>
                  <option value="Accommodation">Accommodation</option>
                  <option value="Office">Office Supplies</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Amount ({profile?.country === "Oman" ? "OMR" : "AED"}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  value={expMethod}
                  onChange={(e) => setExpMethod(e.target.value as ExpensePaymentMethod)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                >
                  <option value="Cash">Cash (Decreases Cash in Hand)</option>
                  <option value="Company Card">Company Card (No Cash effect)</option>
                  <option value="Personal Card">Personal Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Expense Date *
                </label>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter details about this expense..."
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Attach Photo / Receipt Bill (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAttachmentChange}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1B2A4A] file:text-white hover:file:bg-[#253963] cursor-pointer"
                />
                {expAttachment && (
                  <div className="mt-2 relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shadow-xs">
                    <img src={expAttachment} alt="Receipt Bill Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setExpAttachment("")}
                      className="absolute top-1 right-1 bg-slate-900/80 text-white rounded-full p-0.5 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
