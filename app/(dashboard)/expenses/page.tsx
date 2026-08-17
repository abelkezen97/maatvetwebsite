"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";
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

import { PageHeader } from "@/components/PageHeader";

export default function ExpensesPage() {
  const { profile } = useAuth();
  const { t, translateBusinessText, formatCurrency, formatDate } = useLanguage();

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
        title={t("expensesTitle")}
        description={t("expensesDesc")}
        action={
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{t("addExpense")}</span>
          </button>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">
        {/* Table Container */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4 text-start">{t("dateCol")}</th>
                  <th className="px-6 py-4 text-start">{t("category")}</th>
                  <th className="px-6 py-4 text-start">{t("recordedBy")}</th>
                  <th className="px-6 py-4 text-start">{t("amountCol")}</th>
                  <th className="px-6 py-4 text-start">{t("statusCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-6 py-4 font-bold text-slate-900">{formatDate(exp.expenseDate)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-700">{translateBusinessText(exp.category)}</td>
                    <td className="px-6 py-4 text-slate-600">{translateBusinessText(exp.createdByName || (exp as any).recordedByName || "—")}</td>
                    <td className="px-6 py-4 font-extrabold text-rose-600">{formatCurrency(exp.amount)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        exp.status === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        exp.status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
                        "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {translateBusinessText(exp.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
