"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";
import {
  CollectionLedgerEntry,
  CollectionLedgerSummary,
  ExpenseCategory,
  ExpensePaymentMethod,
} from "@/types";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Send,
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  FileDown,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  SlidersHorizontal,
  CalendarRange,
} from "lucide-react";
import { buildCollectionLedgerPDF } from "@/lib/pdfCollectionLedgerHelper";
import { getNormalizedDateRange, PeriodType, formatDateToISOString } from "@/lib/dateUtils";
import { PageHeader } from "@/components/PageHeader";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

type SortField = "date" | "amount" | "type" | "referenceNo" | "paymentMethod";
type SortOrder = "asc" | "desc";

export default function CollectionLedgerPage() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL state parameters or defaults
  const paramPeriod = (searchParams.get("period") || "month") as PeriodType;
  const paramYear = Number(searchParams.get("year")) || new Date().getFullYear();
  const paramMonth = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const paramStart = searchParams.get("startDate") || "";
  const paramEnd = searchParams.get("endDate") || "";
  const paramSalespersonId = searchParams.get("salespersonId") || "";

  // Component States
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CollectionLedgerSummary | null>(null);
  const [entries, setEntries] = useState<CollectionLedgerEntry[]>([]);
  const [salespeople, setSalespeople] = useState<{ id: string; full_name: string; role: string }[]>([]);

  // Filter States
  const [period, setPeriod] = useState<PeriodType>(paramPeriod);
  const [selectedYear, setSelectedYear] = useState<number>(paramYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(paramMonth);
  const [customStart, setCustomStart] = useState<string>(paramStart || formatDateToISOString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState<string>(paramEnd || formatDateToISOString(new Date()));
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>(paramSalespersonId || profile?.id || "");

  // Sorting & Grouping States
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Modal States
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form States
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("Petrol");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState<ExpensePaymentMethod>("Cash");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [expDescription, setExpDescription] = useState("");
  const [expAttachment, setExpAttachment] = useState("");

  const [hoAmount, setHoAmount] = useState("");
  const [hoDate, setHoDate] = useState(new Date().toISOString().split("T")[0]);
  const [hoNotes, setHoNotes] = useState("");
  const [hoRef, setHoRef] = useState("");
  const [handoverMode, setHandoverMode] = useState<"admin_handover" | "carry_forward">("admin_handover");

  const canViewAll = profile?.role === "super_admin" || profile?.role === "accountant";
  const effectiveSalespersonId = canViewAll
    ? (selectedSalespersonId || "all")
    : (profile?.id || "");

  // Initialize Salesperson selection
  useEffect(() => {
    if (profile?.id && !selectedSalespersonId && !paramSalespersonId) {
      if (canViewAll) {
        setSelectedSalespersonId("all");
      } else {
        setSelectedSalespersonId(profile.id);
      }
    }
  }, [profile?.id, canViewAll]);

  // Sync URL parameters when filters change
  const updateUrlParams = (
    p: PeriodType,
    y: number,
    m: number,
    spId: string,
    cStart?: string,
    cEnd?: string
  ) => {
    const params = new URLSearchParams();
    params.set("period", p);
    params.set("year", String(y));
    params.set("month", String(m));
    if (spId) params.set("salespersonId", spId);
    if (p === "custom" && cStart && cEnd) {
      params.set("startDate", cStart);
      params.set("endDate", cEnd);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Load Salespeople for Accountant / Admin dropdown
  useEffect(() => {
    if (canViewAll) {
      fetch("/api/salespeople")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.salespeople)) {
            setSalespeople(data.salespeople);
          }
        })
        .catch((err) => console.error("Failed to load salespeople list:", err));
    }
  }, [canViewAll]);

  // Load Collection Ledger data
  const loadLedger = async () => {
    if (!profile?.id) return;
    setLoading(true);

    try {
      const normalized = getNormalizedDateRange({
        period,
        year: selectedYear,
        month: selectedMonth,
        customStart,
        customEnd,
      });

      const spIdParam = canViewAll ? effectiveSalespersonId : profile.id;
      let url = `/api/collection-ledger?salespersonId=${spIdParam}&startDate=${normalized.startDate}&endDate=${normalized.endDate}&period=${period}&year=${selectedYear}&month=${selectedMonth}`;

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setSummary(data.summary || null);
        setEntries(data.entries || []);
      } else {
        console.error("Ledger API error:", data.error);
      }
    } catch (err) {
      console.error("Failed to fetch ledger:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.id) {
      loadLedger();
    }
  }, [profile?.id, effectiveSalespersonId, period, selectedYear, selectedMonth]);

  // Period Handler
  const handlePeriodChange = (newPeriod: PeriodType) => {
    setPeriod(newPeriod);
    updateUrlParams(
      newPeriod,
      selectedYear,
      selectedMonth,
      effectiveSalespersonId,
      customStart,
      customEnd
    );
  };

  // Year Handler
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    updateUrlParams(
      period,
      year,
      selectedMonth,
      effectiveSalespersonId,
      customStart,
      customEnd
    );
  };

  // Month Handler
  const handleMonthChange = (month: number) => {
    setSelectedMonth(month);
    setPeriod("month");
    updateUrlParams(
      "month",
      selectedYear,
      month,
      effectiveSalespersonId,
      customStart,
      customEnd
    );
  };

  // Custom Range Apply
  const handleApplyCustomRange = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPeriod("custom");
    updateUrlParams(
      "custom",
      selectedYear,
      selectedMonth,
      effectiveSalespersonId,
      customStart,
      customEnd
    );
    loadLedger();
  };

  // Sort Handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Sorted Entries
  const sortedEntries = useMemo(() => {
    const list = [...entries];
    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === "date") {
        valA = new Date(a.timestamp || a.date).getTime();
        valB = new Date(b.timestamp || b.date).getTime();
      } else if (sortField === "amount") {
        valA = Math.max(a.inAmount, a.outAmount);
        valB = Math.max(b.inAmount, b.outAmount);
      } else if (sortField === "type") {
        valA = a.type;
        valB = b.type;
      } else if (sortField === "referenceNo") {
        valA = a.referenceNo;
        valB = b.referenceNo;
      } else if (sortField === "paymentMethod") {
        valA = a.paymentMethod;
        valB = b.paymentMethod;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [entries, sortField, sortOrder]);

  // Grouped Entries logic (Year view: group by Month; Month/Day/Custom view: group by Day)
  const groupedEntries = useMemo(() => {
    const groups: { [key: string]: { label: string; items: CollectionLedgerEntry[]; totalIn: number; totalOut: number } } = {};

    const isYearView = period === "year" || period === "last_year";

    sortedEntries.forEach((entry) => {
      let groupKey = "";
      let groupLabel = "";

      if (isYearView) {
        // Group by YYYY-MM
        const d = new Date(entry.date);
        const y = d.getFullYear() || selectedYear;
        const m = d.getMonth();
        groupKey = `${y}-${String(m + 1).padStart(2, "0")}`;
        groupLabel = `${MONTH_NAMES[m] || "Month"} ${y}`;
      } else {
        // Group by Date (YYYY-MM-DD)
        groupKey = entry.date || "Unknown Date";
        try {
          const d = new Date(entry.date);
          if (!isNaN(d.getTime())) {
            const dayNum = String(d.getDate()).padStart(2, "0");
            const mName = MONTH_NAMES[d.getMonth()]?.substring(0, 3) || "";
            groupLabel = `${dayNum} ${mName} ${d.getFullYear()}`;
          } else {
            groupLabel = entry.date;
          }
        } catch {
          groupLabel = entry.date;
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          label: groupLabel,
          items: [],
          totalIn: 0,
          totalOut: 0,
        };
      }

      groups[groupKey].items.push(entry);
      groups[groupKey].totalIn += entry.inAmount;
      groups[groupKey].totalOut += entry.outAmount;
    });

    return Object.keys(groups).map((key) => ({
      key,
      ...groups[key],
    }));
  }, [sortedEntries, period, selectedYear]);

  // Handle File Attachment Upload
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

  // Handle Add Expense Submission
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || Number(expAmount) <= 0) return;
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
          salespersonId: effectiveSalespersonId === "all" ? profile?.id : effectiveSalespersonId,
        }),
      });

      if (res.ok) {
        setShowExpenseModal(false);
        setExpAmount("");
        setExpDescription("");
        setExpAttachment("");
        await loadLedger();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create expense");
      }
    } catch (err) {
      console.error(err);
      alert("Error submitting expense request");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Cash Handover Submission
  const handleAddHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hoAmount || Number(hoAmount) <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(hoAmount),
          handoverDate: hoDate,
          referenceNumber: hoRef,
          notes: hoNotes,
          salespersonId: effectiveSalespersonId === "all" ? profile?.id : effectiveSalespersonId,
        }),
      });

      if (res.ok) {
        setShowHandoverModal(false);
        setHoAmount("");
        setHoNotes("");
        setHoRef("");
        await loadLedger();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to submit cash handover");
      }
    } catch (err) {
      console.error(err);
      alert("Error submitting cash handover");
    } finally {
      setSubmitting(false);
    }
  };

  // Download PDF
  const handleDownloadPDF = () => {
    if (!summary) {
      alert("Ledger summary is loading or unavailable.");
      return;
    }
    const range = getNormalizedDateRange({
      period,
      year: selectedYear,
      month: selectedMonth,
      customStart,
      customEnd,
    });
    const doc = buildCollectionLedgerPDF(summary, entries, range);
    const filename = `Collection_Ledger_${(summary.salespersonName || "Salesperson").replace(/\s+/g, "_")}_${range.startDate}_to_${range.endDate}.pdf`;
    doc.save(filename);
  };

  const currencySymbol = summary?.country === "Oman" ? "OMR" : "AED";

  return (
    <div className="w-full">
      {/* Page Header */}
      <PageHeader
        title={t("collectionLedgerTitle") || "Collection Ledger"}
        description={t("collectionLedgerDesc") || "Physical cash control, collections & expense management"}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={!summary || loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 text-sm font-bold disabled:opacity-50 transition cursor-pointer backdrop-blur-xs"
            >
              <FileDown className="w-4 h-4 text-white" />
              <span>Export PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setShowExpenseModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>{t("addExpense") || "Add Expense"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHandoverModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#61989B] hover:bg-[#4e7d80] text-white font-extrabold text-sm transition shadow-md shadow-[#61989B]/20 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{t("cashHandover") || "Cash Handover"}</span>
            </button>
          </div>
        }
      />

      <div className="px-6 py-5 md:px-6 md:py-6 max-w-[1600px] mx-auto space-y-5 text-start">

      {/* Filter Toolbar: Salesperson Selector + Period Presets + Year/Month Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        {/* Top Control Bar: Salesperson Selector + Period Presets */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Salesperson Selector */}
          {canViewAll ? (
            <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-xl border border-slate-200/70">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Salesperson:</span>
              <select
                value={selectedSalespersonId}
                onChange={(e) => {
                  setSelectedSalespersonId(e.target.value);
                  updateUrlParams(period, selectedYear, selectedMonth, e.target.value, customStart, customEnd);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1B2A4A] shadow-2xs"
              >
                <option value="all">All Salespeople (Consolidated)</option>
                <option value={profile?.id}>Myself ({profile?.full_name})</option>
                {salespeople
                  .filter((sp) => sp.id !== profile?.id)
                  .map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.full_name} ({sp.role})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Salesperson:</span>
              <span className="text-xs font-semibold text-slate-900">{profile?.full_name} ({summary?.country || profile?.country})</span>
            </div>
          )}

          {/* Period Presets */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
            {[
              { id: "today", label: "Today" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "quarter", label: "This Quarter" },
              { id: "year", label: "This Year" },
              { id: "last_year", label: "Last Year" },
              { id: "custom", label: "Custom Range" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePeriodChange(p.id as PeriodType)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer ${
                  period === p.id
                    ? "bg-white text-slate-900 shadow-2xs border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Navigation Bar: Year / Month Selectors & Custom Date Range Inputs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4">
            {/* Year Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
              >
                {MONTH_NAMES.map((mName, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {mName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Date Inputs (Only when Custom Range selected) */}
          {period === "custom" && (
            <form onSubmit={handleApplyCustomRange} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500">From</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500">To</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-[#1B2A4A] hover:bg-[#253963] text-white font-semibold text-xs rounded-lg shadow-2xs transition cursor-pointer"
              >
                Apply
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Summary KPI Cards (5-Metric Grid Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Cash in Hand (Featured) */}
        <div className="p-5 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-15">
            <Wallet className="w-20 h-20 text-white" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Cash in Hand</span>
            </div>
            <div className="text-2xl font-extrabold tracking-tight">
              {currencySymbol} {(summary?.currentCashInHand || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <p className="text-[11px] text-emerald-100/90 mt-2 font-medium">
            Net cash held at period end
          </p>
        </div>

        {/* Opening Cash */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Opening Cash</span>
            <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 mt-2">
            {currencySymbol} {(summary?.openingCash || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">Cash balance at period start</span>
        </div>

        {/* Cash Collections */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cash Collections</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-600 mt-2">
            +{currencySymbol} {(summary?.totalCashCollected || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">From active cash receipts</span>
        </div>

        {/* Approved Cash Expenses */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Approved Expenses</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-rose-600 mt-2">
            - {currencySymbol} {(summary?.totalCashExpenses || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">Approved cash expenses</span>
        </div>

        {/* Cash Handed Over */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cash Handed Over</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-blue-600 mt-2">
            - {currencySymbol} {(summary?.totalCashHandedOver || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">Confirmed handovers</span>
        </div>
      </div>

      {/* Transaction Ledger Table with Grouping & Interactive Column Sorting */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Chronological Transaction Ledger</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative transaction log sorted by {sortField} ({sortOrder.toUpperCase()})
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadLedger()}
              disabled={loading}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition duration-150 cursor-pointer border border-slate-200"
              title="Refresh Ledger"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th
                  onClick={() => handleSort("date")}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("type")}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Type / Description</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("referenceNo")}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Reference #</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("paymentMethod")}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Method</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("amount")}
                  className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>In ({currencySymbol})</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("amount")}
                  className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Out ({currencySymbol})</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-3 text-right">Balance ({currencySymbol})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                      <span>Loading collection ledger transactions...</span>
                    </div>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                      <span className="text-sm font-semibold text-slate-700">No transactions for this period.</span>
                      <span className="text-xs text-slate-400">Try adjusting your date filters or salesperson selection.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                groupedEntries.map((group) => (
                  <React.Fragment key={group.key}>
                    {/* Group Sub-Header */}
                    <tr className="bg-slate-100/60 font-bold text-xs text-slate-700 border-y border-slate-200/60">
                      <td colSpan={4} className="px-6 py-2.5 text-slate-800">
                        <div className="flex items-center gap-2">
                          <CalendarRange className="w-3.5 h-3.5 text-slate-500" />
                          <span>{group.label}</span>
                          <span className="text-[10px] font-normal text-slate-500">
                            ({group.items.length} {group.items.length === 1 ? "transaction" : "transactions"})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-2.5 text-right text-emerald-700">
                        {group.totalIn > 0 ? `+${group.totalIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-6 py-2.5 text-right text-rose-700">
                        {group.totalOut > 0 ? `-${group.totalOut.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-6 py-2.5"></td>
                    </tr>

                    {/* Group Rows */}
                    {group.items.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-slate-800 whitespace-nowrap">
                          {entry.date}
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-slate-900 max-w-sm truncate">
                          {entry.description}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs font-semibold text-slate-600 whitespace-nowrap">
                          {entry.referenceNo}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200/50">
                            {entry.paymentMethod}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-emerald-600 whitespace-nowrap">
                          {entry.inAmount > 0 ? `+${entry.inAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-rose-600 whitespace-nowrap">
                          {entry.outAmount > 0 ? `-${entry.outAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td className="px-6 py-3.5 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {entry.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">Record Business Expense</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
                  Amount ({currencySymbol}) *
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
                  onClick={() => setShowExpenseModal(false)}
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

      {/* Modal: Cash Handover */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Cash Handover & Retention</h3>
                <p className="text-xs text-slate-500 mt-0.5">How would you like to handle your physical cash?</p>
              </div>
              <button onClick={() => setShowHandoverModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddHandover} className="p-6 space-y-5">
              {/* Option Selector Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHandoverMode("admin_handover")}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    handoverMode === "admin_handover"
                      ? "border-[#1B2A4A] bg-[#1B2A4A]/5 ring-2 ring-[#1B2A4A]/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Send className={`w-4 h-4 ${handoverMode === "admin_handover" ? "text-[#1B2A4A]" : "text-slate-400"}`} />
                    <span className="text-xs font-bold text-slate-900">Hand Over to Admin</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Deduct cash from your balance and transfer physical cash to Admin Ledger.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setHandoverMode("carry_forward")}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    handoverMode === "carry_forward"
                      ? "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Wallet className={`w-4 h-4 ${handoverMode === "carry_forward" ? "text-emerald-600" : "text-slate-400"}`} />
                    <span className="text-xs font-bold text-slate-900">Keep Cash / Carry Forward</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Retain cash under your balance and carry it forward into next period's Opening Cash.
                  </p>
                </button>
              </div>

              {handoverMode === "admin_handover" ? (
                /* OPTION 1: HAND OVER TO ADMIN FORM */
                <div className="space-y-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Handover Amount ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={hoAmount}
                      onChange={(e) => setHoAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:border-[#1B2A4A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Handover Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={hoDate}
                      onChange={(e) => setHoDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Reference / Voucher # (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Voucher 104"
                      value={hoRef}
                      onChange={(e) => setHoRef(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Notes / Handed to Whom
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Handed physical cash to Chief Accountant at Head Office"
                      value={hoNotes}
                      onChange={(e) => setHoNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1B2A4A]"
                    />
                  </div>
                </div>
              ) : (
                /* OPTION 2: KEEP CASH / CARRY FORWARD FORM */
                <div className="space-y-4 pt-1">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800">
                    <strong>Note:</strong> Retained cash remains under your cash in hand and will automatically be included in next period's Opening Cash.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Retained Amount ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={hoAmount}
                      onChange={(e) => setHoAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Effective Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={hoDate}
                      onChange={(e) => setHoDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Notes / Carry Forward Reason
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Retaining cash for tomorrow's field expenses and float"
                      value={hoNotes}
                      onChange={(e) => setHoNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-white text-sm font-semibold rounded-xl shadow-sm cursor-pointer disabled:opacity-50 transition ${
                    handoverMode === "admin_handover"
                      ? "bg-[#1B2A4A] hover:bg-[#253963]"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {submitting
                    ? "Submitting..."
                    : handoverMode === "admin_handover"
                    ? "Confirm Handover"
                    : "Carry Forward"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
