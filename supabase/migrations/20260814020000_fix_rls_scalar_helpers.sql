-- ==============================================================================
-- MAATWEB Migration: Scalar Helper Functions & Clean RLS Policies
-- Target: PostgreSQL 15+ / Supabase
-- Description: Replaces table-returning subqueries in RLS policies with STABLE
--              SECURITY DEFINER scalar functions (get_user_role(), get_user_country(),
--              is_super_admin()) to guarantee 100% robust boolean evaluation.
-- ==============================================================================

-- 1. SCALAR SECURITY DEFINER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_country()
RETURNS public.user_country AS $$
DECLARE
  v_country public.user_country;
BEGIN
  SELECT country INTO v_country FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_country;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (public.get_user_role() = 'super_admin'::public.user_role);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. CUSTOMERS RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT TO authenticated USING (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

CREATE POLICY "customers_insert_policy" ON public.customers
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

CREATE POLICY "customers_update_policy" ON public.customers
FOR UPDATE TO authenticated USING (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
) WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

-- 3. QUOTATIONS RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotations_select_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update_policy" ON public.quotations;

CREATE POLICY "quotations_select_policy" ON public.quotations
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
    OR country = public.get_user_country()
  )
);

CREATE POLICY "quotations_insert_policy" ON public.quotations
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

CREATE POLICY "quotations_update_policy" ON public.quotations
FOR UPDATE TO authenticated USING (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
) WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

-- 4. QUOTATION ITEMS RLS
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotation_items_select_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_all_policy" ON public.quotation_items;

CREATE POLICY "quotation_items_select_policy" ON public.quotation_items
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.is_deleted = false OR public.is_super_admin())
      AND (
        public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
        OR q.country = public.get_user_country()
      )
  )
);

CREATE POLICY "quotation_items_all_policy" ON public.quotation_items
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (
        public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
        OR q.country = public.get_user_country()
      )
  )
);

-- 5. INVOICES RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
    OR country = public.get_user_country()
  )
);

CREATE POLICY "invoices_insert_policy" ON public.invoices
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

CREATE POLICY "invoices_update_policy" ON public.invoices
FOR UPDATE TO authenticated USING (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
) WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

-- 6. INVOICE ITEMS RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_all_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND (i.is_deleted = false OR public.is_super_admin())
      AND (
        public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
        OR i.country = public.get_user_country()
      )
  )
);

CREATE POLICY "invoice_items_all_policy" ON public.invoice_items
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND (
        public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
        OR i.country = public.get_user_country()
      )
  )
);

-- 7. RECEIPTS RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_policy" ON public.receipts;

CREATE POLICY "receipts_select_policy" ON public.receipts
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
    OR country = public.get_user_country()
  )
);

CREATE POLICY "receipts_insert_policy" ON public.receipts
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

CREATE POLICY "receipts_update_policy" ON public.receipts
FOR UPDATE TO authenticated USING (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
) WITH CHECK (
  public.get_user_role() IN ('super_admin'::public.user_role, 'accountant'::public.user_role)
  OR country = public.get_user_country()
);

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
