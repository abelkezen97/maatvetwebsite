import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generates the next guaranteed unused document number for a given entity table.
 * Analyzes all existing document numbers for the current year (including soft-deleted rows),
 * computes the highest numeric sequence, and returns candidate `${prefix}-${year}-${padStart}`.
 */
export async function generateNextDocumentNumber(
  supabase: SupabaseClient,
  table: "invoices" | "quotations" | "receipts" | "expenses" | "cash_handovers",
  column: "invoice_number" | "quotation_number" | "receipt_number" | "expense_number" | "handover_number",
  prefix: "INV" | "QT" | "REC" | "EXP" | "CH",
  padLength: number = 6
): Promise<string> {
  const year = new Date().getFullYear();
  const yearPrefix = `${prefix}-${year}-`;

  // Fetch all existing numbers for the current year prefix from the table.
  const { data } = await supabase
    .from(table)
    .select(column);

  let highestSeq = 0;

  if (data && Array.isArray(data)) {
    for (const row of data as Record<string, any>[]) {
      const val = row[column];
      if (typeof val === "string") {
        const match = val.match(new RegExp(`${prefix}-${year}-(\\d+)`)) || val.match(/(\d+)$/);
        if (match && match[1]) {
          const parsed = parseInt(match[1], 10);
          if (!isNaN(parsed) && parsed > highestSeq) {
            highestSeq = parsed;
          }
        }
      }
    }
  }

  let nextSeq = highestSeq + 1;
  let candidate = `${yearPrefix}${String(nextSeq).padStart(padLength, "0")}`;

  // Loop until candidate does not exist anywhere in DB
  let isUnique = false;
  while (!isUnique) {
    const { data: existing } = await supabase
      .from(table)
      .select("id")
      .eq(column, candidate)
      .maybeSingle();

    if (!existing) {
      isUnique = true;
    } else {
      nextSeq++;
      candidate = `${yearPrefix}${String(nextSeq).padStart(padLength, "0")}`;
    }
  }

  return candidate;
}
