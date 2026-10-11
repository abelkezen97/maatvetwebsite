/**
 * Helper functions for Collection Ledger normalized date-range calculations.
 */

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type PeriodType =
  | "today"
  | "week"
  | "month"
  | "last_month"
  | "quarter"
  | "year"
  | "last_year"
  | "custom";

/**
 * Format a Date object to YYYY-MM-DD string using local date components
 */
export function formatDateToISOString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates normalized startDate and endDate based on period, year, month, and custom dates.
 */
export function getNormalizedDateRange(options: {
  period?: PeriodType | string;
  year?: number | string;
  month?: number | string; // 1 - 12
  customStart?: string;
  customEnd?: string;
}): DateRange {
  const now = new Date();
  const currentYear = options.year ? Number(options.year) : now.getFullYear();
  const currentMonth = options.month ? Number(options.month) : now.getMonth() + 1;

  const period = (options.period || "month").toLowerCase() as PeriodType;

  switch (period) {
    case "today": {
      const todayStr = formatDateToISOString(now);
      return { startDate: todayStr, endDate: todayStr };
    }

    case "week": {
      // Current week (Monday to Sunday)
      const day = now.getDay();
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.getFullYear(), now.getMonth(), diffToMon);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return {
        startDate: formatDateToISOString(monday),
        endDate: formatDateToISOString(sunday),
      };
    }

    case "month": {
      const start = new Date(currentYear, currentMonth - 1, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        startDate: formatDateToISOString(start),
        endDate: formatDateToISOString(end),
      };
    }

    case "last_month": {
      let targetYear = currentYear;
      let targetMonth = currentMonth - 1;
      if (targetMonth < 1) {
        targetMonth = 12;
        targetYear -= 1;
      }
      const start = new Date(targetYear, targetMonth - 1, 1);
      const end = new Date(targetYear, targetMonth, 0);
      return {
        startDate: formatDateToISOString(start),
        endDate: formatDateToISOString(end),
      };
    }

    case "quarter": {
      const q = Math.floor((currentMonth - 1) / 3);
      const startMonth = q * 3;
      const start = new Date(currentYear, startMonth, 1);
      const end = new Date(currentYear, startMonth + 3, 0);
      return {
        startDate: formatDateToISOString(start),
        endDate: formatDateToISOString(end),
      };
    }

    case "year": {
      return {
        startDate: `${currentYear}-01-01`,
        endDate: `${currentYear}-12-31`,
      };
    }

    case "last_year": {
      const lastYr = currentYear - 1;
      return {
        startDate: `${lastYr}-01-01`,
        endDate: `${lastYr}-12-31`,
      };
    }

    case "custom": {
      const start = options.customStart || formatDateToISOString(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = options.customEnd || formatDateToISOString(now);
      return { startDate: start, endDate: end };
    }

    default: {
      const start = new Date(currentYear, currentMonth - 1, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        startDate: formatDateToISOString(start),
        endDate: formatDateToISOString(end),
      };
    }
  }
}
