# MAATWEB Portal — Full Database Schema & Business Logic Specification

This document provides a comprehensive technical overview of the **MAATWEB** portal application, detailing TypeScript interface definitions, Google Sheets database columns, data flow architectures, credit balance clamping logic, and automated PDF & Receipt generation workflows.

---

## 1. Core Data Schemas (TypeScript Definitions)

### 1.1 Customer (`Customer`)
Represents clinics, farms, or individual doctors with trackable billwise credit balances.
```typescript
export interface Customer {
  id: string;                    // Unique identifier (e.g. cust-17289382)
  name: string;                  // Primary Contact Doctor Name (optional / e.g. Dr. Ahmed)
  company: string;               // Clinic / Farm / Company Name (Primary Key for Sheets)
  email: string;                 // Email address
  phone: string;                 // Phone number
  address?: string;              // Physical location / region (e.g. Dubai, UAE)
  pendingBillwiseAmount?: number;// Current unpaid credit balance (AED)
}
```

### 1.2 Product (`Product`)
Products with tiered bulk pricing model.
```typescript
export interface Product {
  id: string;          // Product ID
  sku: string;         // Stock Keeping Unit
  name: string;        // Product Name & Active Ingredients
  category: string;    // Category (e.g. Antibiotics, Supplements)
  price: number;       // Base unit price (AED)
  price10?: number;    // Tiered price for Qty >= 10
  price50?: number;    // Tiered price for Qty >= 50
  price100?: number;   // Tiered price for Qty >= 100
  unit: string;        // Unit type (e.g. Bottle, Box, Vial)
  description?: string;// Additional product notes
  isAvailable?: boolean;// Stock availability status
}
```

### 1.3 Quotation (`Quote`) & Items (`QuoteItem`)
```typescript
export interface QuoteItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;       // Original unit base price
  discount: number;    // Final applied rate per unit (after tier or manual discount)
  total: number;       // Line subtotal = quantity * discount
}

export interface Quote {
  id: string;
  quoteNumber: string; // Ref No (e.g. QT-2026-001)
  customerId: string;
  customerName: string;
  companyName: string;
  salesmanId: string;
  salesmanName: string;
  date: string;        // ISO Date String (YYYY-MM-DD)
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;    // VAT (0.00 in current setup)
  grandTotal: number;
  status: "Pending" | "Approved" | "Rejected";
  notes?: string;
}
```

### 1.4 Invoice (`Invoice`)
Tax-compliant billing record (Immutable after creation).
```typescript
export interface Invoice {
  id: string;
  invoiceNumber: string; // Ref No (e.g. INV-2026-001)
  quoteNumber?: string;  // Associated Quotation Ref (if converted)
  customerId: string;
  customerName: string;
  companyName: string;
  salesmanId: string;
  salesmanName: string;
  date: string;          // ISO Date String (YYYY-MM-DD)
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: "Paid" | "Credit";
  creditDays?: number;   // Required if status is 'Credit' (default: 30 days)
  notes?: string;
}
```

### 1.5 Receipt Voucher (`Receipt`)
Repayment voucher recording customer credit paybacks and automatic paid invoice receipts.
```typescript
export interface Receipt {
  id: string;
  receiptNumber: string;        // Ref No (e.g. REC-2026-001)
  customerId: string;
  customerName?: string;
  companyName: string;          // Customer Clinic / Farm Company Name
  amountPaid: number;           // Amount paid back by customer (AED)
  remainingPendingAmount?: number; // Clamped remaining credit balance (AED)
  paymentDate: string;          // Date of payment (YYYY-MM-DD)
  paymentMethod: "Cash" | "Bank Transfer" | "Cheque" | "Other";
  referenceNo?: string;         // Cheque # or Bank Transfer Reference
  notes?: string;
  createdBy?: string;
}
```

---

## 2. Google Sheets Database Architecture

The backend persists data via Google Apps Script Web Apps connected to master Google Sheets.

### 2.1 Customers Sheet (`Customers`)
| Column A | Column B | Column C | Column D | Column E | Column F | Column G |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ID** | **Company / Clinic** | **Doctor / Name** | **Email** | **Phone** | **Location / Address** | **Pending Billwise Amount** |

### 2.2 Invoices Sheet (`Invoices`)
| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H | Column I | Column J |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Invoice #** | **Company Name** | **Doctor Name** | **Salesman** | **Date** | **Grand Total (AED)** | **Status** | **Drive File Link** | **Items Summary** | **Invoice JSON** |

### 2.3 Receipts Sheet (`Receipts`)
| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Receipt #** | **Company Name** | **Doctor Name** | **Amount Paid (AED)** | **Payment Date** | **Payment Method** | **Reference No** | **Drive PDF Link** |

---

## 3. Business Logic & Automated Workflows

### 3.1 Customer Credit Clamping Logic
- **Rule**: Customer pending credit balance can **NEVER** display negative numbers (`< 0`).
- **Implementation**:
  ```typescript
  const clampedPending = Math.max(0, c.pendingBillwiseAmount || 0);
  ```
- **Scope**: Applied in Customer Directory, Invoice Customer Select Dropdowns, Issue Receipt Balance Preview Cards, and PDF Receipts.

### 3.2 Invoice Status & Credit Logic
- **When Invoice Status = `Credit`**:
  - `grandTotal` is **added** (`+`) to customer's `pendingBillwiseAmount`.
- **When Invoice Status = `Paid`**:
  - Customer's credit balance is **unaffected** (0 added).
  - An **Automatic Receipt Voucher** (`REC-YYYY-XXX`) is created immediately.

### 3.3 Automated Receipt Voucher Generation
When an invoice is issued with status **`Paid`** (or updated from `Credit` to `Paid`):
1. A unique receipt number (`REC-YYYY-00X`) is assigned.
2. The voucher is saved to `localStorage` and synced asynchronously to Google Sheets.
3. An emerald green theme Receipt PDF is generated including signature (`/public/kaleemsignature.png`).
4. A **"Share Receipt"** CTA appears next to the invoice in the Invoices Manager table and modal preview.

### 3.4 Data Performance & Caching Strategy
- **Instant Local Prefill**: On page mount, pages read from `localStorage` (`maat_invoices`, `maat_customers`, `maat_receipts`) to render UI instantly (< 50ms).
- **Non-Blocking Background Sync**: API post calls (`/api/invoices`, `/api/receipts`) and PDF Base64 rendering execute in background threads after instant UI redirection.
- **Parallel Revalidation**: Fresh data is fetched concurrently using `Promise.all([fetch("/api/products"), fetch("/api/customers"), ...])`.
