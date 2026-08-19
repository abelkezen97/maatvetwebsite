import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generates the next guaranteed unused document number for a given entity table.
 * 
 * Prefix "D": Special sequence for Dr. Kaleemullah (e.g. D0353, D0354, D0355).
 * Prefix "INV": Standard invoice sequence (e.g. INV-2026-000353).
 */
export async function generateNextDocumentNumber(
  supabase: SupabaseClient,
  table: "invoices" | "quotations" | "receipts" | "expenses" | "cash_handovers",
  column: "invoice_number" | "quotation_number" | "receipt_number" | "expense_number" | "handover_number",
  prefix: "INV" | "QT" | "REC" | "EXP" | "CH" | "CF" | "D",
  padLength: number = 6
): Promise<string> {
  const year = new Date().getFullYear();

  let yearPrefix = "";
  let minThreshold = 0;

  if (prefix === "D") {
    // Dr. Kaleemullah prefix: D0353, D0354, D0355...
    yearPrefix = "D";
    padLength = 4;
    minThreshold = 352; // Next sequence starts at 353 (D0353)
  } else {
    yearPrefix = `${prefix}-${year}-`;
  }

  // Fetch all existing numbers for the column
  const { data } = await supabase
    .from(table)
    .select(column);

  let highestSeq = minThreshold;

  if (data && Array.isArray(data)) {
    for (const row of data as Record<string, any>[]) {
      const val = row[column];
      if (typeof val === "string" && !val.toUpperCase().includes("TEST")) {
        let parsed = NaN;
        if (prefix === "D") {
          // Match D0349, D0351, D0352, D0353
          const match = val.match(/^D(\d+)$/i);
          if (match && match[1]) {
            parsed = parseInt(match[1], 10);
          }
        } else {
          // Match INV-2026-000350
          const match = val.match(new RegExp(`^${prefix}-${year}-(\\d+)$`, "i"));
          if (match && match[1]) {
            parsed = parseInt(match[1], 10);
          }
        }

        if (!isNaN(parsed) && parsed < 1000000 && parsed > highestSeq) {
          highestSeq = parsed;
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
