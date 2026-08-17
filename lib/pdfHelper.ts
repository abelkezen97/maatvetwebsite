import jsPDF from "jspdf";
import { Quote, Invoice } from "@/types";

export const buildPDF = (quote: Quote): jsPDF => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Color Palette Definitions
  const NAVY_PRIMARY = [23, 40, 70];   // #172846
  const TEXT_DARK    = [31, 41, 55];   // #1F2937
  const TEXT_MUTED   = [113, 128, 150];// #718096
  const BORDER_LIGHT = [229, 233, 239];// #E5E9EF
  const TEAL_ACCENT  = [97, 152, 155]; // #61989B
  const WHITE        = [255, 255, 255];// #FFFFFF

  const currencySymbol = quote.country === "Oman" ? "OMR" : "AED";

  // Helper date formatting
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

  const drawHeader = () => {
    // Full-width dark navy header block (Height: 38mm)
    doc.setFillColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.rect(0, 0, 210, 38, "F");

    // Left Header: Large "QUOTATION" title
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("QUOTATION", 15, 23);

    // Right Header: Quotation Ref No.
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(215, 225, 238);
    doc.text("Quotation Ref.", 130, 21);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(quote.quoteNumber || "—", 195, 21, { align: "right" });
  };

  const hasItemDiscounts = (quote.items || []).some((item) => (item.discount || 0) > 0);

  const drawTableHeader = (y: number) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.text("PRODUCT ITEMS", 15, y - 3);

    // Table Header Bar
    doc.setFillColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.rect(15, y, 180, 8, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text("ITEM / PRODUCT DETAILS", 18, y + 5.5);
    doc.text("QTY", 115, y + 5.5, { align: "right" });

    if (hasItemDiscounts) {
      doc.text(`PRICE (${currencySymbol})`, 142, y + 5.5, { align: "right" });
      doc.text(`DISC (${currencySymbol})`, 168, y + 5.5, { align: "right" });
    } else {
      doc.text(`UNIT PRICE (${currencySymbol})`, 160, y + 5.5, { align: "right" });
    }

    doc.text(`TOTAL (${currencySymbol})`, 192, y + 5.5, { align: "right" });
  };

  // 1. Draw Page Header
  drawHeader();

  // 2. Customer / Quotation Details Panel (BILL TO)
  let infoY = 48;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("QUOTATION PREPARED FOR", 15, infoY);

  infoY += 5;
  const companyName = quote.companyName || quote.customerName || "Customer";
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(companyName, 15, infoY);

  infoY += 4.5;
  if (quote.companyName && quote.customerName && quote.companyName !== quote.customerName) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(quote.customerName, 15, infoY);
    infoY += 4.5;
  }

  const countryName = quote.country === "Oman" ? "Muscat, Sultanate of Oman" : "Dubai, United Arab Emirates";
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text(countryName, 15, infoY);

  // Right Side: Date & Sales Representative
  const rightX = 130;
  let rightY = 48;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("DATE", rightX, rightY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(formatDateStr(quote.date), rightX, rightY + 4);

  rightY += 12;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("SALES AGENT", rightX, rightY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(quote.salesmanName || "Sales Representative", rightX, rightY + 4);

  // 3. Items Section
  let yPos = Math.max(infoY + 10, rightY + 12, 88);
  drawTableHeader(yPos);
  yPos += 12;

  (quote.items || []).forEach((item) => {
    if (yPos > 245) {
      doc.addPage();
      drawHeader();
      yPos = 48;
      drawTableHeader(yPos);
      yPos += 12;
    }

    const splitName = doc.splitTextToSize(item.productName || "Product", 85);
    const qtyVal = item.quantity || 0;
    const unitPriceVal = item.price || 0;
    const discountVal = item.discount || 0;
    const totalVal = item.total !== undefined ? item.total : qtyVal * (unitPriceVal - discountVal);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

    doc.text(splitName, 18, yPos);
    doc.text(`${qtyVal}`, 115, yPos, { align: "right" });

    if (hasItemDiscounts) {
      doc.text(`${unitPriceVal.toFixed(2)}`, 142, yPos, { align: "right" });
      const discText = discountVal > 0 ? discountVal.toFixed(2) : "—";
      doc.text(discText, 168, yPos, { align: "right" });
    } else {
      doc.text(`${unitPriceVal.toFixed(2)}`, 160, yPos, { align: "right" });
    }

    doc.text(`${totalVal.toFixed(2)}`, 192, yPos, { align: "right" });

    const rowHeight = splitName.length * 4;
    yPos += rowHeight + 2;

    doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
    doc.setLineWidth(0.15);
    doc.line(15, yPos, 195, yPos);
    yPos += 5;
  });

  // 4. Totals Block
  if (yPos > 235) {
    doc.addPage();
    drawHeader();
    yPos = 48;
  }

  yPos += 3;
  const totalsLabelX = 130;
  const totalsValX = 192;

  // Subtotal
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("Subtotal", totalsLabelX, yPos);

  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`${(quote.subtotal || 0).toFixed(2)}`, totalsValX, yPos, { align: "right" });
  yPos += 5.5;

  // Discount Total (if applicable)
  if ((quote.discountTotal || 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("Discount Total", totalsLabelX, yPos);

    doc.setTextColor(220, 38, 38); // Red / emerald accent
    doc.text(`-${quote.discountTotal.toFixed(2)}`, totalsValX, yPos, { align: "right" });
    yPos += 5.5;
  }

  // VAT (Country-Specific Rule)
  // For UAE: VAT is NOT applicable to UAE quotations. DO NOT SHOW A VAT LINE.
  // For Oman: Only show if taxTotal > 0.
  if (quote.country === "Oman" && (quote.taxTotal || 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("VAT", totalsLabelX, yPos);

    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text(`${quote.taxTotal.toFixed(2)}`, totalsValX, yPos, { align: "right" });
    yPos += 5.5;
  }

  // Separator line
  doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
  doc.setLineWidth(0.4);
  doc.line(totalsLabelX, yPos - 2, totalsValX, yPos - 2);

  // Grand Total
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
  doc.text(`Grand Total (${currencySymbol})`, totalsLabelX, yPos + 2);
  doc.text(`${(quote.grandTotal || 0).toFixed(2)}`, totalsValX, yPos + 2, { align: "right" });

  // 5. Notes & Footer Disclaimer
  yPos += 14;
  if (quote.notes && quote.notes.trim() !== "") {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.text("Special Remarks / Delivery Notes:", 15, yPos);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    const splitNotes = doc.splitTextToSize(quote.notes.trim(), 180);
    doc.text(splitNotes, 15, yPos + 4);
    yPos += 6 + splitNotes.length * 3.5;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = 282;

    doc.setDrawColor(TEAL_ACCENT[0], TEAL_ACCENT[1], TEAL_ACCENT[2]);
    doc.setLineWidth(0.3);
    doc.line(15, footerY - 4, 195, footerY - 4);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    const footerText = quote.footerText && quote.footerText.trim() !== ""
      ? quote.footerText.trim()
      : "This is a computer generated quote. Pricing valid for 30 days.";
    doc.text(footerText, 15, footerY);
    doc.text(`Page ${i} of ${pageCount}`, 195, footerY, { align: "right" });
  }

  return doc;
};

export const buildInvoicePDF = (invoice: Invoice): jsPDF => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Color Palette Definitions
  const NAVY_PRIMARY = [23, 40, 70];   // #172846
  const TEXT_DARK    = [31, 41, 55];   // #1F2937
  const TEXT_MUTED   = [113, 128, 150];// #718096
  const BORDER_LIGHT = [229, 233, 239];// #E5E9EF
  const TEAL_ACCENT  = [107, 154, 155];// #6B9A9B
  const WHITE        = [255, 255, 255];// #FFFFFF

  const drawHeader = () => {
    // Full-width dark navy header block (Height: 40mm)
    doc.setFillColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.rect(0, 0, 210, 40, "F");

    // Left Header: Large "INVOICE" title
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("INVOICE", 15, 25);

    // Right Header: Invoice No.
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(215, 225, 238);
    doc.text("Invoice No.", 130, 23);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(invoice.invoiceNumber || "—", 195, 23, { align: "right" });
  };

  const drawTableHeader = (y: number) => {
    // Small section heading: ITEMS
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.text("ITEMS", 15, y - 3);

    // Table Header Bar (Navy #172846)
    doc.setFillColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
    doc.rect(15, y, 180, 8, "F");

    // Table Header Titles (White, uppercase, bold)
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text("ITEM / PRODUCT DETAILS", 18, y + 5.5);
    doc.text("QTY", 125, y + 5.5, { align: "right" });
    doc.text("UNIT PRICE", 160, y + 5.5, { align: "right" });
    doc.text("TOTAL", 192, y + 5.5, { align: "right" });
  };

  // Helper date formatting
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

  const getDueDateStr = (): string => {
    if (invoice.status === "Credit" && invoice.creditDays && invoice.creditDays > 0) {
      try {
        const base = invoice.date ? new Date(invoice.date) : new Date();
        if (!isNaN(base.getTime())) {
          const due = new Date(base.getTime() + invoice.creditDays * 24 * 60 * 60 * 1000);
          const day = String(due.getDate()).padStart(2, "0");
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${day} ${months[due.getMonth()]} ${due.getFullYear()}`;
        }
      } catch (e) {}
    }
    return formatDateStr(invoice.date);
  };

  // Draw Header on Page 1
  drawHeader();

  // 2. Customer / Invoice Information Area
  let infoY = 50;

  // Left Column: BILL TO
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("BILL TO", 15, infoY);

  infoY += 5;
  const companyName = invoice.companyName || invoice.customerName || "Customer";
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(companyName, 15, infoY);

  infoY += 4.5;
  if (invoice.companyName && invoice.customerName && invoice.companyName !== invoice.customerName) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(invoice.customerName, 15, infoY);
    infoY += 4.5;
  }

  const custAddr = (invoice as any).address || (invoice as any).customerAddress || "";
  if (custAddr) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(custAddr, 15, infoY);
    infoY += 4.5;
  }

  const custCity = (invoice as any).city || "";
  const countryName = invoice.country === "Oman" ? "Oman" : "United Arab Emirates";
  const defaultCityCountry = invoice.country === "Oman" ? "Muscat, Sultanate of Oman" : "Dubai, United Arab Emirates";
  const cityCountryLine = custCity ? `${custCity}, ${countryName}` : defaultCityCountry;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text(cityCountryLine, 15, infoY);

  // Right Column: INVOICE DATE, DUE DATE, PAYMENT TERMS
  const rightX = 130;
  let rightY = 50;

  // INVOICE DATE
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("INVOICE DATE", rightX, rightY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(formatDateStr(invoice.date), rightX, rightY + 4);

  // DUE DATE
  rightY += 12;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("DUE DATE", rightX, rightY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(getDueDateStr(), rightX, rightY + 4);

  // PAYMENT TERMS
  rightY += 12;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("PAYMENT TERMS", rightX, rightY);

  const paymentTermsVal = invoice.status === "Credit"
    ? `${invoice.creditDays || 30} Days`
    : (invoice.status || "Paid");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(paymentTermsVal, rightX, rightY + 4);

  // 3. Items Section
  let yPos = Math.max(infoY + 12, rightY + 14, 92);
  drawTableHeader(yPos);
  yPos += 13;

  // Table Body Rows
  (invoice.items || []).forEach((item) => {
    // Pagination check
    if (yPos > 245) {
      doc.addPage();
      drawHeader();
      yPos = 52;
      drawTableHeader(yPos);
      yPos += 13;
    }

    const splitName = doc.splitTextToSize(item.productName || "Product", 95);
    const itemDesc = (item as any).description || (item as any).sku || "";
    const splitDesc = itemDesc ? doc.splitTextToSize(itemDesc, 95) : [];

    const qtyVal = item.quantity || 0;
    const unitPriceVal = item.price || 0;
    const effectiveUnitPrice = item.discountPrice !== undefined && item.discountPrice !== null && String(item.discountPrice).trim() !== ""
      ? Number(item.discountPrice)
      : (item.discount !== undefined && item.discount > 0 ? Math.max(0, item.price - item.discount) : item.price || 0);
    const totalVal = item.total !== undefined ? item.total : qtyVal * effectiveUnitPrice;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

    doc.text(splitName, 18, yPos);
    doc.text(`${qtyVal}`, 125, yPos, { align: "right" });
    doc.text(`${effectiveUnitPrice.toFixed(2)}`, 160, yPos, { align: "right" });
    doc.text(`${totalVal.toFixed(2)}`, 192, yPos, { align: "right" });

    let rowHeight = splitName.length * 4;

    if (splitDesc.length > 0) {
      doc.setFontSize(7.5);
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(splitDesc, 18, yPos + rowHeight);
      rowHeight += splitDesc.length * 3.5;
    }

    yPos += rowHeight + 2;

    // Subtle light-gray separator line
    doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
    doc.setLineWidth(0.15);
    doc.line(15, yPos, 195, yPos);
    yPos += 5;
  });

  // 4. Totals Block
  if (yPos > 235) {
    doc.addPage();
    drawHeader();
    yPos = 52;
  }

  yPos += 3;
  const totalsLabelX = 130;
  const totalsValX = 192;

  // Subtotal
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("Subtotal", totalsLabelX, yPos);

  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`${(invoice.subtotal || 0).toFixed(2)}`, totalsValX, yPos, { align: "right" });
  yPos += 5.5;

  // Discount Total (if applicable)
  if ((invoice.discountTotal || 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("Discount Total", totalsLabelX, yPos);

    doc.setTextColor(220, 38, 38);
    doc.text(`-${invoice.discountTotal.toFixed(2)}`, totalsValX, yPos, { align: "right" });
    yPos += 5.5;
  }

  // VAT (Country-Specific Rule)
  if (invoice.country === "Oman" && (invoice.taxTotal || 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("VAT (5%)", totalsLabelX, yPos);

    const vatVal = invoice.taxTotal !== undefined && invoice.taxTotal >= 0 ? invoice.taxTotal : 0;
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text(`${vatVal.toFixed(2)}`, totalsValX, yPos, { align: "right" });
    yPos += 5.5;
  }

  // Subtle separator line above Grand Total
  doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
  doc.setLineWidth(0.4);
  doc.line(totalsLabelX, yPos - 3, totalsValX, yPos - 3);

  // Grand Total
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY_PRIMARY[0], NAVY_PRIMARY[1], NAVY_PRIMARY[2]);
  doc.text("Grand Total", totalsLabelX, yPos + 1);
  doc.text(`${(invoice.grandTotal || 0).toFixed(2)}`, totalsValX, yPos + 1, { align: "right" });

  // 6. Minimal Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = 282;

    // Thin teal line (#6B9A9B)
    doc.setDrawColor(TEAL_ACCENT[0], TEAL_ACCENT[1], TEAL_ACCENT[2]);
    doc.setLineWidth(0.3);
    doc.line(15, footerY - 4, 195, footerY - 4);

    // Footer text
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("This is a computer-generated invoice.", 15, footerY);
    doc.text("Thank you for your business.", 195, footerY, { align: "right" });
  }

  return doc;
};


