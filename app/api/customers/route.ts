import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { cookies } from "next/headers";
import { Customer } from "@/types";

export const dynamic = "force-dynamic";

async function getSupabase() {
  try {
    const cookieStore = await cookies();
    return createServerClient(cookieStore);
  } catch {
    return createBrowserClient();
  }
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) {
      console.error("Failed to load Supabase customers:", error);
      return NextResponse.json({ 
        customers: [], 
        source: "error", 
        error: error.message 
      });
    }

    const customers: Customer[] = (data || []).map((row: any) => ({
      id: row.id || `cust-${Date.now()}`,
      company: row.company_name || "",
      name: row.notes || "",
      address: row.address || row.city || "",
      phone: row.phone || "",
      email: row.email || "",
      pendingBillwiseAmount: typeof row.pending_balance === "number" ? row.pending_balance : parseFloat(row.pending_balance) || 0,
    }));

    return NextResponse.json({ 
      customers, 
      source: "supabase" 
    });
  } catch (error) {
    console.error("Failed to load Supabase customers:", error);
    return NextResponse.json({ 
      customers: [], 
      source: "error", 
      error: "Failed to load Supabase customers" 
    });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const company = formData.get("company") as string;
    const name = (formData.get("name") as string) || "";
    const location = (formData.get("location") as string) || "";
    const pendingAmount = (formData.get("pendingAmount") as string) || "0";

    if (!company) {
      return NextResponse.json({ error: "Customer Company Name is required" }, { status: 400 });
    }

    const cleanedCompany = company.replace(/^"|"$/g, "").trim();
    const cleanedName = name.replace(/^"|"$/g, "").trim();
    const cleanedLocation = location.replace(/^"|"$/g, "").trim();
    const pendingAmountNum = parseFloat(pendingAmount) || 0;

    const supabase = await getSupabase();

    const insertPayload = {
      company_name: cleanedCompany,
      notes: cleanedName,
      address: cleanedLocation,
      pending_balance: pendingAmountNum,
      phone: "",
      email: "",
    };

    const { data, error } = await supabase
      .from("customers")
      .insert([insertPayload])
      .select("*")
      .single();

    if (error) {
      console.error("Supabase customer insert error:", error);
    }

    const newCustomer: Customer = {
      id: data?.id || `cust-${Date.now()}`,
      company: data?.company_name || cleanedCompany,
      name: data?.notes || cleanedName,
      address: data?.address || cleanedLocation,
      phone: data?.phone || "",
      email: data?.email || "",
      pendingBillwiseAmount: data?.pending_balance !== undefined ? Number(data.pending_balance) : pendingAmountNum,
    };

    return NextResponse.json({ success: true, customer: newCustomer });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { companyName, customerId, amountToAdd } = await request.json();

    if ((!companyName && !customerId) || amountToAdd === undefined) {
      return NextResponse.json({ error: "Customer identifier and amountToAdd are required" }, { status: 400 });
    }

    const supabase = await getSupabase();
    let query = supabase.from("customers").select("*");
    if (customerId) {
      query = query.eq("id", customerId);
    } else if (companyName) {
      query = query.eq("company_name", companyName);
    }

    const { data: existingRows, error: fetchErr } = await query;
    if (fetchErr) {
      console.error("Error fetching customer for pending amount update:", fetchErr);
    }

    if (existingRows && existingRows.length > 0) {
      const targetCustomer = existingRows[0];
      const currentBalance = typeof targetCustomer.pending_balance === "number"
        ? targetCustomer.pending_balance
        : parseFloat(targetCustomer.pending_balance) || 0;
      const newBalance = Math.max(0, currentBalance + (parseFloat(amountToAdd) || 0));

      const { error: updateErr } = await supabase
        .from("customers")
        .update({ pending_balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", targetCustomer.id);

      if (updateErr) {
        console.error("Error updating pending_balance in Supabase:", updateErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating customer pending amount:", error);
    return NextResponse.json({ error: "Failed to update pending amount" }, { status: 500 });
  }
}

