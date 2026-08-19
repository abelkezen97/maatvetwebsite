-- ==============================================================================
-- MAATWEB Combined Remote Migration for Supabase Project: qoalkjijnxhhiqtynbri
-- Target: Supabase Dashboard -> SQL Editor -> Run
-- Description: 1. Idempotently creates custom enum types public.user_role and public.user_country.
--              2. Adds missing canonical columns (country, issue_date, status, audit, soft-delete)
--                 to public.invoices, public.quotations, and public.receipts.
--              3. Adds Foreign Key (with ON DELETE RESTRICT on receipts.customer_id) and Status Check constraints.
--              4. Installs STABLE SECURITY DEFINER scalar helper functions with explicit type casting.
--              5. Drops old policies and installs scalar RLS policies across profiles, customers, quotations,
--                 quotation_items, invoices, invoice_items, and receipts with type-safe text casts.
--              6. Installs admin_create_user RPC function for Super Admin user creation.
--              7. Issues NOTIFY pgrst, 'reload schema' to force immediate PostgREST cache refresh.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: CUSTOM ENUM TYPES & SCHEMA ALIGNMENT
-- ------------------------------------------------------------------------------

-- 1.1 Create public.user_role ENUM (BEFORE any function or policy references it)
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'accountant', 'salesperson');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1.2 Create public.user_country ENUM (BEFORE any table or policy references it)
DO $$ BEGIN
  CREATE TYPE public.user_country AS ENUM ('UAE', 'Oman');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- QUOTATIONS TABLE
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

-- INVOICES TABLE
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

-- RECEIPTS TABLE
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------------------------
-- PART 2: FOREIGN KEY CONSTRAINTS
-- ------------------------------------------------------------------------------
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

  -- Receipts FKs (customer_id is NOT NULL so ON DELETE RESTRICT is enforced)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_customer') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT fk_receipts_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
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

-- STATUS CHECK CONSTRAINTS
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
-- PART 3: SCALAR SECURITY DEFINER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role::public.user_role INTO v_role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_country()
RETURNS public.user_country AS $$
DECLARE
  v_country public.user_country;
BEGIN
  SELECT country::public.user_country INTO v_country FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_country;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (public.get_user_role()::text = 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- PART 4: SCALAR RLS POLICIES ACROSS ALL TABLES (DROPS OLD POLICIES FIRST)
-- ------------------------------------------------------------------------------

-- PROFILES RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT TO authenticated USING (
  id = auth.uid() OR public.get_user_role()::text IN ('super_admin', 'accountant')
);
CREATE POLICY "profiles_insert_policy" ON public.profiles FOR INSERT TO authenticated WITH CHECK (
  id = auth.uid() OR public.get_user_role()::text = 'super_admin'
);
CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE TO authenticated USING (
  id = auth.uid() OR public.get_user_role()::text = 'super_admin'
) WITH CHECK (
  id = auth.uid() OR public.get_user_role()::text = 'super_admin'
);

-- CUSTOMERS RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers FOR SELECT TO authenticated USING (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);
CREATE POLICY "customers_insert_policy" ON public.customers FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);
CREATE POLICY "customers_update_policy" ON public.customers FOR UPDATE TO authenticated USING (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
) WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);

-- QUOTATIONS RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotations_select_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update_policy" ON public.quotations;

CREATE POLICY "quotations_select_policy" ON public.quotations FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.get_user_role()::text IN ('super_admin', 'accountant')
    OR country::text = public.get_user_country()::text
  )
);
CREATE POLICY "quotations_insert_policy" ON public.quotations FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);
CREATE POLICY "quotations_update_policy" ON public.quotations FOR UPDATE TO authenticated USING (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
) WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);

-- QUOTATION ITEMS RLS
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotation_items_select_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_all_policy" ON public.quotation_items;

CREATE POLICY "quotation_items_select_policy" ON public.quotation_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id AND (q.is_deleted = false OR public.is_super_admin())
      AND (public.get_user_role()::text IN ('super_admin', 'accountant') OR q.country::text = public.get_user_country()::text)
  )
);
CREATE POLICY "quotation_items_all_policy" ON public.quotation_items FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (public.get_user_role()::text IN ('super_admin', 'accountant') OR q.country::text = public.get_user_country()::text)
  )
);

-- INVOICES RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.get_user_role()::text IN ('super_admin', 'accountant')
    OR country::text = public.get_user_country()::text
  )
);
CREATE POLICY "invoices_insert_policy" ON public.invoices FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);
CREATE POLICY "invoices_update_policy" ON public.invoices FOR UPDATE TO authenticated USING (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
) WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);

