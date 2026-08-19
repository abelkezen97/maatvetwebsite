-- ==============================================================================
-- MAATWEB Migration: UAE + Oman Inventory Stock Separation
-- Target: PostgreSQL 15+ / Supabase
-- Description: Alters public.inventory_transactions to enforce country separation,
--              performance indexes, RLS policies, and stock calculation function.
-- ==============================================================================

-- 1. Ensure user_country ENUM exists
DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create or alter public.inventory_transactions table
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  country public.user_country NOT NULL DEFAULT 'UAE',
  transaction_type TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  remarks TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if inventory_transactions already exists
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_tx_prod_country ON public.inventory_transactions (product_id, country);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_country_type ON public.inventory_transactions (country, transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_ref ON public.inventory_transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_created_at ON public.inventory_transactions (created_at DESC);

-- 4. Enable and Configure Systemic RLS Policies
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.inventory_transactions TO authenticated;

DROP POLICY IF EXISTS "inventory_tx_select_policy" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_tx_insert_policy" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_tx_update_policy" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_tx_delete_policy" ON public.inventory_transactions;

-- SELECT POLICY: Super Admin or Accountant sees all; Salesperson sees only assigned country
CREATE POLICY "inventory_tx_select_policy" ON public.inventory_transactions
FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR public.get_user_role() = 'accountant'
  OR country::text = public.get_user_country()
);

-- INSERT POLICY: Super Admin or Accountant can insert; Salesperson can insert only SALE / SALE_RETURN for assigned country
CREATE POLICY "inventory_tx_insert_policy" ON public.inventory_transactions
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (
    country::text = public.get_user_country()
    AND (
      public.get_user_role() = 'accountant'
      OR (public.get_user_role() = 'salesperson' AND transaction_type IN ('SALE', 'SALE_RETURN'))
    )
  )
);

-- UPDATE & DELETE DISALLOWED
CREATE POLICY "inventory_tx_update_policy" ON public.inventory_transactions FOR UPDATE TO authenticated USING ( false );
CREATE POLICY "inventory_tx_delete_policy" ON public.inventory_transactions FOR DELETE TO authenticated USING ( false );

-- 5. Helper Function for Country Stock Aggregation
CREATE OR REPLACE FUNCTION public.get_product_stock(
  p_product_id UUID,
  p_country public.user_country
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(quantity), 0)
  FROM public.inventory_transactions
  WHERE product_id = p_product_id AND country = p_country;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
