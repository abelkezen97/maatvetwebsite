import { SupabaseClient } from "@supabase/supabase-js";
import { BillingSeries, DocumentSeries, SeriesDocType, UserCountry } from "@/types";

/**
 * PER-SALESMAN NUMBER SERIES
 *
 * The admin gives each salesman a prefix and next number per document type
 * (invoice / receipt) and billing series (UAE-registered "standard" /
 * Oman-registered "oman_reg", the latter UAE only). The database function
 * next_document_number() hands numbers out atomically and skips any number
 * that already exists (e.g. imported from the old software).
 */

export const BILLING_SERIES_LABEL: Record<BillingSeries, string> = {
  standard: "UAE-registered",
  oman_reg: "Oman-registered",
};

export const DOC_TYPE_LABEL: Record<SeriesDocType, string> = {
  invoice: "Invoices",
  receipt: "Receipts",
};

/** The series a salesman of this country can have. */
export function seriesSlotsFor(country: UserCountry | string | null | undefined): Array<{ docType: SeriesDocType; billingSeries: BillingSeries }> {
  const series: BillingSeries[] = country === "UAE" ? ["standard", "oman_reg"] : ["standard"];
  const slots: Array<{ docType: SeriesDocType; billingSeries: BillingSeries }> = [];
  (["invoice", "receipt"] as SeriesDocType[]).forEach((docType) =>
    series.forEach((billingSeries) => slots.push({ docType, billingSeries }))
  );
  return slots;
}

export function formatSeriesNumber(prefix: string, num: number, pad: number): string {
  return `${prefix}${String(Math.max(0, Math.floor(num))).padStart(pad, "0")}`;
}

export function mapSeriesFromDb(row: any): DocumentSeries {
  return {
    docType: row.doc_type,
    billingSeries: row.billing_series,
    prefix: row.prefix,
    nextNumber: Number(row.next_number) || 1,
    padLength: Number(row.pad_length) || 4,
    updatedAt: row.updated_at || undefined,
  };
}

/**
 * Takes the next number of a salesman's series, e.g. "AM-0101".
 * Returns null when the admin has not set that series up.
 */
export async function nextSeriesNumber(
  client: SupabaseClient,
  salesmanId: string,
  docType: SeriesDocType,
  billingSeries: BillingSeries
): Promise<string | null> {
  const { data, error } = await client.rpc("next_document_number", {
    p_salesman_id: salesmanId,
    p_doc_type: docType,
    p_billing_series: billingSeries,
  });
  if (error) throw new Error(`Could not take the next ${docType} number: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

/** The number the next document would get, without taking it (for previews). */
export async function peekSeriesNumber(
  client: SupabaseClient,
  salesmanId: string,
  docType: SeriesDocType,
  billingSeries: BillingSeries
): Promise<string | null> {
  const { data } = await client
    .from("document_series")
    .select("prefix, next_number, pad_length")
    .eq("salesman_id", salesmanId)
    .eq("doc_type", docType)
    .eq("billing_series", billingSeries)
    .maybeSingle();
  return data ? formatSeriesNumber(data.prefix, Number(data.next_number), Number(data.pad_length)) : null;
}
