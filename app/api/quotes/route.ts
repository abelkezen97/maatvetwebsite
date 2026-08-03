import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

let cachedQuotes: any[] | null = null;
let lastQuotesFetchTime = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes in-memory cache

export function clearQuotesCache() {
  cachedQuotes = null;
  lastQuotesFetchTime = 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  const now = Date.now();

  if (!forceRefresh && cachedQuotes && now - lastQuotesFetchTime < CACHE_TTL) {
    return NextResponse.json(cachedQuotes);
  }

  try {
    const scriptUrl = process.env.GOOGLE_QUOTES_SCRIPT_URL;

    if (!scriptUrl) {
      console.warn("GOOGLE_QUOTES_SCRIPT_URL is not configured.");
      return NextResponse.json(cachedQuotes || []);
    }

    const response = await fetch(scriptUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Google Apps Script responded with status ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      cachedQuotes = data;
      lastQuotesFetchTime = now;
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load quotes from Google Sheet:", error);
    return NextResponse.json(cachedQuotes || []);
  }
}

export async function POST(request: Request) {
  clearQuotesCache();
  try {
    const payload = await request.json();
    const scriptUrl = process.env.GOOGLE_QUOTES_SCRIPT_URL;

    if (!scriptUrl) {
      console.warn("GOOGLE_QUOTES_SCRIPT_URL is not configured in environment variables.");
      return NextResponse.json({ error: "Google Quotes script URL is not configured." }, { status: 500 });
    }

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
    console.error("Error saving quote to Google Drive:", error);
    return NextResponse.json({ error: "Failed to save quote" }, { status: 500 });
  }
}
