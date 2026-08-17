import jsPDF from "jspdf";
import { Customer, Invoice, Receipt } from "@/types";

interface FinancialSummaryData {
  pendingBalance: number;
  totalInvoiced: number;
  totalPaid: number;
  creditInvoicesSum: number;
  outstandingInvoicesCount: number;
}

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
 * Generates a complete Customer Account Statement / Ledger PDF.
 */
export const buildCustomerLedgerPDF = (
  customer: Customer,
  allInvoices: Invoice[],
  allReceipts: Receipt[],
  financialSummary: FinancialSummaryData
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
  const GREEN = [16, 185, 129];
  const RED = [225, 29, 72];

  const currencySymbol = customer.country === "Oman" ? "OMR" : "AED";

  // Build sorted transactions
  interface Transaction {
    date: string;
    type: "Invoice" | "Receipt";
    refNo: string;
    debit: number;
    credit: number;
  }

  const txs: Transaction[] = [];

  allInvoices.forEach((inv) => {
    if (!inv.isDeleted) {
      txs.push({
        date: inv.date,
        type: "Invoice",
        refNo: inv.invoiceNumber,
        debit: inv.grandTotal,
        credit: 0,
      });
    }
  });

  allReceipts.forEach((rec) => {
    if (!rec.isDeleted) {
      txs.push({
        date: rec.paymentDate,
        type: "Receipt",
        refNo: rec.receiptNumber,
        debit: 0,
        credit: rec.amountPaid,
      });
    }
  });

  // Sort ascending by date
  txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Page Header Generator
  const drawHeader = () => {
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, 210, 36, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("CUSTOMER STATEMENT / LEDGER", 14, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 230, 242);
    doc.text(`Generated: ${formatDateStr(new Date().toISOString())}`, 196, 27, { align: "right" });
  };

  drawHeader();

  let y = 44;

  // Customer Info Box (Without Company Name & Salesperson Details)
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
  doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  doc.roundedRect(14, y, 182, 22, 2, 2, "FD");

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(`Contact Person: ${customer.doctorName || customer.name || "—"}`, 18, y + 7);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text(`Customer Code: ${customer.customerCode || "—"}`, 18, y + 13);
  doc.text(`Phone: ${customer.phone || "—"}`, 18, y + 18);

  const locStr = [customer.address, customer.city, customer.country].filter(Boolean).join(", ");
  doc.text(`Location: ${locStr || "—"}`, 110, y + 13);
  doc.text(`Currency: ${currencySymbol}`, 110, y + 18);

  y += 28;

  // Financial Summary Banner
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, y, 182, 18, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("TOTAL INVOICED", 20, y + 6);
  doc.text("TOTAL PAID", 85, y + 6);
  doc.text("NET OUTSTANDING BALANCE", 145, y + 6);

  doc.setFontSize(11);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`${currencySymbol} ${financialSummary.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, y + 13);
  doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
  doc.text(`${currencySymbol} ${financialSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 85, y + 13);
  doc.setTextColor(financialSummary.pendingBalance > 0 ? RED[0] : GREEN[0], financialSummary.pendingBalance > 0 ? RED[1] : GREEN[1], financialSummary.pendingBalance > 0 ? RED[2] : GREEN[2]);
  doc.text(`${currencySymbol} ${financialSummary.pendingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 145, y + 13);

  y += 24;

  // Table Headers
  const drawTableHeader = (currentY: number) => {
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(14, currentY, 182, 7, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);

    doc.text("Date", 18, currentY + 5);
    doc.text("Type", 48, currentY + 5);
    doc.text("Ref Number", 75, currentY + 5);
    doc.text("Debit (Invoiced)", 125, currentY + 5, { align: "right" });
    doc.text("Credit (Paid)", 158, currentY + 5, { align: "right" });
    doc.text("Balance", 192, currentY + 5, { align: "right" });
  };

  drawTableHeader(y);
  y += 7;

  let runningBalance = 0;

  txs.forEach((tx, idx) => {
    if (y > 270) {
      doc.addPage();
      drawHeader();
      y = 42;
      drawTableHeader(y);
      y += 7;
    }

    runningBalance += tx.debit - tx.credit;

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 7, "F");
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

    doc.text(formatDateStr(tx.date), 18, y + 5);

    doc.setFont("helvetica", "bold");
    if (tx.type === "Invoice") {
      doc.setTextColor(30, 58, 138);
    } else {
      doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    }
    doc.text(tx.type, 48, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text(tx.refNo, 75, y + 5);

    doc.text(tx.debit > 0 ? `${tx.debit.toFixed(2)}` : "—", 125, y + 5, { align: "right" });
    doc.text(tx.credit > 0 ? `${tx.credit.toFixed(2)}` : "—", 158, y + 5, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(runningBalance > 0 ? RED[0] : TEXT_DARK[0], runningBalance > 0 ? RED[1] : TEXT_DARK[1], runningBalance > 0 ? RED[2] : TEXT_DARK[2]);
    doc.text(`${runningBalance.toFixed(2)}`, 192, y + 5, { align: "right" });

    doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
    doc.line(14, y + 7, 196, y + 7);

    y += 7;
  });

  if (txs.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("No transactions recorded for this customer.", 105, y + 10, { align: "center" });
  }

  // Footer Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(`Page ${i} of ${totalPages}`, 105, 290, { align: "center" });
    doc.text("Confidential — MAAT Sales Portal", 196, 290, { align: "right" });
  }

  return doc;
};

export interface OutstandingInvoiceItem {
  id: string;
  invoiceNumber: string;
  date: string;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  creditDays?: number;
}

/**
 * Generates an Outstanding / Pending Invoices PDF Statement.
 */
export const buildPendingInvoicesPDF = (
  customer: Customer,
  outstandingInvoices: OutstandingInvoiceItem[],
  financialSummary: FinancialSummaryData
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
  const GREEN = [16, 185, 129];
  const RED = [225, 29, 72];

  const currencySymbol = customer.country === "Oman" ? "OMR" : "AED";

  // Page Header Generator
  const drawHeader = () => {
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, 210, 36, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("OUTSTANDING INVOICES STATEMENT", 14, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 230, 242);
    doc.text(`Generated: ${formatDateStr(new Date().toISOString())}`, 196, 27, { align: "right" });
  };

  drawHeader();

  let y = 44;

  // Customer Info Box (Without Company Name & Salesperson Details)
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
  doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  doc.roundedRect(14, y, 182, 22, 2, 2, "FD");

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(`Contact Person: ${customer.doctorName || customer.name || "—"}`, 18, y + 7);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text(`Customer Code: ${customer.customerCode || "—"}`, 18, y + 13);
  doc.text(`Phone: ${customer.phone || "—"}`, 18, y + 18);

  const locStr = [customer.address, customer.city, customer.country].filter(Boolean).join(", ");
  doc.text(`Location: ${locStr || "—"}`, 110, y + 13);
  doc.text(`Currency: ${currencySymbol}`, 110, y + 18);

  y += 28;

  // Pending Summary Banner
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, y, 182, 18, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("OUTSTANDING INVOICES COUNT", 20, y + 6);
  doc.text("TOTAL CREDIT INVOICES SUM", 85, y + 6);
  doc.text("NET PENDING AMOUNT DUE", 145, y + 6);

  doc.setFontSize(11);
  doc.setTextColor(RED[0], RED[1], RED[2]);
  doc.text(`${outstandingInvoices.length} Invoices`, 20, y + 13);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`${currencySymbol} ${financialSummary.creditInvoicesSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 85, y + 13);
  doc.setTextColor(RED[0], RED[1], RED[2]);
  doc.text(`${currencySymbol} ${financialSummary.pendingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 145, y + 13);

  y += 24;

  // Table Headers
  const drawTableHeader = (currentY: number) => {
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(14, currentY, 182, 7, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);

    doc.text("Invoice Number", 18, currentY + 5);
    doc.text("Date", 58, currentY + 5);
    doc.text("Terms / Status", 88, currentY + 5);
    doc.text("Invoice Total", 132, currentY + 5, { align: "right" });
    doc.text("Paid", 162, currentY + 5, { align: "right" });
    doc.text("Pending Due", 192, currentY + 5, { align: "right" });
  };

  drawTableHeader(y);
  y += 7;

  outstandingInvoices.forEach((inv, idx) => {
    if (y > 270) {
      doc.addPage();
      drawHeader();
      y = 42;
      drawTableHeader(y);
      y += 7;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 7, "F");
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(inv.invoiceNumber, 18, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text(formatDateStr(inv.date), 58, y + 5);

    const invDate = new Date(inv.date);
    const today = new Date();
    const daysElapsed = Math.max(0, Math.floor((today.getTime() - invDate.getTime()) / 86400000));
    const creditDays = inv.creditDays || 0;
    const isOverdue = creditDays > 0 ? daysElapsed > creditDays : false;

    doc.setFont("helvetica", "bold");
    if (isOverdue) {
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.text(`OVERDUE (${daysElapsed - creditDays}d)`, 88, y + 5);
    } else {
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
      const statusStr = inv.status === "Credit" && creditDays ? `Credit (${creditDays}d)` : inv.status;
      doc.text(statusStr, 88, y + 5);
    }

    doc.text(`${inv.grandTotal.toFixed(2)}`, 132, y + 5, { align: "right" });
    doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.text(`${inv.paidAmount.toFixed(2)}`, 162, y + 5, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(`${inv.outstandingAmount.toFixed(2)}`, 192, y + 5, { align: "right" });

    doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
    doc.line(14, y + 7, 196, y + 7);

    y += 7;
  });

  if (outstandingInvoices.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.text("No pending or outstanding invoices for this customer.", 105, y + 10, { align: "center" });
  }

  // Footer Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(`Page ${i} of ${totalPages}`, 105, 290, { align: "center" });
    doc.text("Confidential — MAAT Sales Portal", 196, 290, { align: "right" });
  }

  return doc;
};
