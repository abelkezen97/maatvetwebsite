import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ProductStockSummary, InventoryDashboardMetrics, UserRole, UserCountry } from "@/types";

export interface PdfExportOptions {
  products: ProductStockSummary[];
  metrics?: InventoryDashboardMetrics;
  userRole?: UserRole;
  userCountry?: UserCountry;
  searchFilter?: string;
  categoryFilter?: string;
}

export function generateProductsPdf({
  products,
  metrics,
  userRole,
  userCountry,
  searchFilter,
  categoryFilter,
}: PdfExportOptions) {
  // 1. Create landscape PDF document for clear column fitting
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // ~297mm for A4 landscape
  const pageHeight = doc.internal.pageSize.getHeight(); // ~210mm for A4 landscape

  // Color Palette Constants
  const NAVY = "#0F172A";
  const PRIMARY_TEAL = "#0D9488";
  const SLATE_GRAY = "#475569";
  const LIGHT_BG = "#F8FAFC";
  const BORDER_COLOR = "#E2E8F0";

  // Calculate Metrics if not explicitly passed
  const totalProducts = products.length;
  let totalStockUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  products.forEach((p) => {
    totalStockUnits += p.totalStock || 0;
    if (p.totalStock <= 0) outOfStockCount++;
    else if (p.totalStock <= 10) lowStockCount++;
  });

  const finalMetrics = metrics || {
    totalProducts,
    totalStockUnits,
    lowStockProducts: lowStockCount,
    outOfStockProducts: outOfStockCount,
  };

  // --- HEADER SECTION ---
  // Top Decorative Accent Bar
  doc.setFillColor(13, 148, 136); // Teal accent
  doc.rect(0, 0, pageWidth, 4, "F");

  // Company Brand Name & Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // Navy
  doc.text("MAAT VETERINARY MEDICINES TRADING", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("Master Products Catalog & Multi-Warehouse Stock Report", 14, 22);

  // Date & Generation Info (Right aligned)
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Generated: ${dateStr} at ${timeStr}`, pageWidth - 14, 16, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  const filterInfo = [
    categoryFilter && categoryFilter !== "ALL" ? `Category: ${categoryFilter}` : null,
    searchFilter ? `Search: "${searchFilter}"` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  doc.text(filterInfo ? `Filters: ${filterInfo}` : "Filters: All Products", pageWidth - 14, 22, { align: "right" });

  // Divider Line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, 26, pageWidth - 14, 26);

  // --- KPI SUMMARY CARDS ---
  const startY = 30;
  const cardWidth = (pageWidth - 28 - 12) / 4; // 4 cards with 4mm spacing
  const cardHeight = 16;

  const kpis = [
    { title: "TOTAL PRODUCTS", value: String(finalMetrics.totalProducts), color: [15, 23, 42] },
    { title: "TOTAL STOCK UNITS", value: finalMetrics.totalStockUnits.toLocaleString(), color: [13, 148, 136] },
    { title: "LOW STOCK ITEMS", value: String(finalMetrics.lowStockProducts), color: [217, 119, 6] },
    { title: "OUT OF STOCK", value: String(finalMetrics.outOfStockProducts), color: [225, 29, 72] },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = 14 + idx * (cardWidth + 4);
    
    // Background
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(cardX, startY, cardWidth, cardHeight, 2, 2, "F");
    
    // Left Border Accent
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.roundedRect(cardX, startY, 2, cardHeight, 1, 1, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, cardX + 5, startY + 5.5);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, cardX + 5, startY + 12.5);
  });

  // --- TABLE CREATION ---
  const tableStartY = startY + cardHeight + 6;

  const isSalesperson = userRole === "salesperson";
  const hideUae = isSalesperson && userCountry === "Oman";
  const hideOman = isSalesperson && userCountry === "UAE";

  // Table Columns (Product Code removed per requirements)
  const tableHeaders = [
    "#",
    "Product Name",
    "Category",
    "Unit",
    "Master Price",
    ...(!hideUae ? ["UAE Stock"] : []),
    ...(!hideOman ? ["Oman Stock"] : []),
    "Total Stock",
    "Status",
  ];

  // Table Data Mapping
  const tableRows = products.map((p, index) => {
    const priceStr = typeof p.masterPrice === "number" ? p.masterPrice.toFixed(2) : "0.00";
    
    const row = [
      String(index + 1),
      p.productName || "Unnamed Product",
      p.category || "General",
      p.unit || "Item",
      `${priceStr}`,
      ...(!hideUae ? [String(p.uaeStock ?? 0)] : []),
      ...(!hideOman ? [String(p.omanStock ?? 0)] : []),
      String(p.totalStock ?? 0),
      p.status || (p.totalStock > 10 ? "IN STOCK" : p.totalStock > 0 ? "LOW STOCK" : "OUT OF STOCK"),
    ];

    return row;
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [tableHeaders],
    body: tableRows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59], // Slate-800
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42], // Dark Navy
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 }, // #
      1: { cellWidth: "auto", fontStyle: "bold" }, // Name
      2: { cellWidth: 40 }, // Category
      3: { cellWidth: 22 }, // Unit
      4: { halign: "right", cellWidth: 32 }, // Price
      ...(!hideUae && !hideOman
        ? {
            5: { halign: "right", cellWidth: 26, fontStyle: "bold" }, // UAE
            6: { halign: "right", cellWidth: 26, fontStyle: "bold" }, // Oman
            7: { halign: "right", cellWidth: 26, fontStyle: "bold" }, // Total
            8: { halign: "center", cellWidth: 30 }, // Status
          }
        : {
            5: { halign: "right", cellWidth: 32, fontStyle: "bold" },
            6: { halign: "right", cellWidth: 32, fontStyle: "bold" },
            7: { halign: "center", cellWidth: 36 },
          }),
    },
    didParseCell: (data) => {
      // Style Status Column
      const statusColIndex = tableHeaders.indexOf("Status");
      if (data.section === "body" && data.column.index === statusColIndex) {
        const val = String(data.cell.raw).toUpperCase();
        if (val.includes("IN STOCK")) {
          data.cell.styles.textColor = [22, 101, 52]; // Green
          data.cell.styles.fontStyle = "bold";
        } else if (val.includes("LOW STOCK")) {
          data.cell.styles.textColor = [180, 83, 9]; // Amber
          data.cell.styles.fontStyle = "bold";
        } else if (val.includes("OUT OF STOCK")) {
          data.cell.styles.textColor = [190, 18, 60]; // Red
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawPage: (data) => {
      // Header on page 2+
      if (data.pageNumber > 1) {
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, pageWidth, 3, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("MAAT VET — Products & Stock Inventory Report", 14, 8);
        doc.text(`Generated: ${dateStr}`, pageWidth - 14, 8, { align: "right" });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(14, 10, pageWidth - 14, 10);
      }

      // Footer on all pages
      const pageCount = (doc.internal as any).getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

      doc.text("MAAT Veterinary Medicines Trading — Confidential & Proprietary Report", 14, pageHeight - 6);
      doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: "right" });
    },
    margin: { top: 14, bottom: 16, left: 14, right: 14 },
  });

  // Save the PDF with a clean filename
  const sanitizeDate = now.toISOString().split("T")[0];
  doc.save(`MAAT_Products_Stock_Catalog_${sanitizeDate}.pdf`);
}
