-- ==============================================================================
-- MAATWEB Targeted Migration: Financial Documents Schema Alignment
-- Target: PostgreSQL 15+ / Supabase
-- Description: Small targeted migration adding country, audit (created_by, updated_by),
--              status, issue_date, and soft-delete columns across quotations, invoices, and receipts.
-- ==============================================================================

-- 1. Ensure user_country ENUM exists
DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. QUOTATIONS TABLE ALIGNMENT
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_deleted_by') THEN
    ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_by UUID;
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_created_by') THEN
    ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_updated_by') THEN
    ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS updated_by UUID;
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. INVOICES TABLE ALIGNMENT
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Paid';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_deleted_by') THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_by UUID;
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_created_by') THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_updated_by') THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_by UUID;
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. RECEIPTS TABLE ALIGNMENT
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_deleted_by') THEN
    ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_by UUID;
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_updated_by') THEN
    ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_by UUID;
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
