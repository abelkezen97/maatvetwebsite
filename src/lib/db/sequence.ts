import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Generates the next guaranteed unused document number for a given entity table.
 * 
 * Prefix "D": Special sequence for Dr. Kaleemullah (e.g. D0353, D0354, D0355).
 * Prefix "INV": Standard invoice sequence (e.g. INV-2026-000353).
 */
export async function generateNextDocumentNumber(
  supabase: SupabaseClient,
  table: "invoices" | "quotations" | "receipts" | "expenses" | "cash_handovers" | "credit_notes",
  column: "invoice_number" | "quotation_number" | "receipt_number" | "expense_number" | "handover_number" | "credit_note_number",
  prefix: "INV" | "QT" | "REC" | "EXP" | "CH" | "CF" | "D" | "CN" | "CNM",
  padLength: number = 6
): Promise<string> {
  const year = new Date().getFullYear();
  const queryClient = createAdminClient() || supabase;

  let yearPrefix = "";
  let minThreshold = 0;

  if (prefix === "D" || table === "invoices") {
    // Invoice sequence prefix "D": D0353, D0354, D0355...
    yearPrefix = "D";
    padLength = 4;
    minThreshold = 352; // Sequence starts after 352 (D0353, D0354...)
  } else {
    yearPrefix = `${prefix}-${year}-`;
  }

  // Fetch all existing numbers for the column across the entire database
  const { data } = await queryClient
    .from(table)
    .select(column);

  let highestSeq = minThreshold;

  if (data && Array.isArray(data)) {
    for (const row of data as Record<string, any>[]) {
      const val = row[column];
      if (typeof val === "string" && !val.toUpperCase().includes("TEST")) {
        let parsed = NaN;
        if (prefix === "D" || table === "invoices") {
          // Match D0349, D0351, D0352, D0353, D0354, D0355
          const matchD = val.match(/^D(\d+)$/i);
          if (matchD && matchD[1]) {
            parsed = parseInt(matchD[1], 10);
          } else {
            // Match legacy INV-2026-000350
            const matchInv = val.match(/^INV-\d{4}-(\d+)$/i);
            if (matchInv && matchInv[1]) {
              parsed = parseInt(matchInv[1], 10);
            }
          }
        } else {
          // Match standard prefix format (e.g. QT-2026-000001)
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
    const { data: existing } = await queryClient
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
