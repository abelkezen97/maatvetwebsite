-- ==============================================================================
-- MAATWEB Targeted Migration: Complete Row Level Security (RLS) & Country Governance
-- Target: PostgreSQL 15+ / Supabase
-- Description: Idempotent migration setting up complete, non-recursive RLS policies
--              across profiles, customers, products, product_categories, quotations,
--              quotation_items, invoices, invoice_items, receipts, settings, document_settings.
-- ==============================================================================

-- 1. SECURITY DEFINER HELPER FUNCTION (Non-recursive profile inspection)
CREATE OR REPLACE FUNCTION public.get_auth_profile()
RETURNS TABLE (role public.user_role, country public.user_country, is_active boolean) AS $$
  SELECT role, country, is_active
  FROM public.profiles
  WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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

-- ------------------------------------------------------------------------------
-- 2. PROFILES TABLE RLS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. CUSTOMERS TABLE RLS (Country Scoped)
-- ------------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

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
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

-- ------------------------------------------------------------------------------
-- 4. PRODUCTS & CATEGORIES RLS (Global Master Data)
-- ------------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_global" ON public.products;
DROP POLICY IF EXISTS "products_super_admin_manage" ON public.products;

CREATE POLICY "products_select_global" ON public.products
FOR SELECT TO authenticated USING (true);

CREATE POLICY "products_super_admin_manage" ON public.products
FOR ALL TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_categories_select_global" ON public.product_categories;
DROP POLICY IF EXISTS "product_categories_super_admin_manage" ON public.product_categories;

CREATE POLICY "product_categories_select_global" ON public.product_categories
FOR SELECT TO authenticated USING (true);

CREATE POLICY "product_categories_super_admin_manage" ON public.product_categories
FOR ALL TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);

-- ------------------------------------------------------------------------------
-- 5. QUOTATIONS TABLE RLS (Country Scoped)
-- ------------------------------------------------------------------------------
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotations_select_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_delete_policy" ON public.quotations;

CREATE POLICY "quotations_select_policy" ON public.quotations
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
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
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

-- ------------------------------------------------------------------------------
-- 6. QUOTATION ITEMS TABLE RLS (Parent Scoped)
-- ------------------------------------------------------------------------------
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotation_items_select_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_all_policy" ON public.quotation_items;

CREATE POLICY "quotation_items_select_policy" ON public.quotation_items
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (q.is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin')
      AND (
        (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
        OR q.country = (SELECT country FROM public.get_auth_profile())
      )
  )
);

CREATE POLICY "quotation_items_all_policy" ON public.quotation_items
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (
        (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
        OR q.country = (SELECT country FROM public.get_auth_profile())
      )
  )
);

-- ------------------------------------------------------------------------------
-- 7. INVOICES TABLE RLS (Country Scoped)
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
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
  OR country = (SELECT country FROM public.get_auth_profile())
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

-- ------------------------------------------------------------------------------
-- 8. INVOICE ITEMS TABLE RLS (Parent Scoped)
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_all_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND (i.is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin')
      AND (
        (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
        OR i.country = (SELECT country FROM public.get_auth_profile())
      )
  )
);

CREATE POLICY "invoice_items_all_policy" ON public.invoice_items
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND (
        (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
        OR i.country = (SELECT country FROM public.get_auth_profile())
      )
  )
);

-- ------------------------------------------------------------------------------
-- 9. RECEIPTS TABLE RLS (Country Scoped)
-- ------------------------------------------------------------------------------
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_delete_policy" ON public.receipts;

CREATE POLICY "receipts_select_policy" ON public.receipts
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
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
  OR country = (SELECT country FROM public.get_auth_profile())
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR country = (SELECT country FROM public.get_auth_profile())
);

-- ------------------------------------------------------------------------------
-- 10. SETTINGS & DOCUMENT SETTINGS RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_global" ON public.settings;
DROP POLICY IF EXISTS "settings_super_admin_manage" ON public.settings;

CREATE POLICY "settings_select_global" ON public.settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings_super_admin_manage" ON public.settings
FOR ALL TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);

ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_settings_select_global" ON public.document_settings;
DROP POLICY IF EXISTS "document_settings_super_admin_manage" ON public.document_settings;

CREATE POLICY "document_settings_select_global" ON public.document_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "document_settings_super_admin_manage" ON public.document_settings
FOR ALL TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) = 'super_admin'
);
