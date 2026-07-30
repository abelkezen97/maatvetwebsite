import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { fetchCustomersFromGoogleSheet, clearCustomersCache } from "@/services/sheets";
import { Customer } from "@/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("refresh") === "true" || searchParams.get("t")) {
      clearCustomersCache();
    }
    const sheetCustomers = await fetchCustomersFromGoogleSheet();
    return NextResponse.json({ 
      customers: sheetCustomers, 
      source: "google_sheets" 
    });
  } catch (error) {
    console.error("Failed to load Google Sheet customers:", error);
    return NextResponse.json({ 
      customers: [], 
      source: "error", 
      error: "Failed to load Google Sheet customers" 
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

    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      company: company.replace(/^"|"$/g, ""),
      name: name.replace(/^"|"$/g, "") || "",
      address: location.replace(/^"|"$/g, ""),
      phone: "", // blank
      email: "",
      pendingBillwiseAmount: parseFloat(pendingAmount) || 0,
    };

    // Submit to Google Apps Script Web App
    let scriptUrl = process.env.GOOGLE_CUSTOMERS_SCRIPT_URL;
    if (scriptUrl) {
      scriptUrl = scriptUrl.replace(/^"|"$/g, "");
      try {
        const params = new URLSearchParams();
        params.append("company", company);
        params.append("name", name);
        params.append("location", location);
        params.append("pendingAmount", pendingAmount);

        const targetUrl = scriptUrl + (scriptUrl.includes("?") ? "&" : "?") + params.toString();


        const response = await fetch(targetUrl, {
          method: "GET",
          cache: "no-store"
        });
        const resText = await response.text();
        console.log("Customer Apps Script Response:", response.status, resText);
      } catch (scriptError) {
        console.error("Google Apps Script customer post failed:", scriptError);
      }
    }

    clearCustomersCache();
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

    let scriptUrl = process.env.GOOGLE_CUSTOMERS_SCRIPT_URL;
    if (scriptUrl) {
      scriptUrl = scriptUrl.replace(/^"|"$/g, "");
      try {
        const params = new URLSearchParams();
        if (companyName) params.append("company", companyName);
        if (customerId) params.append("customerId", customerId);
        params.append("amountToAdd", amountToAdd.toString());
        params.append("action", "updatePending");

        const targetUrl = scriptUrl + (scriptUrl.includes("?") ? "&" : "?") + params.toString();
        const response = await fetch(targetUrl, { method: "GET", cache: "no-store" });
        const resText = await response.text();
        console.log("Apps Script updatePending Response:", response.status, resText);
      } catch (err) {
        console.error("Failed to post pending amount update to Google Apps Script:", err);
      }
    }

    clearCustomersCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating customer pending amount:", error);
    return NextResponse.json({ error: "Failed to update pending amount" }, { status: 500 });
  }
}

