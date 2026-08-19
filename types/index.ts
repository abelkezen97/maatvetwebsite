export type UserRole = "super_admin" | "accountant" | "salesperson";
export type UserCountry = "UAE" | "Oman";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  country: UserCountry;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  country: UserCountry;
  avatarUrl?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  productCode?: string;
  sku: string;
  name: string;
  barcode?: string;
  categoryId?: string;
  category_id?: string;
  category: string;
  categoryObj?: { id?: string; name: string };
  price: number; // Unit base selling price
  sellingPrice?: number;
  costPrice?: number;
  price10?: number;
  price50?: number;
  price100?: number;
  unit: string;
  packSize?: string;
  brand?: string;
  manufacturer?: string;
  description?: string;
  isAvailable?: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  customerCode?: string;
  name: string; // Doctor / Primary Contact Name
  doctorName?: string;
  company: string; // Clinic / Farm / Company Name
  companyName?: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country: UserCountry;
  assignedSalesmanId?: string;
  assignedSalesmanName?: string;
  assignedSalesmanRole?: string;
  creditLimit?: number;
  openingBalance?: number;
  pendingBillwiseAmount?: number;
  notes?: string;
  is_active?: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuoteItem {
  id?: string;
  quotationId?: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number; // Catalogue base unit price
  unitPrice?: number; // Optional unitPrice alias
  discount: number; // Calculated discount amount per unit (unitPrice - effectiveUnitPrice)
  discountPrice?: number | string; // Negotiated final selling price per unit
  manualDiscount?: number | string; // Alias for discountPrice
  total: number;
}

export type QuoteStatus = "Draft" | "Sent" | "Approved" | "Rejected";

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  companyName: string;
  salesmanId: string;
  salesmanName: string;
  country: UserCountry;
  date: string;
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: QuoteStatus;
  notes?: string;
  showBasePrice?: boolean;
  footerText?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteNumber?: string;
  customerId: string;
  customerName: string;
  companyName: string;
  salesmanId?: string;
  salesmanName: string;
  country: UserCountry;
  date: string;
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: "Paid" | "Credit";
  paymentMethod?: "Cash" | "Bank Transfer" | "Cheque" | "Other";
  creditDays?: number;
  paidAmount?: number;
  outstandingAmount?: number;
  paymentStatus?: string;
  notes?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName?: string;
  companyName: string;
  invoiceId?: string;
  amountPaid: number;
  remainingPendingAmount?: number;
  paymentDate: string;
  paymentMethod: "Cash" | "Bank Transfer" | "Cheque" | "Other";
  referenceNo?: string;
  notes?: string;
  country: UserCountry;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ExpenseCategory =
  | "Petrol"
  | "Food"
  | "Rent"
  | "Travel"
  | "Vehicle"
  | "Accommodation"
  | "Office"
  | "Miscellaneous"
  | "Other";

export type ExpensePaymentMethod =
  | "Cash"
  | "Company Card"
  | "Personal Card"
  | "Bank Transfer"
  | "Other";

export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

export interface Expense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  salespersonId: string;
  salespersonName?: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  description?: string;
  attachmentUrl?: string;
  country: UserCountry;
  status: ApprovalStatus;
  rejectionReason?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type HandoverType = "admin_handover" | "carry_forward";

export interface CashHandover {
  id: string;
  handoverNumber: string;
  handoverDate: string;
  salespersonId: string;
  salespersonName?: string;
  receivedBy: string;
  receivedByName?: string;
  amount: number;
  handoverType?: HandoverType;
  referenceNumber?: string;
  notes?: string;
  country: UserCountry;
  status: ApprovalStatus;
  rejectionReason?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalespersonOpeningBalance {
  id: string;
  salespersonId: string;
  salespersonName?: string;
  effectiveDate: string;
  openingCash: number;
  notes?: string;
  country: UserCountry;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectionLedgerEntry {
  id: string;
  date: string;
  timestamp: string;
  type: "OPENING_BALANCE" | "CASH_RECEIPT" | "CASH_EXPENSE" | "CASH_HANDOVER" | "CASH_CARRY_FORWARD";
  description: string;
  referenceNo: string;
  paymentMethod: string;
  customerName?: string;
  inAmount: number;
  outAmount: number;
  balance: number;
}

export interface CollectionLedgerSummary {
  salespersonId: string;
  salespersonName: string;
  country: UserCountry;
  openingCash: number;
  totalCashCollected: number;
  totalCashExpenses: number;
  totalCashHandedOver: number;
  currentCashInHand: number;
  pendingExpensesCount: number;
  pendingHandoversCount: number;
}

export type InventoryMovementType =
  | "OPENING_STOCK"
  | "STOCK_RECEIVED"
  | "SALE"
  | "SALE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "EXPIRY"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export interface InventoryMovement {
  id: string;
  productId: string;
  productName?: string;
  productCode?: string;
  country: UserCountry;
  movementType: InventoryMovementType;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
}

export interface ProductStockSummary {
  productId: string;
  productCode?: string;
  productName: string;
  category: string;
  uaeStock: number;
  omanStock: number;
  totalStock: number;
  status: "IN STOCK" | "LOW STOCK" | "OUT OF STOCK";
  masterPrice: number;
  unit: string;
}

export interface InventoryDashboardMetrics {
  totalProducts: number;
  totalStockUnits: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

export interface Settings {
  id: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  taxNumber?: string;
  currency: string;
}

export interface DocumentSettings {
  id: string;
  quotePrefix: string;
  invoicePrefix: string;
  receiptPrefix: string;
  quoteFooter?: string;
  invoiceFooter?: string;
}
