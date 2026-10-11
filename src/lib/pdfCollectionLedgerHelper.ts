import jsPDF from "jspdf";
import { CollectionLedgerEntry, CollectionLedgerSummary } from "@/types";

const formatDateStr = (dateStr?: string): string => {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
};

/**
 * Builds a clean, publication-quality Collection Ledger PDF statement.
 */
export const buildCollectionLedgerPDF = (
  summary: CollectionLedgerSummary,
  entries: CollectionLedgerEntry[],
  options?: { startDate?: string; endDate?: string }
): jsPDF => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const NAVY = [27, 42, 74];
  const TEXT_DARK = [30, 41, 59];
  const TEXT_MUTED = [100, 116, 139];
  const LIGHT_BG = [248, 250, 252];
  const BORDER_COLOR = [226, 232, 240];

  const currencySymbol = summary.country === "Oman" ? "OMR" : "AED";

  // Header Banner Generator
  const drawHeader = () => {
    // Top Navy Header Bar
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, 210, 32, "F");

    // Title (Left side)
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("SALESPERSON COLLECTION LEDGER", 14, 16);

    // Company Subtitle (Left side)
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 215, 235);
    doc.text("MAAT VETERINARY MEDICINES TRADING", 14, 24);

    // Document Meta (Right side - No overlap)
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 215, 235);
    doc.text("PHYSICAL CASH & EXPENSE STATEMENT", 196, 16, { align: "right" });

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated: ${formatDateStr(new Date().toISOString())}`, 196, 24, { align: "right" });
  };

  drawHeader();

  // 1. Salesperson Meta Information Box
  let y = 38;
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
  doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  doc.roundedRect(14, y, 182, 18, 2, 2, "FD");

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("SALESPERSON NAME", 20, y + 6);
  doc.text("COUNTRY / REGION", 92, y + 6);
  doc.text("DATE RANGE FILTER", 148, y + 6);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(summary.salespersonName || "Salesperson", 20, y + 13);
  doc.text(summary.country || "UAE", 92, y + 13);

  let dateRangeLabel = "All Time";
  if (options?.startDate && options?.endDate) {
    dateRangeLabel = `${formatDateStr(options.startDate)} to ${formatDateStr(options.endDate)}`;
  } else if (options?.startDate) {
    dateRangeLabel = `From ${formatDateStr(options.startDate)}`;
  }
  doc.text(dateRangeLabel, 148, y + 13);

  // 2. Summary KPI Cards (4 Elegant Light Tint Cards)
  y += 23;
  const cardW = 43.5;
  const cardH = 18;
  const gap = 2.6;

  // Card 1: Cash in Hand (Soft Emerald)
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(14, y, cardW, cardH, 2, 2, "FD");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(4, 120, 87); // Emerald Dark
  doc.text("CASH IN HAND", 18, y + 5.5);
  doc.setFontSize(10.5);
  doc.text(`${currencySymbol} ${summary.currentCashInHand.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 18, y + 13);

  // Card 2: Cash Collected (Soft Blue)
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(186, 230, 253);
  doc.roundedRect(14 + cardW + gap, y, cardW, cardH, 2, 2, "FD");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 105, 161); // Blue Dark
  doc.text("CASH COLLECTED", 14 + cardW + gap + 4, y + 5.5);
  doc.setFontSize(10);
  doc.text(`${currencySymbol} ${summary.totalCashCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 14 + cardW + gap + 4, y + 13);

  // Card 3: Approved Expenses (Soft Rose)
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(14 + (cardW + gap) * 2, y, cardW, cardH, 2, 2, "FD");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(190, 18, 60); // Rose Dark
  doc.text("APPROVED EXPENSES", 14 + (cardW + gap) * 2 + 4, y + 5.5);
  doc.setFontSize(10);
  doc.text(`${currencySymbol} ${summary.totalCashExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 14 + (cardW + gap) * 2 + 4, y + 13);

  // Card 4: Cash Handed Over (Soft Slate)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14 + (cardW + gap) * 3, y, cardW, cardH, 2, 2, "FD");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("CASH HANDED OVER", 14 + (cardW + gap) * 3 + 4, y + 5.5);
  doc.setFontSize(10);
  doc.text(`${currencySymbol} ${summary.totalCashHandedOver.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 14 + (cardW + gap) * 3 + 4, y + 13);

  // 3. Table Headers & Layout
  y += 24;

  const colX = {
    date: 16,
    desc: 36,
    ref: 88,
    method: 124,
    in: 156,
    out: 176,
    bal: 196,
  };

  const drawTableHeader = (posY: number) => {
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(14, posY, 182, 7, "F");

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);

    doc.text("DATE", colX.date, posY + 4.8);
    doc.text("DESCRIPTION", colX.desc, posY + 4.8);
    doc.text("REFERENCE #", colX.ref, posY + 4.8);
    doc.text("METHOD", colX.method, posY + 4.8);
    doc.text(`IN (${currencySymbol})`, colX.in, posY + 4.8, { align: "right" });
    doc.text(`OUT (${currencySymbol})`, colX.out, posY + 4.8, { align: "right" });
    doc.text(`BALANCE`, colX.bal, posY + 4.8, { align: "right" });
  };

  drawTableHeader(y);
  y += 7;

  const pageHeight = 297;
  const marginBottom = 22;

  // Render entries in standard chronological stream
  const renderEntries = [...entries].reverse();

  renderEntries.forEach((entry, idx) => {
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      y = 38;
      drawTableHeader(y);
      y += 7;
    }

    const rowBg = idx % 2 === 0 ? [255, 255, 255] : LIGHT_BG;
    doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
    doc.rect(14, y, 182, 6.5, "F");

    doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
    doc.line(14, y + 6.5, 196, y + 6.5);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

    // Date
    doc.text(formatDateStr(entry.date), colX.date, y + 4.5);

    // Description (Truncate if too wide)
    let descText = entry.description || "Transaction";
    if (descText.length > 34) descText = descText.slice(0, 32) + "...";
    doc.text(descText, colX.desc, y + 4.5);

    // Reference # (Truncate gracefully to prevent collision with Method column)
    let refText = entry.referenceNo || "—";
    if (refText.length > 20) refText = refText.slice(0, 18) + "..";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(refText, colX.ref, y + 4.5);

    // Payment Method
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text(entry.paymentMethod || "Cash", colX.method, y + 4.5);

    // In Amount (Green)
    if (entry.inAmount > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129);
      doc.text(`+${entry.inAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, colX.in, y + 4.5, { align: "right" });
    } else {
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text("—", colX.in, y + 4.5, { align: "right" });
    }

    // Out Amount (Red)
    if (entry.outAmount > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(225, 29, 72);
      doc.text(`-${entry.outAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, colX.out, y + 4.5, { align: "right" });
    } else {
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text("—", colX.out, y + 4.5, { align: "right" });
    }

    // Running Balance (Navy Bold)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(entry.balance.toLocaleString("en-US", { minimumFractionDigits: 2 }), colX.bal, y + 4.5, { align: "right" });

    y += 6.5;
  });

  // Signatures & Verification Block
  if (y > pageHeight - 45) {
    doc.addPage();
    drawHeader();
    y = 38;
  }

  y += 10;
  doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  doc.line(14, y, 196, y);

  y += 10;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);

  doc.text("SALESPERSON SIGNATURE", 25, y);
  doc.line(25, y + 10, 75, y + 10);

  doc.text("ACCOUNTANT VERIFICATION", 135, y);
  doc.line(135, y + 10, 185, y + 10);

  // Footer Page Numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);

    doc.text("This is an official computer-generated collection ledger statement.", 14, 290);
    doc.text(`Page ${i} of ${totalPages}`, 196, 290, { align: "right" });
  }

  return doc;
};
