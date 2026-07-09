import jsPDF from "jspdf";
import { Quote } from "@/types";

export const buildPDF = (quote: Quote): jsPDF => {
  const doc = new jsPDF();

  // 1. Color Palette Definitions
  const primaryColor = [27, 42, 74]; // #1B2A4A
  const accentColor = [97, 152, 155]; // #61989B
  const greyDark = [50, 50, 50];
  const greyLight = [220, 220, 220];

  // Header Background Block
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 35, "F");

  // Title / Ref No Only in White
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("QUOTATION", 15, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Ref: ${quote.quoteNumber}`, 15, 23);

  // Reset text color for content
  doc.setTextColor(greyDark[0], greyDark[1], greyDark[2]);

  const hasDiscount = quote.discountTotal > 0;

  // Table Headers
  doc.setFont("helvetica", "bold");
  doc.text("Item / Product Details", 15, 44);
  doc.text("Qty", 115, 44, { align: "right" });
  if (hasDiscount) {
    doc.text("Base Price", 142, 44, { align: "right" });
    doc.text("Disc. Price", 168, 44, { align: "right" });
  } else {
    doc.text("Price", 168, 44, { align: "right" });
  }
  doc.text("Total (AED)", 195, 44, { align: "right" });

  // Table divider
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.5);
  doc.line(15, 47, 195, 47);
  doc.setLineWidth(0.1);

  // Table Rows
  let yPos = 55;
  doc.setFont("helvetica", "normal");
  quote.items.forEach((item) => {
    // Split description if it overflows
    const splitName = doc.splitTextToSize(item.productName, 90);
    doc.text(splitName, 15, yPos);
    doc.text(`${item.quantity}`, 115, yPos, { align: "right" });
    if (hasDiscount) {
      doc.text(`${item.price.toFixed(2)}`, 142, yPos, { align: "right" });
      const discVal = item.discount < item.price ? item.discount.toFixed(2) : "—";
      doc.text(discVal, 168, yPos, { align: "right" });
    } else {
      doc.text(`${item.price.toFixed(2)}`, 168, yPos, { align: "right" });
    }
    doc.text(`${item.total.toFixed(2)}`, 195, yPos, { align: "right" });

    const lines = splitName.length;
    yPos += 8 + (lines - 1) * 4;
  });

  // Summary calculation block
  yPos += 5;
  doc.setDrawColor(greyLight[0], greyLight[1], greyLight[2]);
  doc.line(15, yPos, 195, yPos);

  yPos += 10;
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", 135, yPos);
  doc.text(`${quote.subtotal.toFixed(2)}`, 195, yPos, { align: "right" });

  if (quote.discountTotal > 0) {
    yPos += 6;
    doc.text("Discount Total:", 135, yPos);
    doc.text(`-${quote.discountTotal.toFixed(2)}`, 195, yPos, { align: "right" });
  }

  yPos += 8;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("Grand Total (AED):", 135, yPos);
  doc.text(`${quote.grandTotal.toFixed(2)}`, 195, yPos, { align: "right" });

  // Footer signature / disclaimer
  yPos += 20;
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text("Notes / Remarks:", 15, yPos);
  doc.text(`${quote.notes || "This is a computer generated quote. Pricing valid for 30 days."}`, 15, yPos + 5);

  return doc;
};
