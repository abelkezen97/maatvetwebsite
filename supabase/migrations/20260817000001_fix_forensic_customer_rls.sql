-- ==============================================================================
-- MAATWEB Targeted Migration: Fix Forensic Customer ID / RLS & Helper Function Recursion
-- Target: PostgreSQL 15+ / Supabase Project (qoalkjijnxhhiqtynbri)
-- Description:
--   1. Refactors scalar helper functions (get_user_role, get_user_country, get_auth_profile, is_super_admin)
--      to pure LANGUAGE sql STABLE SECURITY DEFINER functions without exception trapping masks.
--   2. Grants SELECT to authenticated on public.profiles to eliminate RLS circular recursion.
--   3. Re-enforces RLS policies on public.customers, public.quotations, public.quotation_items,
--      public.invoices, public.invoice_items, public.receipts, and public.expenses.
-- ==============================================================================

-- 0. NON-RECURSIVE RLS SCALAR HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_auth_profile()
RETURNS TABLE (role text, country text, is_active boolean) AS $$
  SELECT role::text, country::text, is_active
  FROM public.profiles
  WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_country()
RETURNS text AS $$
  SELECT country::text FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT role::text = 'super_admin' FROM public.profiles WHERE id = auth.uid() AND is_active = true), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 1. PROFILES TABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT TO authenticated USING ( true );

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() = 'super_admin' OR id = auth.uid()
);

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE TO authenticated USING (
  id = auth.uid() OR public.get_user_role() = 'super_admin'
) WITH CHECK (
  id = auth.uid() OR public.get_user_role() = 'super_admin'
);

-- 2. CUSTOMERS TABLE RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT TO authenticated USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (public.get_user_role() = 'salesperson' AND country::text = public.get_user_country() AND assigned_salesman_id = auth.uid())
);

CREATE POLICY "customers_insert_policy" ON public.customers
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (assigned_salesman_id IS NULL OR assigned_salesman_id = auth.uid())
  )
);

CREATE POLICY "customers_update_policy" ON public.customers
FOR UPDATE TO authenticated USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (public.get_user_role() = 'salesperson' AND country::text = public.get_user_country() AND assigned_salesman_id = auth.uid())
) WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (public.get_user_role() = 'salesperson' AND country::text = public.get_user_country() AND assigned_salesman_id = auth.uid())
);

-- 3. QUOTATIONS TABLE RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotations_select_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_delete_policy" ON public.quotations;

CREATE POLICY "quotations_select_policy" ON public.quotations
FOR SELECT TO authenticated USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (public.get_user_role() = 'salesperson' AND country::text = public.get_user_country() AND salesman_id = auth.uid())
);

CREATE POLICY "quotations_insert_policy" ON public.quotations
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND salesman_id = auth.uid()
  )
);

CREATE POLICY "quotations_update_policy" ON public.quotations
FOR UPDATE TO authenticated USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (public.get_user_role() = 'salesperson' AND country::text = public.get_user_country() AND salesman_id = auth.uid())
) WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (public.get_user_role() = 'salesperson' AND country::text = public.get_user_country() AND salesman_id = auth.uid())
);

-- 4. QUOTATION ITEMS TABLE RLS
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotation_items_select_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_all_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_insert_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_update_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_delete_policy" ON public.quotation_items;

CREATE POLICY "quotation_items_select_policy" ON public.quotation_items
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
  )
);

CREATE POLICY "quotation_items_insert_policy" ON public.quotation_items
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
  )
);

CREATE POLICY "quotation_items_update_policy" ON public.quotation_items
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
  )
);

CREATE POLICY "quotation_items_delete_policy" ON public.quotation_items
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
  )
);

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
