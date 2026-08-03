export type UserRole = "Admin" | "Salesman";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  price10?: number;
  price50?: number;
  price100?: number;
  unit: string;
  description?: string;
  isAvailable?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address?: string;
  pendingBillwiseAmount?: number;
}


export interface QuoteItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  discount: number; // percentage, e.g. 10 for 10%
  total: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  companyName: string;
  salesmanId: string;
  salesmanName: string;
  date: string;
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: "Pending" | "Approved" | "Rejected";
  notes?: string;
  showBasePrice?: boolean;
  footerText?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteNumber?: string;
  customerId: string;
  customerName: string;
  companyName: string;
  salesmanId: string;
  salesmanName: string;
  date: string;
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: "Paid" | "Credit";
  creditDays?: number;
  notes?: string;
}


export interface Receipt {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName?: string;
  companyName: string;
  amountPaid: number;
  remainingPendingAmount?: number;
  paymentDate: string;
  paymentMethod: "Cash" | "Bank Transfer" | "Cheque" | "Other";
  referenceNo?: string;
  notes?: string;
  createdBy?: string;
}
