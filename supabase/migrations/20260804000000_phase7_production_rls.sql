-- ==============================================================================
-- MAATWEB Phase 7 Production RLS Migration
-- Complete Authentication, Authorization, Country Governance & Audit Schema
-- ==============================================================================

-- 1. Custom Enum Types
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'accountant', 'salesperson');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Profiles Table (Business Identity linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'salesperson',
  country public.user_country NOT NULL DEFAULT 'UAE',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);

-- 3. Automatic Profile Creation Trigger on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, country, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'salesperson'::public.user_role),
    COALESCE((NEW.raw_user_meta_data->>'country')::public.user_country, 'UAE'::public.user_country),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Administrative Audit Logging Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL REFERENCES public.profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  target_user UUID,
  details JSONB
);

-- 5. Security Invoker Helper for RLS
CREATE OR REPLACE FUNCTION public.get_auth_profile()
RETURNS TABLE (role public.user_role, country public.user_country, is_active boolean) AS $$
  SELECT role, country, is_active
  FROM public.profiles
  WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 6. PRODUCTION ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- 6.1 PROFILES TABLE
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated USING (
  id = auth.uid()
);

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE TO authenticated USING (
  id = auth.uid()
);

-- 6.2 CUSTOMERS TABLE
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

CREATE POLICY "customers_insert_policy" ON public.customers
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

CREATE POLICY "customers_update_policy" ON public.customers
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
) WITH CHECK (
  country = OLD.country -- IMMUTABLE COUNTRY
);

-- 6.3 QUOTATIONS TABLE
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations_select_policy" ON public.quotations
FOR SELECT TO authenticated USING (
  is_deleted = false AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR country = (SELECT country FROM public.get_auth_profile())
  )
);

CREATE POLICY "quotations_insert_policy" ON public.quotations
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

CREATE POLICY "quotations_update_policy" ON public.quotations
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
) WITH CHECK (
  country = OLD.country -- IMMUTABLE COUNTRY
);

-- 6.4 INVOICES TABLE
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_policy" ON public.invoices
FOR SELECT TO authenticated USING (
  is_deleted = false AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR country = (SELECT country FROM public.get_auth_profile())
  )
);

CREATE POLICY "invoices_insert_policy" ON public.invoices
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

CREATE POLICY "invoices_update_policy" ON public.invoices
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
) WITH CHECK (
  country = OLD.country -- IMMUTABLE COUNTRY
);

-- 6.5 RECEIPTS TABLE
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_select_policy" ON public.receipts
FOR SELECT TO authenticated USING (
  is_deleted = false AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR country = (SELECT country FROM public.get_auth_profile())
  )
);

CREATE POLICY "receipts_insert_policy" ON public.receipts
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

CREATE POLICY "receipts_update_policy" ON public.receipts
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
) WITH CHECK (
  country = OLD.country -- IMMUTABLE COUNTRY
);

-- 6.6 PRODUCTS TABLE (Global Master Data)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_global" ON public.products
FOR SELECT TO authenticated USING (true);

CREATE POLICY "products_super_admin_manage" ON public.products
FOR ALL TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);
