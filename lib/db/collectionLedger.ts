import { SupabaseClient } from "@supabase/supabase-js";
import {
  CollectionLedgerEntry,
  CollectionLedgerSummary,
  UserCountry,
} from "@/types";

export interface LedgerQueryOptions {
  startDate?: string;
  endDate?: string;
}

/**
 * Calculates authoritative Cash in Hand and dynamic chronological ledger for a salesperson or all salespeople.
 * 
 * Formula:
 * Cash in Hand = Opening Cash + Cash Receipts - Approved Cash Expenses - Approved Cash Handovers
 */
export async function calculateSalespersonCollectionLedger(
  supabase: SupabaseClient,
  salespersonId: string,
  options?: LedgerQueryOptions
): Promise<{ summary: CollectionLedgerSummary; entries: CollectionLedgerEntry[] }> {
  if (!salespersonId) {
    throw new Error("salespersonId is required for collection ledger calculation");
  }

  // Handle consolidated view across all salespeople ("all")
  if (salespersonId === "all") {
    return calculateConsolidatedCollectionLedger(supabase, options);
  }

  // 1. Calculate Opening Cash prior to options.startDate if options.startDate is specified
  let priorNetBalance = 0;

  const obQuery = supabase
    .from("salesperson_opening_balances")
    .select("opening_cash, effective_date")
    .eq("salesperson_id", salespersonId)
    .order("effective_date", { ascending: false })
    .limit(1);

  let initialOB = 0;
  const obRes = await obQuery;
  if (obRes.data && obRes.data.length > 0) {
    initialOB = Number(obRes.data[0].opening_cash) || 0;
  }

  if (options?.startDate) {
    const priorRecQuery = supabase
      .from("receipts")
      .select("amount_paid")
      .or(`created_by.eq.${salespersonId}`)
      .eq("payment_method", "Cash")
      .lt("payment_date", options.startDate);

    const priorExpQuery = supabase
      .from("expenses")
      .select("amount, payment_method, status, description")
      .or(`salesperson_id.eq.${salespersonId},employee_id.eq.${salespersonId},created_by.eq.${salespersonId}`)
      .lt("expense_date", options.startDate);

    const priorHoQuery = supabase
      .from("cash_handovers")
      .select("amount, status")
      .or(`salesperson_id.eq.${salespersonId},created_by.eq.${salespersonId}`)
      .lt("handover_date", options.startDate);

    const [pRecRes, pExpRes, pHoRes] = await Promise.all([
      priorRecQuery,
      priorExpQuery,
      priorHoQuery,
    ]);

    const priorCollections = (pRecRes.data || []).reduce(
      (sum: number, r: any) => sum + (Number(r.amount_paid) || 0),
      0
    );

    const priorExpenses = (pExpRes.data || []).reduce((sum: number, e: any) => {
      if (e.is_deleted === true) return sum;
      const isApproved = (e.status || "Pending") === "Approved";
      let method = e.payment_method;
      if (!method && e.description && e.description.includes("[Payment Method: ")) {
        const match = e.description.match(/\[Payment Method: ([^\]]+)\]/);
        if (match) method = match[1];
      }
      const isCash = (method || "Cash") === "Cash";
      return isApproved && isCash ? sum + (Number(e.amount) || 0) : sum;
    }, 0);

    const priorHandovers = (pHoRes.data || []).reduce((sum: number, h: any) => {
      if (h.is_deleted === true) return sum;
      const isApproved = (h.status || "Pending") === "Approved";
      return isApproved ? sum + (Number(h.amount) || 0) : sum;
    }, 0);

    priorNetBalance = priorCollections - priorExpenses - priorHandovers;
  }

  const openingCash = Math.max(0, initialOB + priorNetBalance);

  // 2. Build DB Queries with DB-Level Date Filters for the selected period
  const profileQuery = supabase
    .from("profiles")
    .select("id, full_name, country")
    .eq("id", salespersonId)
    .single();

  let recBuilder = supabase
    .from("receipts")
    .select("id, receipt_number, payment_date, created_at, amount_paid, payment_method, is_deleted, customer_id, customers(doctor_name, company_name)")
    .or(`created_by.eq.${salespersonId}`)
    .eq("payment_method", "Cash");

  if (options?.startDate) {
    recBuilder = recBuilder.gte("payment_date", options.startDate);
  }
  if (options?.endDate) {
    recBuilder = recBuilder.lte("payment_date", options.endDate);
  }

  let expBuilder = supabase
    .from("expenses")
    .select("id, expense_number, expense_date, created_at, amount, category, payment_method, description, status, is_deleted, salesperson_id, employee_id, created_by")
    .or(`salesperson_id.eq.${salespersonId},employee_id.eq.${salespersonId},created_by.eq.${salespersonId}`);

  if (options?.startDate) {
    expBuilder = expBuilder.gte("expense_date", options.startDate);
  }
  if (options?.endDate) {
    expBuilder = expBuilder.lte("expense_date", options.endDate);
  }

  let hoBuilder = supabase
    .from("cash_handovers")
    .select("id, handover_number, handover_date, created_at, amount, reference_number, notes, status, is_deleted, salesperson_id, created_by")
    .or(`salesperson_id.eq.${salespersonId},created_by.eq.${salespersonId}`);

  if (options?.startDate) {
    hoBuilder = hoBuilder.gte("handover_date", options.startDate);
  }
  if (options?.endDate) {
    hoBuilder = hoBuilder.lte("handover_date", options.endDate);
  }

  // 3. Execute Period Queries Concurrently
  const [profileRes, recRes, expRes, hoRes] = await Promise.all([
    profileQuery,
    recBuilder,
    expBuilder,
    hoBuilder,
  ]);

  const profileRow = profileRes.data;
  const salespersonName = profileRow?.full_name || "Salesperson";
  const country: UserCountry = profileRow?.country === "Oman" ? "Oman" : "UAE";

  // Receipts
  const recRows = recRes.data || [];
  const activeCashReceipts = recRows.filter((r: any) => {
    if (r.is_deleted === true) return false;
    if (r.payment_method && r.payment_method !== "Cash") return false;
    return true;
  });

  // Expenses
  let expRows: any[] = expRes.data || [];
  if (expRes.error) {
    const fallback = await supabase
      .from("expenses")
      .select("id, expense_number, expense_date, created_at, amount, category, payment_method, description, status, is_deleted, salesperson_id, employee_id, created_by")
      .eq("employee_id", salespersonId);
    if (fallback.data) expRows = fallback.data;
  }

  let pendingExpensesCount = 0;
  const approvedCashExpenses = expRows.filter((e: any) => {
    if (e.is_deleted === true) return false;
    const isApproved = (e.status || "Pending") === "Approved";

    let method = e.payment_method;
    if (!method && e.description && e.description.includes("[Payment Method: ")) {
      const match = e.description.match(/\[Payment Method: ([^\]]+)\]/);
      if (match) method = match[1];
    }
    const isCash = (method || "Cash") === "Cash";

    if ((e.status || "Pending") === "Pending") pendingExpensesCount++;
    return isApproved && isCash;
  });

  // Handovers
  let handoverRows: any[] = hoRes.data || [];
  if (hoRes.error) {
    const fallback = await supabase
      .from("cash_handovers")
      .select("id, handover_number, handover_date, created_at, amount, reference_number, notes, status, is_deleted, salesperson_id, created_by")
      .eq("salesperson_id", salespersonId);
    if (fallback.data) handoverRows = fallback.data;
  }

  let pendingHandoversCount = 0;
  const approvedCashHandovers = handoverRows.filter((h: any) => {
    if (h.is_deleted === true) return false;
    if ((h.status || "Pending") === "Pending") pendingHandoversCount++;
    return (h.status || "Pending") === "Approved";
  });

  // 4. Aggregate Totals
  const totalCashCollected = activeCashReceipts.reduce(
    (sum: number, r: any) => sum + (Number(r.amount_paid) || 0),
    0
  );

  const totalCashExpenses = approvedCashExpenses.reduce(
    (sum: number, e: any) => sum + (Number(e.amount) || 0),
    0
  );

  const totalCashHandedOver = approvedCashHandovers.reduce(
    (sum: number, h: any) => sum + (Number(h.amount) || 0),
    0
  );

  const currentCashInHand = Math.max(
    0,
    openingCash + totalCashCollected - totalCashExpenses - totalCashHandedOver
  );

  const summary: CollectionLedgerSummary = {
    salespersonId,
    salespersonName,
    country,
    openingCash,
    totalCashCollected,
    totalCashExpenses,
    totalCashHandedOver,
    currentCashInHand,
    pendingExpensesCount,
    pendingHandoversCount,
  };

  // 5. Compile Chronological Ledger Stream
  interface RawStreamItem {
    date: string;
    timestamp: string;
    type: "OPENING_BALANCE" | "CASH_RECEIPT" | "CASH_EXPENSE" | "CASH_HANDOVER";
    description: string;
    referenceNo: string;
    paymentMethod: string;
    customerName?: string;
    inAmount: number;
    outAmount: number;
  }

  const rawStream: RawStreamItem[] = [];

  // Add Opening Balance item if > 0
  if (openingCash > 0) {
    const obDate = options?.startDate || "2026-01-01";
    rawStream.push({
      date: obDate,
      timestamp: `${obDate}T00:00:00.000Z`,
      type: "OPENING_BALANCE",
      description: "Opening Cash Balance",
      referenceNo: "OB-START",
      paymentMethod: "Cash",
      inAmount: openingCash,
      outAmount: 0,
    });
  }

  // Receipts (IN)
  activeCashReceipts.forEach((r: any) => {
    const docName = r.customers?.doctor_name || r.customer_name || "";
    const compName = r.customers?.company_name || r.company_name || "";
    const custLabel = compName ? `${compName}${docName ? ` (${docName})` : ""}` : docName || "Customer";

    rawStream.push({
      date: r.payment_date || (r.created_at ? r.created_at.split("T")[0] : ""),
      timestamp: r.created_at || `${r.payment_date || new Date().toISOString().split("T")[0]}T00:00:00.000Z`,
      type: "CASH_RECEIPT",
      description: `Cash Payment - ${custLabel}`,
      referenceNo: r.receipt_number || r.reference_number || r.reference_no || "REC",
      paymentMethod: r.payment_method || "Cash",
      customerName: custLabel,
      inAmount: Number(r.amount_paid) || 0,
      outAmount: 0,
    });
  });

  // Approved Cash Expenses (OUT)
  approvedCashExpenses.forEach((e: any) => {
    rawStream.push({
      date: e.expense_date || (e.created_at ? e.created_at.split("T")[0] : ""),
      timestamp: e.created_at || `${e.expense_date || new Date().toISOString().split("T")[0]}T00:00:00.000Z`,
      type: "CASH_EXPENSE",
      description: `Expense: ${e.category || "General"}${e.description ? ` - ${e.description}` : ""}`,
      referenceNo: e.expense_number || e.reference_no || "EXP",
      paymentMethod: e.payment_method || "Cash",
      inAmount: 0,
      outAmount: Number(e.amount) || 0,
    });
  });

  // Approved Cash Handovers (OUT)
  approvedCashHandovers.forEach((h: any) => {
    rawStream.push({
      date: h.handover_date || (h.created_at ? h.created_at.split("T")[0] : ""),
      timestamp: h.created_at || `${h.handover_date || new Date().toISOString().split("T")[0]}T00:00:00.000Z`,
      type: "CASH_HANDOVER",
      description: `Cash Handover to Accountant${h.notes ? ` (${h.notes})` : ""}`,
      referenceNo: h.handover_number || h.reference_number || "CH",
      paymentMethod: "Cash",
      inAmount: 0,
      outAmount: Number(h.amount) || 0,
    });
  });

  // Sort Stream Oldest -> Newest to compute accurate running balance
  rawStream.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let runningBalance = 0;
  const entries: CollectionLedgerEntry[] = rawStream.map((item, idx) => {
    runningBalance += item.inAmount - item.outAmount;
    return {
      id: `led-${idx}-${item.referenceNo}`,
      date: item.date,
      timestamp: item.timestamp,
      type: item.type,
      description: item.description,
      referenceNo: item.referenceNo,
      paymentMethod: item.paymentMethod,
      customerName: item.customerName,
      inAmount: item.inAmount,
      outAmount: item.outAmount,
      balance: Math.max(0, runningBalance),
    };
  });

  // Default return newest first
  entries.reverse();

  return { summary, entries };
}

