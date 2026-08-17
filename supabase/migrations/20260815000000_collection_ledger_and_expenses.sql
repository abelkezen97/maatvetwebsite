-- ==============================================================================
-- MAATWEB Targeted Migration: Module 6 - Collection Ledger & Expenses Schema
-- Target: PostgreSQL 15+ / Supabase (Project Ref: qoalkjijnxhhiqtynbri)
-- Description: Safe upgrade of public.expenses, public.cash_handovers,
--              public.salesperson_opening_balances, RLS policies,
--              helper functions, and schema cache reload.
-- ==============================================================================

-- 0. HELPER FUNCTIONS FOR RLS (Non-recursive profile inspection using text types for robust safety)
DROP FUNCTION IF EXISTS public.get_auth_profile() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_country() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;

CREATE OR REPLACE FUNCTION public.get_auth_profile()
RETURNS TABLE (role text, country text, is_active boolean) AS $$
  SELECT role::text, country::text, is_active
  FROM public.profiles
  WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_country()
RETURNS text AS $$
DECLARE
  v_country text;
BEGIN
  SELECT country::text INTO v_country FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_country;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (public.get_user_role() = 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 1. Upgrade public.expenses table with missing columns safely
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS expense_number TEXT,
  ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash',
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS country public.user_country DEFAULT 'UAE',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill existing legacy rows without dropping or data loss
UPDATE public.expenses 
SET 
  salesperson_id = COALESCE(salesperson_id, employee_id),
  attachment_url = COALESCE(attachment_url, receipt_url),
  payment_method = COALESCE(payment_method, 'Cash'),
  country = COALESCE(country, 'UAE'::public.user_country),
  expense_number = COALESCE(expense_number, 'EXP-' || SUBSTRING(id::text, 1, 8)),
  is_deleted = COALESCE(is_deleted, false)
WHERE salesperson_id IS NULL OR expense_number IS NULL OR payment_method IS NULL;

-- Enforce NOT NULL constraints on canonical columns
ALTER TABLE public.expenses 
  ALTER COLUMN expense_number SET NOT NULL,
  ALTER COLUMN payment_method SET NOT NULL,
  ALTER COLUMN country SET NOT NULL,
  ALTER COLUMN is_deleted SET NOT NULL;

-- Add check constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category IN ('Petrol', 'Food', 'Rent', 'Travel', 'Vehicle', 'Accommodation', 'Office', 'Miscellaneous', 'Other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_method_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check CHECK (payment_method IN ('Cash', 'Company Card', 'Personal Card', 'Bank Transfer', 'Other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_status_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_status_check CHECK (status IN ('Pending', 'Approved', 'Rejected'));
  END IF;
END $$;

-- 2. CASH HANDOVERS TABLE
CREATE TABLE IF NOT EXISTS public.cash_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_number TEXT NOT NULL UNIQUE,
  handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  received_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference_number TEXT,
  notes TEXT,
  country public.user_country NOT NULL DEFAULT 'UAE',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),

  -- Audit & Lifecycle
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SALESPERSON OPENING BALANCES TABLE
CREATE TABLE IF NOT EXISTS public.salesperson_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  country public.user_country NOT NULL DEFAULT 'UAE',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_salesperson_opening_date UNIQUE (salesperson_id, effective_date)
);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_opening_balances ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.expenses TO authenticated;
GRANT ALL ON public.cash_handovers TO authenticated;
GRANT ALL ON public.salesperson_opening_balances TO authenticated;

-- 4.1 EXPENSES RLS
DROP POLICY IF EXISTS "expenses_select_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_policy" ON public.expenses;

CREATE POLICY "expenses_select_policy" ON public.expenses
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR (country::text = (SELECT country FROM public.get_auth_profile()) AND (salesperson_id = auth.uid() OR created_by = auth.uid() OR employee_id = auth.uid()))
  )
);

CREATE POLICY "expenses_insert_policy" ON public.expenses
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country::text = (SELECT country FROM public.get_auth_profile()) AND (salesperson_id = auth.uid() OR created_by = auth.uid() OR employee_id = auth.uid()))
);

CREATE POLICY "expenses_update_policy" ON public.expenses
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country::text = (SELECT country FROM public.get_auth_profile()) 
    AND (salesperson_id = auth.uid() OR created_by = auth.uid() OR employee_id = auth.uid()) 
    AND status = 'Pending'
  )
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country::text = (SELECT country FROM public.get_auth_profile()) 
    AND (salesperson_id = auth.uid() OR created_by = auth.uid() OR employee_id = auth.uid()) 
    AND status = 'Pending'
  )
);

CREATE POLICY "expenses_delete_policy" ON public.expenses
FOR DELETE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);

-- 4.2 CASH HANDOVERS RLS
DROP POLICY IF EXISTS "cash_handovers_select_policy" ON public.cash_handovers;
DROP POLICY IF EXISTS "cash_handovers_insert_policy" ON public.cash_handovers;
DROP POLICY IF EXISTS "cash_handovers_update_policy" ON public.cash_handovers;
DROP POLICY IF EXISTS "cash_handovers_delete_policy" ON public.cash_handovers;

CREATE POLICY "cash_handovers_select_policy" ON public.cash_handovers
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR (country::text = (SELECT country FROM public.get_auth_profile()) AND (salesperson_id = auth.uid() OR received_by = auth.uid() OR created_by = auth.uid()))
  )
);

CREATE POLICY "cash_handovers_insert_policy" ON public.cash_handovers
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country::text = (SELECT country FROM public.get_auth_profile()) AND (salesperson_id = auth.uid() OR created_by = auth.uid()))
);

CREATE POLICY "cash_handovers_update_policy" ON public.cash_handovers
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country::text = (SELECT country FROM public.get_auth_profile()) 
    AND (salesperson_id = auth.uid() OR created_by = auth.uid()) 
    AND status = 'Pending'
  )
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country::text = (SELECT country FROM public.get_auth_profile()) 
    AND (salesperson_id = auth.uid() OR created_by = auth.uid()) 
    AND status = 'Pending'
  )
);

CREATE POLICY "cash_handovers_delete_policy" ON public.cash_handovers
FOR DELETE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);

-- 4.3 OPENING BALANCES RLS
DROP POLICY IF EXISTS "opening_balances_select_policy" ON public.salesperson_opening_balances;
DROP POLICY IF EXISTS "opening_balances_manage_policy" ON public.salesperson_opening_balances;

CREATE POLICY "opening_balances_select_policy" ON public.salesperson_opening_balances
FOR SELECT TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country::text = (SELECT country FROM public.get_auth_profile()) AND salesperson_id = auth.uid())
);

CREATE POLICY "opening_balances_manage_policy" ON public.salesperson_opening_balances
FOR ALL TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
);

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
