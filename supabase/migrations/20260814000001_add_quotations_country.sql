-- ==============================================================================
-- MAATWEB Targeted Migration: Add Quotations Country, Audit & Soft-Delete Columns
-- Target: PostgreSQL 15+ / Supabase
-- Description: Small targeted migration to add missing country, audit (created_by, updated_by),
--              and soft-delete (is_deleted, deleted_at, deleted_by) columns to public.quotations.
-- ==============================================================================

-- 1. Ensure user_country ENUM exists
DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add country column with default 'UAE'
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';

-- 3. Add soft-delete columns
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. Add audit & soft-delete Foreign Key relationships
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_deleted_by') THEN
    ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_by UUID;
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_deleted_by FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_created_by') THEN
    ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_updated_by') THEN
    ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS updated_by UUID;
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
