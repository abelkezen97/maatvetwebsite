-- ==============================================================================
-- MAATWEB Migration: Final Schema Alignment & Canonical Consolidation
-- Target: PostgreSQL 15+ / Supabase
-- Description: Idempotent alignment of canonical column names, audit tracking,
--              safe financial backfill, orphan handling, complete FK matrix,
--              canonical check constraints, and non-recursive profiles RLS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. LEGACY COLUMN STRATEGY NOTE
-- ------------------------------------------------------------------------------
-- NOTE: The following legacy columns are intentionally RETAINED in this migration
-- for audit, zero data-loss safety, and rollback capabilities:
--   - quotations.vat_amount, quotations.total_amount
--   - invoices.vat_amount, invoices.total_amount
--   - invoice_items.total_price
--   - receipts.reference_no
--
-- The application code will strictly query and write to the CANONICAL columns
-- (vat_total, grand_total, line_total, reference_number). Legacy columns will be
-- dropped in a subsequent cleanup migration after production verification.

-- ------------------------------------------------------------------------------
-- 2. CUSTOM ENUM TYPES
-- ------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'accountant', 'salesperson');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------------------
-- 3. COLUMN ALIGNMENT (MISSING AUDIT & CANONICAL COLUMNS)
-- ------------------------------------------------------------------------------

-- 3.1 CUSTOMERS
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_by UUID;

-- 3.2 PRODUCTS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_by UUID;

-- 3.3 PRODUCT CATEGORIES
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS updated_by UUID;

-- 3.4 QUOTATIONS
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- 3.5 INVOICES
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quotation_id UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- 3.6 INVOICE ITEMS
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(12,2) DEFAULT 0.00;

-- 3.7 RECEIPTS
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_by UUID;


-- ------------------------------------------------------------------------------
-- 4. GENERAL PRODUCT CATEGORY ORPHAN RESOLUTION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_general_id UUID;
BEGIN
  -- Check if a category named 'General' already exists (case-insensitive)
  SELECT id INTO v_general_id 
  FROM public.product_categories 
  WHERE LOWER(name) = 'general' 
  LIMIT 1;

  IF v_general_id IS NOT NULL THEN
    -- Re-link orphaned product to existing General category ID
    UPDATE public.products 
    SET category_id = v_general_id 
    WHERE category_id = 'b3392a71-d7bd-479a-ba0b-097de0087b8a';
  ELSE
    -- If orphan ID does not exist under another name, safely insert General with orphan ID
    IF NOT EXISTS (SELECT 1 FROM public.product_categories WHERE id = 'b3392a71-d7bd-479a-ba0b-097de0087b8a') THEN
      INSERT INTO public.product_categories (id, name, created_at, updated_at)
      VALUES ('b3392a71-d7bd-479a-ba0b-097de0087b8a', 'General', NOW(), NOW());
    END IF;
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 5. FINANCIAL & CANONICAL DATA BACKFILL (SAFE NON-OVERWRITE)
-- ------------------------------------------------------------------------------

-- 5.1 Quotations: Copy legacy values only when canonical value IS NULL
UPDATE public.quotations
SET vat_total = vat_amount
WHERE vat_total IS NULL AND vat_amount IS NOT NULL;

UPDATE public.quotations
SET grand_total = total_amount
WHERE grand_total IS NULL AND total_amount IS NOT NULL;

-- 5.2 Invoices: Copy legacy values only when canonical value IS NULL
UPDATE public.invoices
SET vat_total = vat_amount
WHERE vat_total IS NULL AND vat_amount IS NOT NULL;

UPDATE public.invoices
SET grand_total = total_amount
WHERE grand_total IS NULL AND total_amount IS NOT NULL;

-- 5.3 Invoice Items: Copy legacy total_price only when line_total IS NULL
UPDATE public.invoice_items
SET line_total = total_price
WHERE line_total IS NULL AND total_price IS NOT NULL;

-- 5.4 Receipts: Copy reference_no only when reference_number IS NULL
UPDATE public.receipts
SET reference_number = reference_no
WHERE reference_number IS NULL AND reference_no IS NOT NULL;


-- ------------------------------------------------------------------------------
-- 6. FULL FOREIGN KEY MATRIX ADDITION (IDEMPOTENT)
-- ------------------------------------------------------------------------------

-- 6.1 CUSTOMERS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_salesman') THEN
    ALTER TABLE public.customers ADD CONSTRAINT fk_customers_salesman FOREIGN KEY (assigned_salesman_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_created_by') THEN
    ALTER TABLE public.customers ADD CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_updated_by') THEN
    ALTER TABLE public.customers ADD CONSTRAINT fk_customers_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6.2 PRODUCTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_category') THEN
    ALTER TABLE public.products ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_created_by') THEN
    ALTER TABLE public.products ADD CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_updated_by') THEN
    ALTER TABLE public.products ADD CONSTRAINT fk_products_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6.3 PRODUCT CATEGORIES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_categories_created_by') THEN
    ALTER TABLE public.product_categories ADD CONSTRAINT fk_product_categories_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_categories_updated_by') THEN
    ALTER TABLE public.product_categories ADD CONSTRAINT fk_product_categories_updated_by FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6.4 QUOTATIONS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_customer') THEN
    ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
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
END $$;

-- 6.5 QUOTATION ITEMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotation_items_quotation') THEN
    ALTER TABLE public.quotation_items ADD CONSTRAINT fk_quotation_items_quotation FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotation_items_product') THEN
    ALTER TABLE public.quotation_items ADD CONSTRAINT fk_quotation_items_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6.6 INVOICES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_quotation') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_quotation FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_customer') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
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
END $$;

-- 6.7 INVOICE ITEMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoice_items_invoice') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoice_items_product') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6.8 RECEIPTS
DO $$ BEGIN
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


-- ------------------------------------------------------------------------------
-- 7. CANONICAL CHECK CONSTRAINTS (IDEMPOTENT)
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- 8. NON-RECURSIVE PROFILES RLS HELPERS & POLICIES
-- ------------------------------------------------------------------------------

-- SECURITY DEFINER helper function bypasses table RLS during internal execution scope
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'::public.user_role
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_manage" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
FOR SELECT TO authenticated USING (
  id = auth.uid() OR public.is_super_admin()
);

CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
FOR UPDATE TO authenticated USING (
  id = auth.uid() OR public.is_super_admin()
) WITH CHECK (
  id = auth.uid() OR public.is_super_admin()
);
