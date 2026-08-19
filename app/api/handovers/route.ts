import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapHandoverFromDb, mapHandoverToDb } from "@/lib/db/mappers";
import { generateNextDocumentNumber } from "@/lib/db/sequence";
import { createAdminClient } from "@/utils/supabase/admin";
import { CashHandover, HandoverType } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canViewHandovers(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view handovers" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const targetSalespersonId = searchParams.get("salespersonId") || searchParams.get("salesperson_id");
    const statusFilter = searchParams.get("status");

    let query = supabase
      .from("cash_handovers")
      .select("*, salesperson:profiles!cash_handovers_salesperson_id_fkey(id, full_name, role), recipient:profiles!cash_handovers_received_by_fkey(id, full_name)")
      .order("handover_date", { ascending: false });

    let { data, error } = await query;
    if (error) {
      const fallback = await supabase
        .from("cash_handovers")
        .select("*")
        .order("handover_date", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("Failed to query handovers from Supabase:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let rows = data || [];
    rows = rows.filter((r: any) => r.is_deleted !== true);

    if (profile.role === "salesperson") {
      rows = rows.filter((r: any) => (r.salesperson_id || r.created_by) === profile.id);
    } else if (profile.role === "accountant") {
      rows = rows.filter((r: any) => r.country === profile.country || !r.country);
    }

    if (targetSalespersonId) {
      rows = rows.filter((r: any) => (r.salesperson_id || r.created_by) === targetSalespersonId);
    }

    if (statusFilter) {
      rows = rows.filter((r: any) => (r.status || "Pending") === statusFilter);
    }

    const { data: profiles } = await supabase.from("profiles").select("id, full_name");
    const userMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => userMap.set(p.id, p.full_name));

    const handovers = rows.map((r: any) => mapHandoverFromDb(r, userMap));
    return NextResponse.json(handovers);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch cash handovers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canCreateHandover(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot create cash handover request" }, { status: 403 });
    }

    const body = await req.json();
    const { amount, handoverDate, handoverType, receivedBy, referenceNumber, notes, status } = body;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "A positive cash handover amount is required" }, { status: 400 });
    }

    const salespersonId = (Permissions.canViewAllLedgers(profile) && body.salespersonId) || profile.id;
    const dateVal = handoverDate || new Date().toISOString().split("T")[0];
    const typeVal: HandoverType = handoverType === "carry_forward" ? "carry_forward" : "admin_handover";
    const statusVal = status || "Approved";

    const adminClient = createAdminClient() || supabase;

    // DUPLICATE PROTECTION: Check for duplicate handover created recently (within 15 seconds)
    const fifteenSecsAgo = new Date(Date.now() - 15000).toISOString();
    const { data: existingDuplicates } = await adminClient
      .from("cash_handovers")
      .select("*")
      .eq("salesperson_id", salespersonId)
      .eq("amount", Number(amount))
      .eq("handover_date", dateVal)
      .gte("created_at", fifteenSecsAgo)
      .limit(1);

    if (existingDuplicates && existingDuplicates.length > 0) {
      console.log("Duplicate handover submission detected; returning existing record.");
      return NextResponse.json(mapHandoverFromDb(existingDuplicates[0]), { status: 200 });
    }

    let handoverNumber = "";
    const prefix: "CH" | "CF" = typeVal === "carry_forward" ? "CF" : "CH";
    try {
      handoverNumber = await generateNextDocumentNumber(supabase, "cash_handovers", "handover_number", prefix, 6);
    } catch (e) {
      handoverNumber = `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    }

    const newHandover: Partial<CashHandover> = {
      handoverNumber,
      handoverDate: dateVal,
      salespersonId,
      receivedBy: receivedBy || profile.id,
      amount: Number(amount),
      handoverType: typeVal,
      referenceNumber: referenceNumber || "",
      notes: notes || "",
      country: profile.country,
      status: statusVal,
      approvedBy: statusVal === "Approved" ? profile.id : undefined,
      approvedAt: statusVal === "Approved" ? new Date().toISOString() : undefined,
      createdBy: profile.id,
    };

    const insertPayload = mapHandoverToDb(newHandover);

    const { data, error } = await adminClient
      .from("cash_handovers")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error("Failed to insert cash handover into Supabase:", error);
      return NextResponse.json({ error: `Failed to create handover: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(mapHandoverFromDb(data), { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create cash handover" }, { status: 500 });
  }
}
