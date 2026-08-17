-- ==============================================================================
-- MAATWEB Inventory & Stock Management Migration
-- Target: PostgreSQL 15+ / Supabase
-- Description: Creates inventory_movements table, movement_type enum, indexes,
--              unified systemic RLS policies, and stock calculation helper.
-- ==============================================================================

-- 1. Inventory Movement Type Enum
DO $$ BEGIN
  CREATE TYPE public.inventory_movement_type AS ENUM (
    'OPENING_STOCK',
    'STOCK_RECEIVED',
    'SALE',
    'SALE_RETURN',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'DAMAGE',
    'EXPIRY',
    'TRANSFER_IN',
    'TRANSFER_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Inventory Movements Table
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  country public.user_country NOT NULL,
  movement_type public.inventory_movement_type NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_movements_prod_country ON public.inventory_movements (product_id, country);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_country_type ON public.inventory_movements (country, movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON public.inventory_movements (reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements (created_at DESC);

-- 4. Unified Systemic RLS Policies
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.inventory_movements TO authenticated;

DROP POLICY IF EXISTS "inventory_movements_select_policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_insert_policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_update_policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_delete_policy" ON public.inventory_movements;

CREATE POLICY "inventory_movements_select_policy" ON public.inventory_movements
FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR country::text = public.get_user_country()
);

CREATE POLICY "inventory_movements_insert_policy" ON public.inventory_movements
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (
    country::text = public.get_user_country()
    AND public.get_user_role() IN ('accountant', 'salesperson')
    AND movement_type IN ('SALE', 'SALE_RETURN')
  )
);

CREATE POLICY "inventory_movements_update_policy" ON public.inventory_movements
FOR UPDATE TO authenticated USING ( false );

CREATE POLICY "inventory_movements_delete_policy" ON public.inventory_movements
FOR DELETE TO authenticated USING ( false );

-- 5. Helper Function for Stock Aggregation
CREATE OR REPLACE FUNCTION public.get_product_stock(
  p_product_id UUID,
  p_country public.user_country
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(quantity), 0)
  FROM public.inventory_movements
  WHERE product_id = p_product_id AND country = p_country;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 6. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
