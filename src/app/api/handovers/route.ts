import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions, isCountryStaff } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
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
    } else if (isCountryStaff(profile)) {
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

    // SERVER-SIDE FINANCIAL VALIDATION: Calculate available cash in hand up to handover date
    const { calculateSalespersonCollectionLedger } = await import("@/lib/db/collectionLedger");
    const { summary: ledgerSummary } = await calculateSalespersonCollectionLedger(adminClient, salespersonId, {
      endDate: dateVal,
    });

    const availableCash = Math.max(0, ledgerSummary.currentCashInHand);
    const requestedAmount = Number(amount);

    if (requestedAmount > availableCash) {
      const formattedAvailable = formatMoney(availableCash, profile.country);
      return NextResponse.json(
        {
          error: `Insufficient cash available. Current cash balance is ${formattedAvailable}. Maximum handover allowed is ${formattedAvailable}.`,
          availableCash,
        },
        { status: 400 }
      );
    }

    // DUPLICATE PROTECTION: Check for duplicate handover created recently (within 15 seconds)
    const fifteenSecsAgo = new Date(Date.now() - 15000).toISOString();
    const { data: existingDuplicates } = await adminClient
      .from("cash_handovers")
      .select("*")
      .eq("salesperson_id", salespersonId)
      .eq("amount", requestedAmount)
      .eq("handover_date", dateVal)
      .gte("created_at", fifteenSecsAgo)
      .limit(1);

    if (existingDuplicates && existingDuplicates.length > 0) {
      console.log("Duplicate handover submission detected; returning existing record.");
      return NextResponse.json(mapHandoverFromDb(existingDuplicates[0]), { status: 200 });
    }

    // Who receives the cash (it is added to their cash in hand):
    // - staff recording a salesman's handover -> that staff member;
    // - a salesman handing over his own cash -> his country's admin;
    // - an admin's own handover (e.g. a bank deposit) -> nobody.
    let receiverId: string | undefined = receivedBy || undefined;
    if (!receiverId) {
      if (salespersonId !== profile.id) {
        receiverId = profile.id;
      } else if (profile.role === "salesperson") {
        const { data: admins } = await adminClient
          .from("profiles")
          .select("id")
          .eq("role", "super_admin")
          .eq("country", profile.country)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1);
        receiverId = admins?.[0]?.id || undefined;
      }
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
      receivedBy: receiverId,
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
