/**
 * Presentation-layer formatting helpers for MAATWEB (Currency, Dates, Numbers).
 */

import { formatMoney } from "@/lib/currency";

/**
 * Formats an amount in the country's currency.
 * UAE: "AED 1,740.00" (Ar: "1,740.00 د.إ")
 * Oman: "OMR 1,740.000" (Ar: "1,740.000 ر.ع.")
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  locale: "en" | "ar",
  country?: string | null
): string {
  return formatMoney(amount, country, locale);
}

/**
 * Formats a date string into natural English or Arabic format.
 * En: "17 Aug 2026"
 * Ar: "17 أغسطس 2026"
 */
export function formatDate(dateVal: string | Date | null | undefined, locale: "en" | "ar"): string {
  if (!dateVal) return "";
  try {
    const d = typeof dateVal === "string" ? new Date(dateVal.trim()) : dateVal;
    if (isNaN(d.getTime())) return String(dateVal);

    const day = d.getDate();
    const year = d.getFullYear();

    const enMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const arMonths = [
      "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
      "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
    ];

    if (locale === "ar") {
      return `${day} ${arMonths[d.getMonth()]} ${year}`;
    }
    return `${day} ${enMonths[d.getMonth()]} ${year}`;
  } catch (e) {
    return String(dateVal);
  }
}

/**
 * Formats a numeric value cleanly.
 */
export function formatNumber(num: number | string | null | undefined, locale: "en" | "ar"): string {
  const n = typeof num === "number" ? num : parseFloat(String(num || 0)) || 0;
  return n.toLocaleString("en-US");
}
