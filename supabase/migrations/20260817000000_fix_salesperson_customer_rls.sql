-- ==============================================================================
-- MAATWEB Targeted Migration: Fix Salesperson Customer Creation RLS & Ownership
-- Target: PostgreSQL 15+ / Supabase Project (qoalkjijnxhhiqtynbri)
-- Description: Enforces global salesperson customer ownership rules at database level.
--              1. RLS Policies (SELECT, INSERT, UPDATE) for public.customers.
--              2. Foreign Key constraints for profiles relationships.
-- ==============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

-- 1. SELECT POLICY
CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT TO authenticated USING (
  public.get_user_role()::text = 'super_admin'
  OR (public.get_user_role()::text = 'accountant' AND country::text = public.get_user_country()::text)
  OR (public.get_user_role()::text = 'salesperson' AND country::text = public.get_user_country()::text AND assigned_salesman_id = auth.uid())
);

-- 2. INSERT POLICY
CREATE POLICY "customers_insert_policy" ON public.customers
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role()::text = 'super_admin'
  OR (public.get_user_role()::text = 'accountant' AND country::text = public.get_user_country()::text)
  OR (
    public.get_user_role()::text = 'salesperson'
    AND country::text = public.get_user_country()::text
    AND assigned_salesman_id = auth.uid()
    AND created_by = auth.uid()
  )
);

-- 3. UPDATE POLICY
CREATE POLICY "customers_update_policy" ON public.customers
FOR UPDATE TO authenticated USING (
  public.get_user_role()::text = 'super_admin'
  OR (public.get_user_role()::text = 'accountant' AND country::text = public.get_user_country()::text)
  OR (public.get_user_role()::text = 'salesperson' AND country::text = public.get_user_country()::text AND assigned_salesman_id = auth.uid())
) WITH CHECK (
  public.get_user_role()::text = 'super_admin'
  OR (public.get_user_role()::text = 'accountant' AND country::text = public.get_user_country()::text)
  OR (public.get_user_role()::text = 'salesperson' AND country::text = public.get_user_country()::text AND assigned_salesman_id = auth.uid())
);

-- 4. FOREIGN KEY CONSTRAINTS
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

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
