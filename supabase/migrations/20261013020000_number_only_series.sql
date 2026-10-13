-- Allow a number series without a prefix (plain numbers such as 0237), as
-- the previous system used for UAE-registered invoices. The prefix may now be
-- empty; it is still at most 12 characters. The unique index on
-- (doc_type, upper(prefix)) still means only one salesman can have a
-- numbers-only series per document type, so numbers never clash.

alter table public.document_series
  drop constraint if exists document_series_prefix_check;

alter table public.document_series
  add constraint document_series_prefix_check
  check (length(trim(both from prefix)) <= 12);
