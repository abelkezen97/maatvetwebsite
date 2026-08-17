-- ==============================================================================
-- MAATWEB Targeted Migration: Complete Financial Document Schema Alignment
-- File: supabase/migrations/20260814010000_align_financial_document_schema.sql
-- Description: Idempotent alignment of quotations, invoices, and receipts schemas,
--              adding missing canonical country, status, audit, soft-delete columns,
--              foreign key relationships, and issuing a PostgREST schema cache reload.
-- ==============================================================================

-- 1. Custom Enum Types
DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. QUOTATIONS TABLE ALIGNMENT
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS quotation_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft';
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. INVOICES TABLE ALIGNMENT
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Paid';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS credit_days INTEGER DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. RECEIPTS TABLE ALIGNMENT
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. FOREIGN KEY CONSTRAINTS
DO $$ BEGIN
  -- Quotations FKs
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_salesman') THEN
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_salesman FOREIGN KEY (salesman_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_created_by') THEN
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_updated_by') THEN
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_deleted_by') THEN
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- Invoices FKs
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_salesman') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_salesman FOREIGN KEY (salesman_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_created_by') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_updated_by') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_deleted_by') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- Receipts FKs
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_customer') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_invoice') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_invoice FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_created_by') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_updated_by') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_deleted_by') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. STATUS CHECK CONSTRAINTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_quotations_status') THEN
    ALTER TABLE public.quotations ADD CONSTRAINT chk_quotations_status CHECK (status IN ('Draft', 'Sent', 'Approved', 'Rejected'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_status') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (status IN ('Paid', 'Credit', 'Overdue', 'Cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_receipts_payment_method') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT chk_receipts_payment_method CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Cheque', 'Other'));
  END IF;
END $$;

-- 7. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
