-- Migration: 20260814040000_fix_receipts_fk_ambiguity.sql
-- Description: Drop redundant legacy foreign key constraints causing PostgREST relationship ambiguity (PGRST201)

-- 1. Drop redundant legacy auto-generated foreign key between receipts and customers
ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_customer_id_fkey;

-- 2. Drop redundant legacy foreign keys on receipts, invoices, and quotations to eliminate embedding ambiguity
ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_invoice_id_fkey,
  DROP CONSTRAINT IF EXISTS receipts_created_by_fkey;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_salesman_id_fkey;

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_salesman_id_fkey;

-- 3. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
