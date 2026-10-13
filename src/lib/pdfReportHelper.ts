import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { currencyFor, decimalsFor } from "@/lib/currency";
import type { ReportColumn, ReportResult } from "@/lib/reports/catalog";

const NAVY: [number, number, number] = [27, 42, 74];
const MUTED: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [248, 250, 252];

export function reportDate(day?: string | null): string {
  if (!day) return "—";
  const d = new Date(`${String(day).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatReportValue(value: unknown, type: ReportColumn["type"], country: string): string {
  if (value === null || value === undefined || value === "") return type === "money" || type === "number" ? "" : "—";
  if (type === "date") return reportDate(String(value));
  if (type === "money") {
    const dp = decimalsFor(country);
    return Number(value).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  if (type === "number") return Number(value).toLocaleString("en-US");
  return String(value);
}

/** One PDF layout for every report: title, period and filters, summary line, table with totals. */
export function buildReportPDF(report: ReportResult, opts: { landscape?: boolean; preparedBy?: string } = {}): jsPDF {
  const doc = new jsPDF({ orientation: opts.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const currency = currencyFor(report.country);
  const margin = 14;

  // Header band
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(report.title.toUpperCase(), margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`MAAT Veterinary Medicines · ${report.country} · amounts in ${currency}`, margin, 19);
  doc.setFont("helvetica", "bold");
  doc.text(
    report.period ? `${reportDate(report.period.from)} – ${reportDate(report.period.to)}` : `As of ${reportDate(report.asOf)}`,
    pageWidth - margin,
    12,
    { align: "right" }
  );
  doc.setFont("helvetica", "normal");
  doc.text(`Printed ${reportDate(report.asOf)}${opts.preparedBy ? ` by ${opts.preparedBy}` : ""}`, pageWidth - margin, 19, {
    align: "right",
  });

  let y = 32;
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.setFontSize(8.5);
  if (report.filters.length > 0) {
    doc.text(report.filters.join("   ·   "), margin, y);
    y += 5;
  }

  // Summary line
  if (report.summary.length > 0) {
    const boxW = (pageWidth - margin * 2 - (report.summary.length - 1) * 3) / report.summary.length;
    report.summary.forEach((s, i) => {
      const x = margin + i * (boxW + 3);
      doc.setFillColor(LIGHT[0], LIGHT[1], LIGHT[2]);
      doc.roundedRect(x, y, boxW, 13, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(s.label.toUpperCase(), x + 3, y + 4.5);
      doc.setFontSize(10.5);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      const v = formatReportValue(s.value, s.type, report.country);
      doc.text(s.type === "money" ? `${currency} ${v}` : v, x + 3, y + 10.5);
    });
    y += 18;
  }

  const numeric = (c: ReportColumn) => c.type === "money" || c.type === "number";
  const head = [report.columns.map((c) => (c.type === "money" ? `${c.label} (${currency})` : c.label))];
  const body = report.rows.map((r) => report.columns.map((c) => formatReportValue(r[c.key], c.type, report.country)));
  const foot = report.totals
    ? [
        report.columns.map((c, i) =>
          i === 0 ? "TOTAL" : report.totals && c.key in report.totals ? formatReportValue(report.totals[c.key], c.type, report.country) : ""
        ),
      ]
    : undefined;

  const columnStyles: Record<number, any> = {};
  report.columns.forEach((c, i) => {
    if (numeric(c)) columnStyles[i] = { halign: "right" };
  });

  autoTable(doc, {
    startY: y,
    head,
    body: body.length > 0 ? body : [[{ content: "No records for this period.", colSpan: report.columns.length, styles: { halign: "center", textColor: MUTED } }]],
    foot,
    showFoot: "lastPage",
    margin: { left: margin, right: margin, bottom: 14 },
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: NAVY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 253, 254] },
    columnStyles,
    didParseCell: (data: any) => {
      if ((data.section === "head" || data.section === "foot") && numeric(report.columns[data.column.index] || ({} as any))) {
        data.cell.styles.halign = "right";
      }
    },
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(`Page ${p} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    doc.text(`${report.title} · ${report.country}`, margin, pageHeight - 6);
  }

  return doc;
}