/**
 * Consolidated calculation across all salespeople accessible to the user
 */
async function calculateConsolidatedCollectionLedger(
  supabase: SupabaseClient,
  options?: LedgerQueryOptions
): Promise<{ summary: CollectionLedgerSummary; entries: CollectionLedgerEntry[] }> {
  // Query all salespersons
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, country, role")
    .eq("is_active", true)
    .in("role", ["salesperson", "super_admin"]);

  if (!profiles || profiles.length === 0) {
    return {
      summary: {
        salespersonId: "all",
        salespersonName: "All Salespeople",
        country: "UAE",
        openingCash: 0,
        totalCashCollected: 0,
        totalCashExpenses: 0,
        totalCashHandedOver: 0,
        currentCashInHand: 0,
        pendingExpensesCount: 0,
        pendingHandoversCount: 0,
      },
      entries: [],
    };
  }

  const results = await Promise.all(
    profiles.map((sp) =>
      calculateSalespersonCollectionLedger(supabase, sp.id, options).catch(() => null)
    )
  );

  const validResults = results.filter(
    (r): r is { summary: CollectionLedgerSummary; entries: CollectionLedgerEntry[] } => r !== null
  );

  let openingCash = 0;
  let totalCashCollected = 0;
  let totalCashExpenses = 0;
  let totalCashHandedOver = 0;
  let currentCashInHand = 0;
  let pendingExpensesCount = 0;
  let pendingHandoversCount = 0;
  let allEntries: CollectionLedgerEntry[] = [];

  validResults.forEach(({ summary, entries }) => {
    openingCash += summary.openingCash;
    totalCashCollected += summary.totalCashCollected;
    totalCashExpenses += summary.totalCashExpenses;
    totalCashHandedOver += summary.totalCashHandedOver;
    currentCashInHand += summary.currentCashInHand;
    pendingExpensesCount += summary.pendingExpensesCount;
    pendingHandoversCount += summary.pendingHandoversCount;

    // Append salesperson info to entry description if not already tagged
    const taggedEntries = entries.map((e) => ({
      ...e,
      description: `[${summary.salespersonName}] ${e.description}`,
    }));
    allEntries = allEntries.concat(taggedEntries);
  });

  // Re-sort combined stream oldest -> newest to recompute running total
  allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let runningBalance = 0;
  const consolidatedEntries: CollectionLedgerEntry[] = allEntries.map((item, idx) => {
    runningBalance += item.inAmount - item.outAmount;
    return {
      ...item,
      id: `all-led-${idx}-${item.referenceNo}`,
      balance: Math.max(0, runningBalance),
    };
  });

  consolidatedEntries.reverse();

  const summary: CollectionLedgerSummary = {
    salespersonId: "all",
    salespersonName: "All Salespeople",
    country: validResults[0]?.summary.country || "UAE",
    openingCash,
    totalCashCollected,
    totalCashExpenses,
    totalCashHandedOver,
    currentCashInHand,
    pendingExpensesCount,
    pendingHandoversCount,
  };

  return { summary, entries: consolidatedEntries };
}

/**
 * Fetches summaries for all active salespersons accessible under the user's role scope
 */
export async function getMultiSalespersonLedgerSummaries(
  supabase: SupabaseClient,
  userRole: string,
  userCountry: string,
  options?: LedgerQueryOptions
): Promise<CollectionLedgerSummary[]> {
  let query = supabase
    .from("profiles")
    .select("id, full_name, country, role")
    .eq("is_active", true);

  if (userRole === "accountant") {
    query = query.eq("country", userCountry);
  }

  const { data: profiles, error } = await query;
  if (error || !profiles) {
    console.error("Error fetching profiles for multi-salesperson summaries:", error);
    return [];
  }

  const salespersons = profiles.filter((p) => p.role === "salesperson" || p.role === "super_admin");

  const summaryResults = await Promise.all(
    salespersons.map(async (sp) => {
      try {
        const { summary } = await calculateSalespersonCollectionLedger(supabase, sp.id, options);
        return summary;
      } catch (e) {
        console.error(`Failed to calculate ledger for salesperson ${sp.full_name}:`, e);
        return null;
      }
    })
  );

  return summaryResults.filter((s): s is CollectionLedgerSummary => s !== null);
}
