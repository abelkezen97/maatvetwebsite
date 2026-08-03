import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let scriptUrl = process.env.GOOGLE_RECEIPTS_SCRIPT_URL;

    if (!scriptUrl) {
      console.warn("GOOGLE_RECEIPTS_SCRIPT_URL is not configured.");
      return NextResponse.json([]);
    }

    scriptUrl = scriptUrl.replace(/^"|"$/g, "").trim();

    const response = await fetch(scriptUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Google Apps Script responded with status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load receipts from Google Sheet:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { searchParams } = new URL(request.url);
    let scriptUrl = process.env.GOOGLE_RECEIPTS_SCRIPT_URL;

    if (scriptUrl) {
      scriptUrl = scriptUrl.replace(/^"|"$/g, "").trim();

      // Method 1: Try POST JSON payload
      try {
        const response = await fetch(scriptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          redirect: "follow",
        });

        const resText = await response.text();
        console.log("Google Apps Script Receipt POST response:", response.status, resText);
      } catch (postErr) {
        console.warn("POST failed, trying GET fallback...", postErr);
      }

      // Method 2: Fallback GET request to ensure row appending even if POST redirect is blocked
      const getParams = new URLSearchParams();
      getParams.append("receiptNumber", payload.receiptNumber || searchParams.get("receiptNumber") || "");
      getParams.append("companyName", payload.companyName || searchParams.get("companyName") || "");
      getParams.append("customerName", payload.customerName || searchParams.get("customerName") || "");
      getParams.append("amountPaid", (payload.amountPaid || searchParams.get("amountPaid") || 0).toString());
      getParams.append("paymentDate", payload.paymentDate || searchParams.get("paymentDate") || "");
      getParams.append("paymentMethod", payload.paymentMethod || searchParams.get("paymentMethod") || "");
      getParams.append("referenceNo", payload.referenceNo || searchParams.get("referenceNo") || "");
      getParams.append("action", "addReceipt");

      const targetUrl = scriptUrl + (scriptUrl.includes("?") ? "&" : "?") + getParams.toString();
      const getRes = await fetch(targetUrl, { method: "GET", cache: "no-store" });
      const getResText = await getRes.text();
      console.log("Google Apps Script Receipt GET fallback response:", getRes.status, getResText);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving receipt:", error);
    return NextResponse.json({ error: "Failed to save receipt" }, { status: 500 });
  }
}
