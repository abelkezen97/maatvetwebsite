-- ==============================================================================
-- MAATWEB Migration: Consolidated Live Database Schema Alignment
-- Target: PostgreSQL 15+ / Supabase Project (qoalkjijnxhhiqtynbri)
-- File: supabase/migrations/20260814030000_consolidated_schema_alignment.sql
-- Description: Idempotent alignment of legacy NOT NULL constraints across
--              public.invoices, public.quotations, public.receipts, and line items.
--              Makes legacy columns nullable, adds safe defaults, backfills
--              canonical field values, preserves NOT NULL on quotations.customer_id,
--              and notifies PostgREST schema reload.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INVOICES TABLE LEGACY COLUMN ALIGNMENT
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Paid';
ALTER TABLE public.invoices ALTER COLUMN payment_status DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN payment_status SET DEFAULT 'Paid';

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash';
ALTER TABLE public.invoices ALTER COLUMN payment_method DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN payment_method SET DEFAULT 'Cash';

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.invoices ALTER COLUMN vat_amount DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN vat_amount SET DEFAULT 0.00;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.invoices ALTER COLUMN total_amount DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN total_amount SET DEFAULT 0.00;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quote_number TEXT;
ALTER TABLE public.invoices ALTER COLUMN quote_number DROP NOT NULL;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.invoices ALTER COLUMN customer_name DROP NOT NULL;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.invoices ALTER COLUMN company_name DROP NOT NULL;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS salesman_name TEXT;
ALTER TABLE public.invoices ALTER COLUMN salesman_name DROP NOT NULL;

-- Backfill legacy fields from canonical fields on invoices
UPDATE public.invoices
SET payment_status = COALESCE(payment_status, status, 'Paid')
WHERE payment_status IS NULL;

UPDATE public.invoices
SET vat_amount = COALESCE(vat_amount, vat_total, 0.00)
WHERE vat_amount IS NULL;

UPDATE public.invoices
SET total_amount = COALESCE(total_amount, grand_total, 0.00)
WHERE total_amount IS NULL;

UPDATE public.invoices
SET vat_total = COALESCE(vat_total, vat_amount, 0.00)
WHERE vat_total IS NULL;

UPDATE public.invoices
SET grand_total = COALESCE(grand_total, total_amount, 0.00)
WHERE grand_total IS NULL;


-- ------------------------------------------------------------------------------
-- 2. QUOTATIONS TABLE LEGACY COLUMN ALIGNMENT
-- ------------------------------------------------------------------------------
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.quotations ALTER COLUMN vat_amount DROP NOT NULL;
ALTER TABLE public.quotations ALTER COLUMN vat_amount SET DEFAULT 0.00;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.quotations ALTER COLUMN total_amount DROP NOT NULL;
ALTER TABLE public.quotations ALTER COLUMN total_amount SET DEFAULT 0.00;

-- NOTE: quotations.customer_id NOT NULL constraint is strictly PRESERVED per application business rules.

-- Backfill legacy fields from canonical fields on quotations
UPDATE public.quotations
SET vat_amount = COALESCE(vat_amount, vat_total, 0.00)
WHERE vat_amount IS NULL;

UPDATE public.quotations
SET total_amount = COALESCE(total_amount, grand_total, 0.00)
WHERE total_amount IS NULL;

UPDATE public.quotations
SET vat_total = COALESCE(vat_total, vat_amount, 0.00)
WHERE vat_total IS NULL;

UPDATE public.quotations
SET grand_total = COALESCE(grand_total, total_amount, 0.00)
WHERE grand_total IS NULL;


-- ------------------------------------------------------------------------------
-- 3. INVOICE ITEMS TABLE LEGACY COLUMN ALIGNMENT
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.invoice_items ALTER COLUMN total_price DROP NOT NULL;
ALTER TABLE public.invoice_items ALTER COLUMN total_price SET DEFAULT 0.00;

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.invoice_items ALTER COLUMN description DROP NOT NULL;

UPDATE public.invoice_items
SET total_price = COALESCE(total_price, line_total, 0.00)
WHERE total_price IS NULL;

UPDATE public.invoice_items
SET line_total = COALESCE(line_total, total_price, 0.00)
WHERE line_total IS NULL;


-- ------------------------------------------------------------------------------
-- 4. RECEIPTS TABLE LEGACY COLUMN ALIGNMENT
-- ------------------------------------------------------------------------------
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE public.receipts ALTER COLUMN reference_no DROP NOT NULL;

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.receipts ALTER COLUMN customer_name DROP NOT NULL;

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.receipts ALTER COLUMN company_name DROP NOT NULL;

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(12,2);
ALTER TABLE public.receipts ALTER COLUMN remaining_balance DROP NOT NULL;

UPDATE public.receipts
SET reference_no = COALESCE(reference_no, reference_number)
WHERE reference_no IS NULL AND reference_number IS NOT NULL;

UPDATE public.receipts
SET reference_number = COALESCE(reference_number, reference_no)
WHERE reference_number IS NULL AND reference_no IS NOT NULL;


-- ------------------------------------------------------------------------------
-- 5. RELOAD POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
