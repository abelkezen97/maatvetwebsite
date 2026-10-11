import jsPDF from "jspdf";
import { Receipt } from "@/types";

export const buildReceiptPDF = (receipt: Receipt): jsPDF => {
  const doc = new jsPDF();

  const greenHeaderColor = [16, 122, 87]; // Emerald Green (#107A57)
  const greyDark = [50, 50, 50];
  const greyBorder = [210, 225, 215];

  // Extract ONLY Date (YYYY-MM-DD) without time or timezone string
  let rawDate = (receipt.paymentDate || "").toString();
  if (rawDate.includes("T")) {
    rawDate = rawDate.split("T")[0];
  } else if (rawDate.includes(" ")) {
    rawDate = rawDate.split(" ")[0];
  }
  const cleanDate = rawDate || new Date().toISOString().split("T")[0];

  // Top Header Banner in Green (Height 35mm)
  doc.setFillColor(greenHeaderColor[0], greenHeaderColor[1], greenHeaderColor[2]);
  doc.rect(0, 0, 210, 35, "F");

  // Title in White
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PAYMENT RECEIPT", 15, 16);

  // Subheader: Receipt No & Date
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Receipt No: ${receipt.receiptNumber}`, 15, 26);
  doc.text(`Date: ${cleanDate}`, 195, 26, { align: "right" });

  // Reset text color for content body
  doc.setTextColor(greyDark[0], greyDark[1], greyDark[2]);

  let yPos = 48;

  // Box container for customer payment details
  doc.setDrawColor(greyBorder[0], greyBorder[1], greyBorder[2]);
  doc.setFillColor(248, 252, 249); // Clean subtle mint tint
  doc.roundedRect(15, yPos, 180, 68, 3, 3, "FD");

  // Row 1: Received From
  let boxY = yPos + 12;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Received From:", 22, boxY);
  doc.setFont("helvetica", "normal");
  const custNameStr = receipt.companyName + (receipt.customerName ? ` (${receipt.customerName})` : "");
  doc.text(custNameStr, 75, boxY);

  const currencySymbol = receipt.country === "Oman" ? "OMR" : "AED";

  // Row 2: Amount Received
  boxY += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Amount Received:", 22, boxY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(greenHeaderColor[0], greenHeaderColor[1], greenHeaderColor[2]);
  doc.text(`${currencySymbol} ${(receipt.amountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 75, boxY);

  // Row 3: Payment Method
  doc.setTextColor(greyDark[0], greyDark[1], greyDark[2]);
  boxY += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Payment Method:", 22, boxY);
  doc.setFont("helvetica", "normal");
  doc.text(receipt.paymentMethod || "Cash", 75, boxY);

  // Row 4: Reference / Cheque No
  if (receipt.referenceNo) {
    boxY += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Reference / Cheque No:", 22, boxY);
    doc.setFont("helvetica", "normal");
    doc.text(receipt.referenceNo, 75, boxY);
  }

  // Row 5: Remaining Pending Credit
  boxY += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Remaining Pending Credit:", 22, boxY);
  doc.setFont("helvetica", "bold");
  const remAmt = Math.max(0, receipt.remainingPendingAmount || 0);
  if (remAmt > 0) {
    doc.setTextColor(190, 18, 60); // Rose red for outstanding credit
  } else {
    doc.setTextColor(16, 122, 87); // Emerald green for zero balance
  }
  doc.text(`${currencySymbol} ${remAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 75, boxY);
  doc.setTextColor(greyDark[0], greyDark[1], greyDark[2]);

  // Notes section
  yPos = 128;
  if (receipt.notes && receipt.notes.trim() !== "") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes / Remarks:", 15, yPos);
    doc.setFont("helvetica", "italic");
    const splitNotes = doc.splitTextToSize(receipt.notes.trim(), 180);
    doc.text(splitNotes, 15, yPos + 6);
    yPos += 14 + splitNotes.length * 4;
  } else {
    yPos += 10;
  }

  // Footer Disclaimer & Signatures
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 120, 115);
  doc.text("Thank you for your payment. Outstanding billwise credit has been adjusted accordingly.", 15, yPos);

  yPos += 15;
  try {
    doc.addImage("/kaleemsignature.png", "PNG", 145, yPos, 40, 15);
    yPos += 16;
  } catch (err) {
    yPos += 13;
  }

  doc.setDrawColor(200, 215, 205);
  doc.line(135, yPos, 195, yPos);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(greenHeaderColor[0], greenHeaderColor[1], greenHeaderColor[2]);
  doc.text("Authorized Signature", 165, yPos + 6, { align: "center" });

  return doc;
};
