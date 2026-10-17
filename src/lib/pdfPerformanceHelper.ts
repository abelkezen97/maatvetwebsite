import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PerformanceReport, Tone } from "@/lib/performance/types";

/** Salesman performance as an A4 PDF: same sections as the screen, with bars and percentages. */

type RGB = [number, number, number];
const NAVY: RGB = [27, 42, 74];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const TRACK: RGB = [241, 245, 249];
const SERIES: RGB[] = [
  [42, 120, 214],
  [235, 104, 52],
  [27, 175, 122],
  [237, 161, 0],
  [232, 123, 164],
];
const OTHER: RGB = [201, 204, 211];
const TONE_RGB: Record<Tone, RGB> = { good: [27, 175, 122], warn: [237, 161, 0], bad: [226, 71, 95], info: [100, 116, 139] };
const TONE_WORD: Record<Tone, string> = { good: "GOOD", warn: "WATCH", bad: "ACT", info: "NOTE" };

export function buildPerformancePDF(r: PerformanceReport, preparedBy = ""): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const cur = r.currency;
  const dp = 0;
  const money = (n: number) => `${cur} ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const pct = (n: number | null | undefined) => (n === null || n === undefined || !isFinite(n) ? "—" : `${Math.round(n)}%`);
  const change = (now: number, prev: number) => (prev > 0 ? `${now >= prev ? "+" : "-"}${Math.abs(Math.round(((now - prev) / prev) * 100))}%` : "—");
  let y = 0;

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Salesman performance", M, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${r.salesman.name}  ·  ${r.period.label}  ·  ${r.country}`, M, 20);
  doc.setFontSize(8.5);
  doc.text(`Compared with ${r.period.prevLabel}${r.period.to > r.today ? `  ·  running, ${r.period.daysElapsed} working days so far` : ""}`, M, 25.5);
  doc.text("MAAT GROUP", W - M, 13, { align: "right" });
  y = 38;

  const ensure = (h: number) => {
    if (y + h > H - 16) {
      doc.addPage();
      y = 16;
    }
  };
  const heading = (t: string, sub?: string) => {
    ensure(14);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(t, M, y);
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(sub, W - M, y, { align: "right" });
    }
    y += 2.5;
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
    y += 5;
  };
  const label = (t: string) => {
    ensure(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(t, M, y);
    y += 4;
  };
  /** 100% stacked bar plus a legend with % and value. */
  const shareBar = (parts: { label: string; value: number; note?: string }[], colors: RGB[] = SERIES) => {
    const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
    if (total <= 0) {
      ensure(6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text("Nothing in this period.", M, y);
      y += 6;
      return;
    }
    ensure(14 + parts.length * 6);
    let x = M;
    const bw = W - 2 * M;
    parts.forEach((p, i) => {
      if (p.value <= 0) return;
      const w = (p.value / total) * bw;
      doc.setFillColor(...(colors[i] || OTHER));
      doc.rect(x, y, Math.max(w - 0.6, 0.4), 4, "F");
      x += w;
    });
    y += 9;
    // Rows: swatch and label (wrapped, never cut) on the left; percentage and amount in fixed right-hand columns.
    const pctX = W - M - 38;
    const labelW = pctX - M - 22;
    parts.forEach((p, i) => {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      const lines: string[] = doc.splitTextToSize(p.label, labelW);
      const rowH = lines.length * 3.9 + (p.note ? 3.6 : 0) + 1.8;
      ensure(rowH + 1);
      doc.setFillColor(...(colors[i] || OTHER));
      doc.rect(M, y - 2.6, 2.6, 2.6, "F");
      doc.setTextColor(30, 41, 59);
      doc.text(lines, M + 5, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(pct((p.value / total) * 100), pctX, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text(money(p.value), W - M, y, { align: "right" });
      let yy = y + (lines.length - 1) * 3.9;
      if (p.note) {
        doc.setFontSize(7.5);
        yy += 3.6;
        doc.text(p.note, M + 5, yy);
      }
      y = yy + 1.8;
      doc.setDrawColor(...LINE);
      doc.line(M, y - 0.6, W - M, y - 0.6);
      y += 2.6;
    });
    y += 1;
  };
  /** Table whose last column draws a bar of the row's share. */
  const barTable = (head: string[], rows: (string | number)[][], shares: number[], color: RGB = SERIES[0]) => {
    if (rows.length === 0) {
      ensure(6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text("Nothing in this period.", M, y);
      y += 6;
      return;
    }
    const maxShare = Math.max(...shares, 0.0001);
    autoTable(doc, {
      startY: y,
      head: [[...head, ""]],
      body: rows.map((row) => [...row.map(String), ""]),
      theme: "plain",
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 1.5, right: 1.5 }, textColor: [30, 41, 59] },
      headStyles: { fontStyle: "bold", textColor: MUTED, fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries([...head.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }]), [head.length, { cellWidth: 38 }]]) as any,
      didDrawCell: (data: any) => {
        if (data.section === "body" && data.column.index === head.length) {
          const s = shares[data.row.index] || 0;
          const bw = data.cell.width - 4;
          const bx = data.cell.x + 2;
          const by = data.cell.y + data.cell.height / 2 - 1.4;
          doc.setFillColor(...TRACK);
          doc.rect(bx, by, bw, 2.8, "F");
          doc.setFillColor(...color);
          doc.rect(bx, by, Math.max(0.6, (s / maxShare) * bw), 2.8, "F");
        }
      },
      didParseCell: (data: any) => {
        if (data.section === "body") data.cell.styles.lineColor = LINE;
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  };
  const meterRows = (rows: { label: string; value: number | null; good: number; warn: number; invert?: boolean }[]) => {
    rows.forEach((m) => {
      ensure(9);
      const v = m.value === null || !isFinite(m.value) ? null : Math.max(0, m.value);
      const ok = v === null ? null : m.invert ? v <= m.good : v >= m.good;
      const mid = v === null ? null : m.invert ? v <= m.warn : v >= m.warn;
      const tone: Tone = v === null ? "info" : ok ? "good" : mid ? "warn" : "bad";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(m.label, M, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TONE_RGB[tone]);
      doc.text(`${pct(v)}  ${v === null ? "no data" : ok ? "good" : mid ? "watch" : "poor"}`, W - M, y, { align: "right" });
      y += 1.8;
      doc.setFillColor(...TRACK);
      doc.rect(M, y, W - 2 * M, 2.2, "F");
      doc.setFillColor(...TONE_RGB[tone]);
      doc.rect(M, y, Math.max(0.5, (Math.min(100, v || 0) / 100) * (W - 2 * M)), 2.2, "F");
      y += 6.5;
    });
  };

  // ---------- Headline ----------
  heading("Headline");
  autoTable(doc, {
    startY: y,
    head: [["", "This period", r.period.prevLabel, "Change"]],
    body: [
      ["Sales", money(r.sales.value), money(r.sales.prevValue), change(r.sales.value, r.sales.prevValue)],
      ["Invoices", String(r.sales.invoices), String(r.sales.prevInvoices), change(r.sales.invoices, r.sales.prevInvoices)],
      ["Collected", money(r.collections.total), money(r.collections.prevTotal), change(r.collections.total, r.collections.prevTotal)],
      ["Expenses", money(r.expenses.total), money(r.expenses.prevTotal), change(r.expenses.total, r.expenses.prevTotal)],
      ["Unpaid today", money(r.outstanding.total), "", ""],
      ["Overdue today", `${money(r.outstanding.overdue)} (${r.outstanding.overdueInvoices} inv.)`, "", ""],
    ],
    theme: "plain",
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fontStyle: "bold", textColor: MUTED, fillColor: [248, 250, 252] },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ---------- Insights ----------
  heading("What stands out");
  r.insights.forEach((ins) => {
    doc.setFontSize(9);
    const detail = doc.splitTextToSize(ins.detail, W - 2 * M - 22);
    ensure(6 + detail.length * 4);
    doc.setFillColor(...TONE_RGB[ins.tone]);
    doc.roundedRect(M, y - 3.4, 17, 4.8, 1, 1, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(TONE_WORD[ins.tone], M + 8.5, y, { align: "center" });
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9.5);
    doc.text(ins.title, M + 21, y);
    y += 4.4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(detail, M + 21, y);
    y += detail.length * 3.8 + 2.5;
  });
  y += 2;

  // ---------- Sales ----------
  heading("Sales", `${r.sales.invoices} invoices · ${r.sales.units} units · ${r.sales.customers} customers (${r.sales.newCustomers} new)`);
  if (r.period.kind !== "day") {
    label("Sales per day");
    ensure(34);
    const chartH = 26;
    const bw = (W - 2 * M) / Math.max(r.sales.byDay.length, 1);
    const max = Math.max(...r.sales.byDay.map((d) => d.value), 0.0001);
    doc.setDrawColor(...LINE);
    doc.line(M, y + chartH, W - M, y + chartH);
    r.sales.byDay.forEach((d, i) => {
      const h = (d.value / max) * chartH;
      if (h > 0) {
        doc.setFillColor(...SERIES[0]);
        doc.rect(M + i * bw + 0.4, y + chartH - h, Math.max(bw - 0.8, 0.3), h, "F");
      }
      if (r.sales.byDay.length <= 16 || i % 2 === 0) {
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text(d.label.split(" ")[0], M + i * bw + bw / 2, y + chartH + 3, { align: "center" });
      }
    });
    doc.setFontSize(7);
    doc.text(`max ${money(max)}`, W - M, y - 1, { align: "right" });
    y += chartH + 8;
  } else if (r.sales.invoiceList.length > 0) {
    label("Invoices of the day");
    autoTable(doc, {
      startY: y,
      head: [["Invoice", "Customer", "Status", "Value"]],
      body: r.sales.invoiceList.map((i) => [i.number, i.customer, i.status, money(i.value)]),
      theme: "plain",
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      headStyles: { fontStyle: "bold", textColor: MUTED, fillColor: [248, 250, 252] },
      columnStyles: { 3: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  label("Paid at sale vs on credit");
  shareBar([
    { label: "Paid at sale", value: r.sales.paidAtSale },
    { label: "On credit", value: r.sales.onCredit },
  ]);
  label("Top customers");
  const custTotal = r.sales.topCustomers.reduce((s, c) => s + c.value, 0) || 1;
  barTable(
    ["Customer", "Invoices", "Value", "Share"],
    r.sales.topCustomers.map((c) => [`${c.name}${c.isNew ? " (new)" : ""}`, c.invoices, money(c.value), pct((c.value / Math.max(r.sales.value, 0.0001)) * 100)]),
    r.sales.topCustomers.map((c) => c.value / custTotal)
  );

  // ---------- Collections ----------
  heading("Collections", `${money(r.collections.total)} from ${r.collections.receipts} receipts`);
  label("On time or late");
  shareBar(
    [
      { label: "On time (by due date)", value: r.collections.onTime },
      { label: "Late (after due date)", value: r.collections.late },
      { label: "Advance (not on an invoice)", value: r.collections.advance },
      { label: "Cheques not cleared", value: r.collections.chequesPending },
    ],
    [SERIES[2], SERIES[1], SERIES[0], SERIES[3]]
  );
  label("How late");
  const lateTotal = r.collections.lateBuckets.reduce((s, b) => s + b.value, 0) || 1;
  barTable(
    ["Late by", "Amount", "Share"],
    r.collections.lateBuckets.map((b) => [b.label, money(b.value), pct((b.value / lateTotal) * 100)]),
    r.collections.lateBuckets.map((b) => b.value / lateTotal),
    SERIES[1]
  );
  label("By payment method");
  shareBar(r.collections.byMethod.map((x) => ({ label: x.label, value: x.value })));
  meterRows([
    { label: "Collected within 100 days (commission)", value: r.efficiency.within100Rate, good: 90, warn: 70 },
    { label: "Collected vs sold", value: r.efficiency.collectionRate, good: 90, warn: 60 },
  ]);
  ensure(8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `Unpaid today ${money(r.outstanding.total)} · overdue ${money(r.outstanding.overdue)} · past 100 days ${money(r.outstanding.over100)} · oldest ${r.outstanding.oldestDays} days`,
    M,
    y
  );
  y += 8;

  // ---------- Companies and products ----------
  heading("Companies and products", `${r.products.companies.length} companies · ${r.products.productsSold} products`);
  label("Sales by company");
  barTable(
    ["Company", "Units", "Value", "Share"],
    r.products.companies.map((c) => [c.name, c.units, money(c.value), pct(c.share)]),
    r.products.companies.map((c) => c.share / 100)
  );
  r.products.companies.slice(0, 4).forEach((c) => {
    label(`${c.name}: top products`);
    autoTable(doc, {
      startY: y,
      head: [["Product", "Units", "Value"]],
      body: c.products.map((p) => [p.name, String(p.units), money(p.value)]),
      theme: "plain",
      margin: { left: M + 4, right: M },
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fontStyle: "bold", textColor: MUTED },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  });
  label("Products that moved most (units)");
  const unitTop = Math.max(...r.products.topProducts.map((p) => p.units), 1);
  barTable(
    ["Product", "Company", "Units", "Value"],
    r.products.topProducts.map((p) => [p.name, p.company, p.units, money(p.value)]),
    r.products.topProducts.map((p) => p.units / unitTop),
    SERIES[2]
  );

  // ---------- Pricing ----------
  heading("Price discipline", "each line against the product's list price");
  shareBar(
    [
      { label: "At list price", value: r.pricing.atList.value, note: `${r.pricing.atList.lines} lines` },
      { label: "Below list (discount)", value: r.pricing.below.value, note: `${r.pricing.below.lines} lines` },
      { label: "Above list", value: r.pricing.above.value, note: `${r.pricing.above.lines} lines` },
      { label: "FOC (at list value)", value: r.pricing.foc.listValue, note: `${r.pricing.foc.units} units` },
    ]
  );
  autoTable(doc, {
    startY: y,
    body: [
      ["Discount given", money(r.pricing.below.given), `${pct(r.efficiency.discountRate)} of list value`],
      ["FOC given", `${r.pricing.foc.units} units · ${money(r.pricing.foc.listValue)}`, `${pct(r.efficiency.focRate)} of list value`],
      ["Earned above list", money(r.pricing.above.earned), `${r.pricing.above.lines} lines`],
      ["Gross margin over cost", r.pricing.grossMargin === null ? "—" : money(r.pricing.grossMargin), r.pricing.grossMarginPct === null ? "no cost prices" : `${pct(r.pricing.grossMarginPct)} of sales`],
    ],
    theme: "plain",
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right", textColor: MUTED } },
  });
  y = (doc as any).lastAutoTable.finalY + 5;
  if (r.pricing.topDiscounted.length) {
    label("Most discounted products");
    const g = Math.max(...r.pricing.topDiscounted.map((p) => p.given), 1);
    barTable(
      ["Product", "Units", "Given"],
      r.pricing.topDiscounted.map((p) => [p.name, p.units, money(p.given)]),
      r.pricing.topDiscounted.map((p) => p.given / g),
      SERIES[1]
    );
  }
  if (r.pricing.topFoc.length) {
    label("Most given free (FOC)");
    const g = Math.max(...r.pricing.topFoc.map((p) => p.listValue), 1);
    barTable(
      ["Product", "Units", "List value"],
      r.pricing.topFoc.map((p) => [p.name, p.units, money(p.listValue)]),
      r.pricing.topFoc.map((p) => p.listValue / g),
      SERIES[3]
    );
  }

  // ---------- Expenses ----------
  heading("Expenses", `${money(r.expenses.total)} · ${pct(r.expenses.ratioToSales)} of sales`);
  label("By category");
  const cats = r.expenses.byCategory.slice(0, 5).concat(r.expenses.byCategory.length > 5 ? [{ label: "Others", value: r.expenses.byCategory.slice(5).reduce((s, x) => s + x.value, 0) }] : []);
  shareBar(cats.map((c) => ({ label: c.label, value: c.value, note: c.count ? `${c.count} entries` : undefined })), [...SERIES, OTHER]);
  label("By person");
  const ptot = r.expenses.total || 1;
  barTable(
    ["Person", "Entries", "Amount", "Share"],
    r.expenses.byPerson.map((p) => [p.label, p.count || 0, money(p.value), pct((p.value / ptot) * 100)]),
    r.expenses.byPerson.map((p) => p.value / ptot),
    SERIES[4]
  );
  ensure(8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`Petrol ${money(r.expenses.petrol)} · approved ${money(r.expenses.approved)} · awaiting approval ${money(r.expenses.pending)}`, M, y);
  y += 8;

  // ---------- Efficiency ----------
  heading("Productivity and efficiency", "green good · amber watch · red act");
  meterRows([
    { label: "Collected vs sold", value: r.efficiency.collectionRate, good: 90, warn: 60 },
    { label: "Collections on time", value: r.efficiency.onTimeRate, good: 80, warn: 50 },
    { label: "Collected within 100 days", value: r.efficiency.within100Rate, good: 90, warn: 70 },
    ...(r.period.kind !== "day" ? [{ label: `Working days with sales (${r.sales.activeDays} of ${r.period.daysElapsed})`, value: r.efficiency.activeDayRate, good: 70, warn: 45 }] : []),
    { label: "Discount given (of list value)", value: r.efficiency.discountRate, good: 3, warn: 8, invert: true },
    { label: "FOC given (of list value)", value: r.efficiency.focRate, good: 3, warn: 8, invert: true },
    { label: "Expenses (of sales)", value: r.efficiency.expenseRate, good: 5, warn: 10, invert: true },
  ]);
  ensure(8);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `Sales per selling day ${money(r.efficiency.salesPerActiveDay)} · ${r.efficiency.invoicesPerActiveDay.toFixed(1)} invoices per selling day. Unpaid figures are as of today; list prices are today's.`,
    M,
    y
  );

  // Footer on every page
  const pages = doc.getNumberOfPages();
  const stamp = new Date(r.generatedAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${stamp}${preparedBy ? ` by ${preparedBy}` : ""}`, M, H - 8);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: "right" });
  }
  return doc;
}
