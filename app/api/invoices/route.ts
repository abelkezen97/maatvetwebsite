import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scriptUrl = process.env.GOOGLE_INVOICES_SCRIPT_URL;

    if (!scriptUrl) {
      console.warn("GOOGLE_INVOICES_SCRIPT_URL is not configured.");
      return NextResponse.json([]);
    }

    const response = await fetch(scriptUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Google Apps Script responded with status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load invoices from Google Sheet:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const scriptUrl = process.env.GOOGLE_INVOICES_SCRIPT_URL;

    if (!scriptUrl) {
      console.warn("GOOGLE_INVOICES_SCRIPT_URL is not configured in environment variables.");
      return NextResponse.json({ error: "Google Invoices script URL is not configured." }, { status: 500 });
    }

    // Forward the payload to Google Apps Script Web App
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script responded with status ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving invoice to Google Drive:", error);
    return NextResponse.json({ error: "Failed to save invoice" }, { status: 500 });
  }
}
