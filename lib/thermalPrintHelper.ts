import { Invoice, Receipt } from "@/types";

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Generates an 80mm thermal receipt layout on demand and opens browser print dialog.
 * Stays strictly client-side and is NOT saved or uploaded to Google Drive.
 */
export const printInvoiceThermalBill = (invoice: Invoice) => {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) {
    alert("Please allow popups to print the thermal bill.");
    return;
  }

  const itemsHtml = (invoice.items || [])
    .map(
      (item) => `
      <tr>
        <td colspan="2" style="font-weight: bold; padding-top: 4px;">${item.productName}</td>
      </tr>
      <tr>
        <td style="padding-left: 8px; color: #333;">${item.quantity} x AED ${item.discount.toFixed(2)}</td>
        <td style="text-align: right; font-weight: bold;">AED ${item.total.toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  const content = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice Bill - ${invoice.invoiceNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            width: 74mm;
            margin: 0 auto;
            padding: 5mm 2mm;
            font-family: 'Courier New', Courier, monospace, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            line-height: 1.3;
          }
          .header { text-align: center; margin-bottom: 6px; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; }
          .total-box { margin-top: 6px; padding-top: 4px; border-top: 1.5px solid #000; }
          .grand-total { font-size: 13px; font-weight: bold; display: flex; justify-content: space-between; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <p style="font-size: 14px; font-weight: bold; margin: 0; text-transform: uppercase;">INVOICE BILL</p>
        </div>

        <div class="divider"></div>

        <div class="row"><span>Inv No:</span><span class="bold">${invoice.invoiceNumber}</span></div>
        <div class="row"><span>Date:</span><span>${formatDisplayDate(invoice.date)}</span></div>
        ${invoice.customerName ? `<div class="row"><span>Customer:</span><span class="bold">${invoice.customerName}</span></div>` : ""}
        ${invoice.companyName ? `<div class="row"><span>Company:</span><span>${invoice.companyName}</span></div>` : ""}
        <div class="row"><span>Status:</span><span class="bold">${invoice.status || "Unpaid"}</span></div>

        <div class="divider"></div>

        <table>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="row"><span>Subtotal:</span><span>AED ${invoice.subtotal.toFixed(2)}</span></div>
        ${invoice.discountTotal > 0 ? `<div class="row"><span>Discount:</span><span>-AED ${invoice.discountTotal.toFixed(2)}</span></div>` : ""}
        
        <div class="total-box">
          <div class="grand-total">
            <span>TOTAL:</span>
            <span>AED ${invoice.grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div class="double-divider"></div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(content);
  printWindow.document.close();
};

/**
 * Generates an 80mm thermal receipt voucher layout on demand and opens browser print dialog.
 * Stays strictly client-side and is NOT saved or uploaded to Google Drive.
 */
export const printReceiptThermalBill = (receipt: Receipt) => {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) {
    alert("Please allow popups to print the thermal receipt.");
    return;
  }

  const content = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt Bill - ${receipt.receiptNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            width: 74mm;
            margin: 0 auto;
            padding: 5mm 2mm;
            font-family: 'Courier New', Courier, monospace, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            line-height: 1.3;
          }
          .header { text-align: center; margin-bottom: 6px; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .bold { font-weight: bold; }
          .amount-box { margin: 8px 0; padding: 6px; border: 1.5px solid #000; text-align: center; }
          .amount-title { font-size: 10px; text-transform: uppercase; }
          .amount-val { font-size: 15px; font-weight: bold; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="header">
          <p style="font-size: 14px; font-weight: bold; margin: 0; text-transform: uppercase;">RECEIPT VOUCHER</p>
        </div>

        <div class="divider"></div>

        <div class="row"><span>Receipt No:</span><span class="bold">${receipt.receiptNumber}</span></div>
        <div class="row"><span>Date:</span><span>${formatDisplayDate(receipt.paymentDate)}</span></div>
        <div class="row"><span>Company:</span><span class="bold">${receipt.companyName}</span></div>
        ${receipt.customerName ? `<div class="row"><span>Contact:</span><span>${receipt.customerName}</span></div>` : ""}
        <div class="row"><span>Payment Method:</span><span>${receipt.paymentMethod}</span></div>
        ${receipt.referenceNo ? `<div class="row"><span>Ref / Cheque #:</span><span>${receipt.referenceNo}</span></div>` : ""}

        <div class="divider"></div>

        <div class="amount-box">
          <div class="amount-title">AMOUNT RECEIVED</div>
          <div class="amount-val">AED ${receipt.amountPaid.toFixed(2)}</div>
        </div>

        <div class="double-divider"></div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(content);
  printWindow.document.close();
};
