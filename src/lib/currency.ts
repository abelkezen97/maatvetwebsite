/**
 * Currency per country. UAE trades in AED (2 decimals), Oman in OMR
 * (3 decimals: 1 rial = 1000 baisa). Every user works in their own
 * country's currency; documents use the document's country.
 */
export type CurrencyCode = "AED" | "OMR";

export function currencyFor(country?: string | null): CurrencyCode {
  return country === "Oman" ? "OMR" : "AED";
}

export function decimalsFor(country?: string | null): number {
  return country === "Oman" ? 3 : 2;
}

const ARABIC_SYMBOL: Record<CurrencyCode, string> = {
  AED: "د.إ",
  OMR: "ر.ع.",
};

/** Number only, with the country's decimals: 1,740.00 (UAE) or 1,740.000 (Oman). */
export function formatAmount(amount: number | string | null | undefined, country?: string | null): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount ?? 0)) || 0;
  const dp = decimalsFor(country);
  return num.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** "AED 1,740.00" / "OMR 1,740.000", or the Arabic form "1,740.00 د.إ". */
export function formatMoney(
  amount: number | string | null | undefined,
  country?: string | null,
  locale: "en" | "ar" = "en"
): string {
  const code = currencyFor(country);
  const value = formatAmount(amount, country);
  return locale === "ar" ? `${value} ${ARABIC_SYMBOL[code]}` : `${code} ${value}`;
}
