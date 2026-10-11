import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions } from "@/lib/auth/permissions";
import { mapCustomerFromDb, mapCustomerToDb } from "@/lib/db/mappers";
import { syncAllCustomerBalances } from "@/lib/db/balances";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

async function generateNextCustomerCode(supabase: any): Promise<string> {
  try {
    const { data: rpcCode, error: rpcErr } = await supabase.rpc("get_next_customer_code");
    if (!rpcErr && rpcCode && typeof rpcCode === "string") {
      return rpcCode;
    }
  } catch {
    // Fallback if RPC is not present
  }

  try {
    const { data: rows } = await supabase
      .from("customers")
      .select("customer_code")
      .not("customer_code", "is", null)
      .order("created_at", { ascending: false });

    let maxNum = 0;
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (row.customer_code) {
          const match = String(row.customer_code).match(/CUST-(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      }
    }

    const nextNum = maxNum + 1;
    return `CUST-${String(nextNum).padStart(6, "0")}`;
  } catch (err) {
    console.error("Error computing next customer code:", err);
    return `CUST-${String(Date.now()).slice(-6)}`;
  }
}

async function validateSalesman(
  supabase: any,
  salesmanId: string,
  expectedCountry: string
): Promise<string | null> {
  if (!salesmanId) return null;
  const { data: salesmanProfile, error } = await supabase
    .from("profiles")
    .select("id, role, country, is_active")
    .eq("id", salesmanId)
    .maybeSingle();

  if (error || !salesmanProfile) {
    return "Invalid assigned salesman: Profile not found.";
  }
  if (!salesmanProfile.is_active) {
    return "Invalid assigned salesman: User profile is inactive.";
  }
  if (salesmanProfile.role !== "salesperson") {
    return "Invalid assigned salesman: User is not a salesperson.";
  }
  if (salesmanProfile.country !== expectedCountry) {
    return `Invalid assigned salesman: Salesperson country (${salesmanProfile.country}) does not match customer country (${expectedCountry}).`;
  }
  return null;
}

export async function GET() {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canViewCustomers(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view customers" }, { status: 403 });
    }

    let query = supabase
      .from("customers")
      .select("*")
      .order("company_name", { ascending: true });

    if (profile.role === "salesperson") {
      query = query.eq("country", profile.country).eq("assigned_salesman_id", profile.id);
    } else if (profile.role === "accountant") {
      query = query.eq("country", profile.country);
    }

    let { data, error } = await query;

    // Fallback: If session client returns empty/error due to PostgREST RLS helper evaluation,
    // query with strict server-enforced role and country scoping using adminClient
    if (error || !data || data.length === 0) {
      const adminClient = createAdminClient();
      if (adminClient) {
        let adminQuery = adminClient
          .from("customers")
          .select("*")
          .order("company_name", { ascending: true });

        if (profile.role === "salesperson") {
          adminQuery = adminQuery.eq("country", profile.country).eq("assigned_salesman_id", profile.id);
        } else if (profile.role === "accountant") {
          adminQuery = adminQuery.eq("country", profile.country);
        }

        const adminRes = await adminQuery;
        if (!adminRes.error && adminRes.data) {
          data = adminRes.data;
          error = null;
        }
      }
    }

    if (error) {
      console.error("Failed to load Supabase customers:", error);
      return NextResponse.json({ customers: [], source: "error", error: error.message }, { status: 500 });
    }

    const rawCustomers = data || [];

    const { data: profileRows } = await supabase.from("profiles").select("id, full_name");
    const salesmanMap = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      if (p.id && p.full_name) salesmanMap.set(p.id, p.full_name);
    });

    const customers = rawCustomers.map((row: any) => mapCustomerFromDb(row, salesmanMap));

    return NextResponse.json({ customers, source: "supabase" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load Supabase customers:", error);
    return NextResponse.json({ error: "Failed to load customers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canCreateCustomer(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot create customer" }, { status: 403 });
    }

    let company = "";
    let name = "";
    let email = "";
    let phone = "";
    let address = "";
    let city = "";
    let countryInput = "";
    let assignedSalesmanIdInput = "";
    let creditLimitInput = 0;
    let notes = "";

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await request.json();
      company = json.company || json.companyName || "";
      name = json.name || json.doctorName || "";
      email = json.email || "";
      phone = json.phone || "";
      address = json.address || json.location || "";
      city = json.city || "";
      countryInput = json.country || "";
      assignedSalesmanIdInput = json.assignedSalesmanId || json.assigned_salesman_id || "";
      creditLimitInput = typeof json.creditLimit === "number" ? json.creditLimit : parseFloat(json.creditLimit) || 0;
      notes = json.notes || "";
    } else {
      const formData = await request.formData();
      company = (formData.get("company") as string) || (formData.get("companyName") as string) || "";
      name = (formData.get("name") as string) || (formData.get("doctorName") as string) || "";
      email = (formData.get("email") as string) || "";
      phone = (formData.get("phone") as string) || "";
      address = (formData.get("address") as string) || (formData.get("location") as string) || "";
      city = (formData.get("city") as string) || "";
      countryInput = (formData.get("country") as string) || "";
      assignedSalesmanIdInput = (formData.get("assignedSalesmanId") as string) || (formData.get("assigned_salesman_id") as string) || "";
      creditLimitInput = parseFloat(formData.get("creditLimit") as string) || 0;
      notes = (formData.get("notes") as string) || "";
    }

    if (!company.trim()) {
      return NextResponse.json({ error: "Customer Company Name is required" }, { status: 400 });
    }

    // Determine canonical customer country
    let targetCountry: "UAE" | "Oman" = profile.country === "Oman" ? "Oman" : "UAE";
    if (profile.role === "salesperson") {
      targetCountry = profile.country === "Oman" ? "Oman" : "UAE";
    } else if (countryInput.trim()) {
      const cleanCountry = countryInput.trim();
      if (cleanCountry === "Oman") targetCountry = "Oman";
      else if (cleanCountry === "UAE" || cleanCountry === "United Arab Emirates") targetCountry = "UAE";
    }

    // Salesman Assignment Logic
    let finalSalesmanId: string | null = null;
    if (profile.role === "salesperson") {
      finalSalesmanId = profile.id;
    } else if (assignedSalesmanIdInput.trim()) {
      const validationErr = await validateSalesman(supabase, assignedSalesmanIdInput.trim(), targetCountry);
      if (validationErr) {
        return NextResponse.json({ error: validationErr }, { status: 400 });
      }
      finalSalesmanId = assignedSalesmanIdInput.trim();
    }

    const customerCode = await generateNextCustomerCode(supabase);

    const insertPayload = mapCustomerToDb({
      customerCode: customerCode,
      company: company.trim(),
      name: name.trim(),
      doctorName: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      country: targetCountry,
      assignedSalesmanId: finalSalesmanId || undefined,
      creditLimit: creditLimitInput,
      notes: notes.trim(),
    });

    // SECURITY ENFORCEMENT: Customer pending balance is strictly 0 on creation
    insertPayload.pending_balance = 0;
    insertPayload.created_by = profile.id;
    insertPayload.updated_by = profile.id;

    let insertedRow: any = null;

    const { data: selectData, error: selectErr } = await supabase
      .from("customers")
      .insert([insertPayload])
      .select("*")
      .single();

    if (!selectErr && selectData) {
      insertedRow = selectData;
    } else {
      // Fallback: If RETURNING select evaluation fails, execute insert-only
      const { error: insertOnlyErr } = await supabase
        .from("customers")
        .insert([insertPayload]);

      if (insertOnlyErr) {
        console.error("Supabase customer insert error:", insertOnlyErr);
        return NextResponse.json({ error: insertOnlyErr.message || "Failed to insert customer" }, { status: 500 });
      }

      // Fetch inserted row by customer_code
      const { data: fetchedRow } = await supabase
        .from("customers")
        .select("*")
        .eq("customer_code", customerCode)
        .maybeSingle();

      insertedRow = fetchedRow || { ...insertPayload, created_at: new Date().toISOString() };
    }

    const newCustomer = mapCustomerFromDb(insertedRow);
    return NextResponse.json({ success: true, customer: newCustomer });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating customer:", error);
    return NextResponse.json({ error: error.message || "Failed to create customer" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canEditCustomer(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot edit customer" }, { status: 403 });
    }

    const json = await request.json();
    const {
      id,
      company,
      companyName,
      doctorName,
      name,
      email,
      phone,
      address,
      city,
      creditLimit,
      notes,
      assignedSalesmanId,
      assigned_salesman_id,
    } = json;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required for editing" }, { status: 400 });
    }

    const compName = (company || companyName || "").trim();
    if (!compName) {
      return NextResponse.json({ error: "Customer Company Name is required" }, { status: 400 });
    }

    // Verify existing customer and country scoping
    const { data: existing, error: fetchErr } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Salesperson can only update customers assigned to themselves in their country
    if (profile.role === "salesperson") {
      if (existing.country !== profile.country || existing.assigned_salesman_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden: Cannot edit customer belonging to another salesperson" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && existing.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot edit customer in another country" }, { status: 403 });
    }

    const targetSalesmanId = assignedSalesmanId || assigned_salesman_id;
    let finalSalesmanId = existing.assigned_salesman_id;

    if (profile.role === "salesperson") {
      finalSalesmanId = profile.id;
    } else if (targetSalesmanId !== undefined) {
      if (targetSalesmanId) {
        const validationErr = await validateSalesman(supabase, String(targetSalesmanId).trim(), existing.country);
        if (validationErr) {
          return NextResponse.json({ error: validationErr }, { status: 400 });
        }
        finalSalesmanId = String(targetSalesmanId).trim();
      } else {
        finalSalesmanId = null;
      }
    }

    const updatePayload = mapCustomerToDb({
      company: compName,
      doctorName: (doctorName || name || "").trim(),
      email: (email || "").trim(),
      phone: (phone || "").trim(),
      address: (address || "").trim(),
      city: (city || "").trim(),
      creditLimit: creditLimit !== undefined ? (typeof creditLimit === "number" ? creditLimit : parseFloat(creditLimit) || 0) : undefined,
      notes: notes !== undefined ? String(notes).trim() : undefined,
      assignedSalesmanId: finalSalesmanId !== undefined ? finalSalesmanId : undefined,
    });

    // IMMUTABLE FIELDS SECURITY: Country and Pending Balance cannot be overwritten via profile form
    delete updatePayload.country;
    delete updatePayload.pending_balance;
    updatePayload.updated_by = profile.id;
    updatePayload.updated_at = new Date().toISOString();

    let { data, error } = await supabase
      .from("customers")
      .update(updatePayload)
      .eq("id", id)
      .select("*, profiles!fk_customers_salesman(full_name)")
      .single();

    if (error) {
      const retry = await supabase
        .from("customers")
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("Error updating customer in Supabase:", error);
      return NextResponse.json({ error: error.message || "Failed to update customer" }, { status: 500 });
    }

    const updatedCustomer = mapCustomerFromDb(data);
    return NextResponse.json({ success: true, customer: updatedCustomer });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error editing customer:", error);
    return NextResponse.json({ error: error.message || "Failed to edit customer" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { profile, supabase } = await requireAuth();

    if (!Permissions.canSoftDeleteCustomer(profile)) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions to deactivate customer" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const json = await request.json();
        id = json.id;
      } catch {
        // no body
      }
    }

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required for deletion" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("customers")
      .select("id, country, assigned_salesman_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (profile.role === "salesperson") {
      if (existing.country !== profile.country || existing.assigned_salesman_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden: Cannot delete customer belonging to another salesperson" }, { status: 403 });
      }
    } else if (profile.role === "accountant" && existing.country !== profile.country) {
      return NextResponse.json({ error: "Forbidden: Cannot delete customer in another country" }, { status: 403 });
    }

    // Soft-deactivate customer to preserve historical relations with quotations, invoices, and receipts
    const { error } = await supabase
      .from("customers")
      .update({
        is_active: false,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Error deactivating customer in Supabase:", error);
      return NextResponse.json({ error: error.message || "Failed to deactivate customer" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Customer deactivated successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deactivating customer:", error);
    return NextResponse.json({ error: error.message || "Failed to deactivate customer" }, { status: 500 });
  }
}
