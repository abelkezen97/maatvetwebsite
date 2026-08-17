import { Profile, UserRole, UserCountry } from "@/types";

export interface ProfileContext {
  id: string;
  role: UserRole;
  country: UserCountry;
  is_active: boolean;
}

/**
 * Central Permission Helper Service
 * Used across UI components and API handlers to evaluate access rights.
 */
export const Permissions = {
  // Navigation & Dashboard
  canViewDashboard: (p: ProfileContext): boolean => p.is_active,
  canManageUsers: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Customers
  canViewCustomers: (p: ProfileContext): boolean => p.is_active,
  canCreateCustomer: (p: ProfileContext): boolean => p.is_active,
  canEditCustomer: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteCustomer: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),

  // Quotations
  canViewQuotations: (p: ProfileContext): boolean => p.is_active,
  canCreateQuotation: (p: ProfileContext): boolean => p.is_active,
  canEditQuotation: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteQuotation: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Invoices
  canViewInvoices: (p: ProfileContext): boolean => p.is_active,
  canCreateInvoice: (p: ProfileContext): boolean => p.is_active,
  canEditInvoice: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteInvoice: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Receipts
  canViewReceipts: (p: ProfileContext): boolean => p.is_active,
  canCreateReceipt: (p: ProfileContext): boolean => p.is_active,
  canEditReceipt: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteReceipt: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Products (Company Master Data)
  canViewProducts: (p: ProfileContext): boolean => p.is_active,
  canManageProducts: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Settings
  canViewSettings: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",
  canManageSettings: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Collection Ledger & Expenses
  canViewCollectionLedger: (p: ProfileContext): boolean => p.is_active,
  canViewAllLedgers: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),
  canViewExpenses: (p: ProfileContext): boolean => p.is_active,
  canCreateExpense: (p: ProfileContext): boolean => p.is_active,
  canApproveExpense: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),
  canSoftDeleteExpense: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),
  canViewHandovers: (p: ProfileContext): boolean => p.is_active,
  canCreateHandover: (p: ProfileContext): boolean => p.is_active,
  canApproveHandover: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),
  canSetOpeningBalance: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),
};
