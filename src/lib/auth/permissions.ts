import { Profile, UserRole, UserCountry } from "@/types";

export interface ProfileContext {
  id: string;
  role: UserRole;
  country: UserCountry;
  is_active: boolean;
}

/**
 * Office staff of a country: its admin(s) and accountant(s).
 * There is no global role: every user, including admins, only reaches
 * records of their own `country`.
 */
export function isCountryStaff(p: Pick<ProfileContext, "role">): boolean {
  return p.role === "super_admin" || p.role === "accountant";
}

/** The admin of a country (stored as role "super_admin"). */
export function isCountryAdmin(p: Pick<ProfileContext, "role">): boolean {
  return p.role === "super_admin";
}

/** Display name of a role: "Admin (Oman)", "Accountant", "Salesperson". */
export function roleLabel(role: string, country?: string | null): string {
  if (role === "super_admin") return country ? `Admin (${country})` : "Admin";
  if (role === "accountant") return "Accountant";
  return "Salesperson";
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
  canEditInvoice: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",
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
  canApproveExpense: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canSoftDeleteExpense: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),
  canViewHandovers: (p: ProfileContext): boolean => p.is_active,
  canCreateHandover: (p: ProfileContext): boolean => p.is_active,
  canApproveHandover: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canSetOpeningBalance: (p: ProfileContext): boolean => p.is_active && (p.role === "super_admin" || p.role === "accountant"),

  // Inventory & Stock Management
  canViewInventory: (p: ProfileContext): boolean => p.is_active,
  canManageInventory: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",
  canViewInventoryMovements: (p: ProfileContext): boolean => p.is_active,
};
