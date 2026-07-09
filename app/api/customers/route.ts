import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { fetchCustomersFromGoogleSheet, clearCustomersCache } from "@/services/sheets";
import { Customer } from "@/types";

export async function GET() {
  try {
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