-- INVOICE ITEMS RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_all_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id AND (i.is_deleted = false OR public.is_super_admin())
      AND (public.get_user_role()::text IN ('super_admin', 'accountant') OR i.country::text = public.get_user_country()::text)
  )
);
CREATE POLICY "invoice_items_all_policy" ON public.invoice_items FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND (public.get_user_role()::text IN ('super_admin', 'accountant') OR i.country::text = public.get_user_country()::text)
  )
);

-- RECEIPTS RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "receipts_select_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_policy" ON public.receipts;

CREATE POLICY "receipts_select_policy" ON public.receipts FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.get_user_role()::text IN ('super_admin', 'accountant')
    OR country::text = public.get_user_country()::text
  )
);
CREATE POLICY "receipts_insert_policy" ON public.receipts FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);
CREATE POLICY "receipts_update_policy" ON public.receipts FOR UPDATE TO authenticated USING (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
) WITH CHECK (
  public.get_user_role()::text IN ('super_admin', 'accountant')
  OR country::text = public.get_user_country()::text
);

-- ------------------------------------------------------------------------------
-- PART 5: SUPER ADMIN USER CREATION RPC FUNCTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_country TEXT,
  p_email TEXT,
  p_full_name TEXT,
  p_password TEXT,
  p_phone TEXT DEFAULT '',
  p_role TEXT DEFAULT 'salesperson'
) RETURNS jsonb AS $$
DECLARE
  v_caller_role public.user_role;
  v_new_id UUID;
  v_encrypted_password TEXT;
  v_typed_role public.user_role;
  v_typed_country public.user_country;
  v_res jsonb;
BEGIN
  -- 1. Validate caller is super_admin
  SELECT role::public.user_role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin'::public.user_role THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admin can create accounts.';
  END IF;

  -- 2. Validate and cast text parameters to canonical enums
  IF lower(p_role) NOT IN ('super_admin', 'accountant', 'salesperson') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  
  IF p_country NOT IN ('UAE', 'Oman') THEN
    RAISE EXCEPTION 'Invalid country: %', p_country;
  END IF;

  v_typed_role := lower(p_role)::public.user_role;
  v_typed_country := p_country::public.user_country;

  -- 3. Check for duplicate email in auth.users or profiles
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) OR
     EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'An account with this email already exists.';
  END IF;

  v_new_id := gen_random_uuid();
  v_encrypted_password := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- 4. Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_password,
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', v_typed_role, 'country', v_typed_country),
    NOW(),
    NOW()
  );

  -- 5. Create Profile
  INSERT INTO public.profiles (
    id, full_name, email, phone, role, country, is_active, created_at, updated_at
  ) VALUES (
    v_new_id, p_full_name, p_email, COALESCE(p_phone, ''), v_typed_role, v_typed_country, true, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    country = EXCLUDED.country,
    is_active = true,
    updated_at = NOW();

  SELECT jsonb_build_object(
    'id', id,
    'full_name', full_name,
    'email', email,
    'phone', phone,
    'role', role,
    'country', country,
    'is_active', is_active
  ) INTO v_res
  FROM public.profiles
  WHERE id = v_new_id;

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text) FROM anon, public;

-- ------------------------------------------------------------------------------
-- PART 7: INVENTORY TRANSACTION COUNTRY SEPARATION & RLS GOVERNANCE
-- ------------------------------------------------------------------------------

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

ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS country public.user_country NOT NULL DEFAULT 'UAE';
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_prod_country ON public.inventory_transactions (product_id, country);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_country_type ON public.inventory_transactions (country, transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_ref ON public.inventory_transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_created_at ON public.inventory_transactions (created_at DESC);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.inventory_transactions TO authenticated, anon, service_role, postgres;

DROP POLICY IF EXISTS "inventory_tx_select_policy" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_tx_insert_policy" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_tx_update_policy" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_tx_delete_policy" ON public.inventory_transactions;

CREATE POLICY "inventory_tx_select_policy" ON public.inventory_transactions
FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR public.get_user_role()::text = 'accountant'
  OR country::text = public.get_user_country()::text
);

CREATE POLICY "inventory_tx_insert_policy" ON public.inventory_transactions
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (
    country::text = public.get_user_country()::text
    AND (
      public.get_user_role()::text = 'accountant'
      OR (public.get_user_role()::text = 'salesperson' AND transaction_type IN ('SALE', 'SALE_RETURN'))
    )
  )
);

CREATE POLICY "inventory_tx_update_policy" ON public.inventory_transactions FOR UPDATE TO authenticated USING ( false );
CREATE POLICY "inventory_tx_delete_policy" ON public.inventory_transactions FOR DELETE TO authenticated USING ( false );

CREATE OR REPLACE FUNCTION public.get_product_stock(
  p_product_id UUID,
  p_country public.user_country
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(quantity), 0)
  FROM public.inventory_transactions
  WHERE product_id = p_product_id AND country = p_country;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
