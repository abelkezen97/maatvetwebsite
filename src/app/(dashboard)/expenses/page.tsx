"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";
import { Expense, ExpenseCategory, ExpensePaymentMethod } from "@/types";
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  X,
  FileText,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";

export default function ExpensesPage() {
  const { profile } = useAuth();
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal & Form state for Add Expense
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("Petrol");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState<ExpensePaymentMethod>("Cash");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [expDescription, setExpDescription] = useState("");
  const [expAttachment, setExpAttachment] = useState("");

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/expenses");
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
  }, [profile]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || isNaN(Number(expAmount))) return;
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
          receiptAttachmentUrl: expAttachment,
        }),
      });

      if (res.ok) {
        const newExp = await res.json();
        setExpenses((prev) => [newExp, ...prev]);
        setShowAddModal(false);
        setExpAmount("");
        setExpDescription("");
        setExpAttachment("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add expense");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    if (categoryFilter !== "ALL" && e.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const catMatch = e.category.toLowerCase().includes(q);
      const descMatch = (e.description || "").toLowerCase().includes(q);
      const userMatch = (e.createdByName || (e as any).recordedByName || "").toLowerCase().includes(q);
      return catMatch || descMatch || userMatch;
    }
    return true;
  });

  return (
    <div className="w-full">
      <PageHeader
        title={t("expensesTitle") || "Expenses"}
        description={t("expensesDesc") || "Record and manage business expenses."}
        action={
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{t("addExpense") || "Add Expense"}</span>
          </button>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("searchPlaceholder") || "Search expenses..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4 text-start">{t("dateCol") || "Date"}</th>
                  <th className="px-6 py-4 text-start">{t("category") || "Category"}</th>
                  <th className="px-6 py-4 text-start">{t("recordedBy") || "Recorded By"}</th>
                  <th className="px-6 py-4 text-start">{t("amountCol") || "Amount"}</th>
                  <th className="px-6 py-4 text-start">{t("statusCol") || "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                      Loading expenses...
                    </td>
                  </tr>
                ) : filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                      No expenses found.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-4 font-bold text-slate-900">{formatDate(exp.expenseDate)}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700">{translateBusinessText(exp.category)}</td>
                      <td className="px-6 py-4 text-slate-600">{translateBusinessText(exp.createdByName || (exp as any).recordedByName || "—")}</td>
                      <td className="px-6 py-4 font-extrabold text-rose-600">{formatCurrency(exp.amount)}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          {translateBusinessText("Approved")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 text-start">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-lg">Add New Expense</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
                >
                  {(["Petrol", "Food", "Rent", "Travel", "Vehicle", "Accommodation", "Office", "Miscellaneous", "Other"] as ExpenseCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount (AED)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={expMethod}
                  onChange={(e) => setExpMethod(e.target.value as ExpensePaymentMethod)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Remarks</label>
                <textarea
                  rows={3}
                  placeholder="Optional details..."
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
