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

export const ALL_COUNTRIES: UserCountry[] = ["UAE", "Oman"];

/**
 * Countries a user may work in: their active country plus any extra ones
 * (an accountant can cover both UAE and Oman). Always includes `country`.
 */
export function workCountries(p: { country: UserCountry; countries?: string[] | null } | null | undefined): UserCountry[] {
  if (!p) return [];
  const list = [p.country, ...((p.countries || []) as UserCountry[])];
  return ALL_COUNTRIES.filter((c) => list.includes(c));
}

/** An admin manages a user who works in the admin's country (a shared accountant counts for both). */
export function managesUser(
  admin: { country: UserCountry },
  target: { country: UserCountry; countries?: string[] | null } | null | undefined
): boolean {
  return !!target && workCountries(target).includes(admin.country);
}

/**
 * The countries list to store for a user: only accountants may cover several
 * countries, and the list always includes `home`. Returns [] for a single country.
 */
export function normalizeCountries(role: string, home: UserCountry, requested: unknown): UserCountry[] {
  if (role !== "accountant" || !Array.isArray(requested)) return [];
  const list = ALL_COUNTRIES.filter((c) => c === home || requested.includes(c));
  return list.length > 1 ? list : [];
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
 *
 * Office staff (admin and accountant) have full access to their country's
 * data. Only the admin manages users and logins (canManageUsers).
 */
export const Permissions = {
  // Navigation & Dashboard
  canViewDashboard: (p: ProfileContext): boolean => p.is_active,
  canManageUsers: (p: ProfileContext): boolean => p.is_active && p.role === "super_admin",

  // Customers
  canViewCustomers: (p: ProfileContext): boolean => p.is_active,
  canCreateCustomer: (p: ProfileContext): boolean => p.is_active,
  canEditCustomer: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteCustomer: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Quotations
  canViewQuotations: (p: ProfileContext): boolean => p.is_active,
  canCreateQuotation: (p: ProfileContext): boolean => p.is_active,
  canEditQuotation: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteQuotation: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Invoices
  canViewInvoices: (p: ProfileContext): boolean => p.is_active,
  canCreateInvoice: (p: ProfileContext): boolean => p.is_active,
  canEditInvoice: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canSoftDeleteInvoice: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Receipts
  canViewReceipts: (p: ProfileContext): boolean => p.is_active,
  canCreateReceipt: (p: ProfileContext): boolean => p.is_active,
  canEditReceipt: (p: ProfileContext): boolean => p.is_active,
  canSoftDeleteReceipt: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Products (Company Master Data)
  canViewProducts: (p: ProfileContext): boolean => p.is_active,
  canManageProducts: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Settings
  canViewSettings: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canManageSettings: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Collection Ledger & Expenses
  canViewCollectionLedger: (p: ProfileContext): boolean => p.is_active,
  canViewAllLedgers: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canViewExpenses: (p: ProfileContext): boolean => p.is_active,
  canCreateExpense: (p: ProfileContext): boolean => p.is_active,
  canApproveExpense: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canSoftDeleteExpense: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canViewHandovers: (p: ProfileContext): boolean => p.is_active,
  canCreateHandover: (p: ProfileContext): boolean => p.is_active,
  canApproveHandover: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canSetOpeningBalance: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),

  // Inventory & Stock Management
  canViewInventory: (p: ProfileContext): boolean => p.is_active,
  canManageInventory: (p: ProfileContext): boolean => p.is_active && isCountryStaff(p),
  canViewInventoryMovements: (p: ProfileContext): boolean => p.is_active,
};
