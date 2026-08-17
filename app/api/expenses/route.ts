import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapExpenseFromDb, mapExpenseToDb } from "@/lib/db/mappers";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canViewExpenses(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view expenses" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const targetSalespersonId = searchParams.get("salespersonId") || searchParams.get("salesperson_id");
    const statusFilter = searchParams.get("status");
    const categoryFilter = searchParams.get("category");

    let query = supabase
      .from("expenses")
      .select("*, salesperson:profiles!expenses_salesperson_id_fkey(id, full_name, role), creator:profiles!expenses_created_by_fkey(id, full_name)")
      .order("expense_date", { ascending: false });

    // Fallback query if FK joins fail
    let { data, error } = await query;
    if (error && (error.message.includes("fkey") || error.message.includes("relationship"))) {
      const fallback = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("Failed to query expenses from Supabase:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let rows = data || [];

    // Filter out soft-deleted expenses unless super admin explicitly asks
    rows = rows.filter((row: any) => row.is_deleted !== true);

    // Apply Role & Country Scoping
    if (profile.role === "salesperson") {
      rows = rows.filter((row: any) => {
        const spId = row.salesperson_id || row.employee_id || row.created_by;
        return spId === profile.id;
      });
    } else if (profile.role === "accountant") {
      rows = rows.filter((row: any) => row.country === profile.country || !row.country);
    }

    // Filter by specific salesperson if requested
    if (targetSalespersonId) {
      rows = rows.filter((row: any) => {
        const spId = row.salesperson_id || row.employee_id || row.created_by;
        return spId === targetSalespersonId;
      });
    }

    // Filter by status if provided
    if (statusFilter) {
      rows = rows.filter((row: any) => (row.status || "Pending") === statusFilter);
    }

    // Filter by category if provided
    if (categoryFilter) {
      rows = rows.filter((row: any) => row.category === categoryFilter);
    }

    // Map profiles for names
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");
    const userMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => userMap.set(p.id, p.full_name));

    const expenses = rows.map((row: any) => mapExpenseFromDb(row, userMap));
    return NextResponse.json(expenses);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch expenses:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canCreateExpense(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot create expense" }, { status: 403 });
    }

    const body = await req.json();
    const { category, amount, paymentMethod, expenseDate, description, attachmentUrl } = body;

    // 1. Amount Validation (server-side)
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    }

    // 2. Category Validation
    const validCategories = ["Petrol", "Food", "Rent", "Travel", "Vehicle", "Accommodation", "Office", "Miscellaneous", "Other"];
    if (!category || !validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    // 3. Payment Method Validation
    const validMethods = ["Cash", "Company Card", "Personal Card", "Bank Transfer", "Other"];
    const methodVal = paymentMethod && validMethods.includes(paymentMethod) ? paymentMethod : "Cash";

    // 4. Derive Authenticated User Data
    const isValidUuid = typeof body.salespersonId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.salespersonId);
    const salespersonId = (Permissions.canViewAllLedgers(profile) && isValidUuid ? body.salespersonId : null) || profile.id;
    const dateVal = expenseDate || new Date().toISOString().split("T")[0];

    // Generate sequence number EXP-YYYY-XXXXXX
    let expenseNumber = "";
    try {
      expenseNumber = await generateNextDocumentNumber(supabase, "expenses", "expense_number", "EXP", 6);
    } catch (e) {
      expenseNumber = `EXP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    }

    const newExpense = {
      expenseNumber,
      expenseDate: dateVal,
      salespersonId,
      category,
      amount: parsedAmount,
      paymentMethod: methodVal,
      description: description || "",
      attachmentUrl: attachmentUrl || "",
      country: profile.country,
      status: "Pending" as const,
      createdBy: profile.id,
    };

    const adminClient = createAdminClient() || supabase;

    // Primary attempt: try inserting complete record with mapExpenseToDb
    const fullPayload = mapExpenseToDb(newExpense);

    let { data, error } = await adminClient
      .from("expenses")
      .insert([fullPayload])
      .select()
      .single();

    // Fallback if PostgREST schema cache returns missing column error for upgraded fields
    if (error && (error.message.includes("schema cache") || error.code === "PGRST204" || error.message.includes("column"))) {
      console.warn("Primary expense insert returned schema error, trying fallback payload:", error.message);
      
      const safeAttachment = typeof attachmentUrl === "string" && attachmentUrl.startsWith("http") ? attachmentUrl : null;
      
      let fallbackDesc = description || "";
      if (methodVal !== "Cash" && !fallbackDesc.includes("[Payment Method:")) {
        fallbackDesc = fallbackDesc ? `${fallbackDesc} [Payment Method: ${methodVal}]` : `[Payment Method: ${methodVal}]`;
      }

      // Fallback payload uses legacy database columns that exist on live DB
      const fallbackPayload: Record<string, any> = {
        expense_date: dateVal,
        employee_id: salespersonId,
        category,
        amount: parsedAmount,
        description: fallbackDesc,
        receipt_url: safeAttachment,
        status: "Pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const retry = await adminClient.from("expenses").insert([fallbackPayload]).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("Failed to insert expense into Supabase:", error);
      return NextResponse.json({ error: `Failed to create expense: ${error.message}` }, { status: 500 });
    }

    const mapped = mapExpenseFromDb(data);
    if (!mapped.paymentMethod) mapped.paymentMethod = methodVal as any;
    if (!mapped.country) mapped.country = profile.country;

    return NextResponse.json(mapped, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to create expense:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
