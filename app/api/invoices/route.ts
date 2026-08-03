import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

let cachedInvoices: any[] | null = null;
let lastInvoicesFetchTime = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes in-memory cache

export function clearInvoicesCache() {
  cachedInvoices = null;
  lastInvoicesFetchTime = 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  const now = Date.now();

  if (!forceRefresh && cachedInvoices && now - lastInvoicesFetchTime < CACHE_TTL) {
    return NextResponse.json(cachedInvoices);
  }

  try {
    const scriptUrl = process.env.GOOGLE_INVOICES_SCRIPT_URL;

    if (!scriptUrl) {
      console.warn("GOOGLE_INVOICES_SCRIPT_URL is not configured.");
      return NextResponse.json(cachedInvoices || []);
    }

    const response = await fetch(scriptUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Google Apps Script responded with status ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      cachedInvoices = data;
      lastInvoicesFetchTime = now;
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load invoices from Google Sheet:", error);
    return NextResponse.json(cachedInvoices || []);
  }
}

export async function POST(request: Request) {
  clearInvoicesCache();
  try {
    const payload = await request.json();
    const scriptUrl = process.env.GOOGLE_INVOICES_SCRIPT_URL;

    if (!scriptUrl) {
      return NextResponse.json({ success: true });
    }

    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving invoice:", error);
    return NextResponse.json({ error: "Failed to save invoice" }, { status: 500 });
  }
}
