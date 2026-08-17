-- ==============================================================================
-- MAATWEB Consolidated Systemic RLS Architecture Migration
-- Target: PostgreSQL 15+ / Supabase (Project Ref: qoalkjijnxhhiqtynbri)
-- Description: Single unified migration standardizing non-recursive helper
--              functions and RLS policies across all 11 business tables.
-- ==============================================================================

-- 0. NON-RECURSIVE RLS SCALAR HELPER FUNCTIONS
-- Use pure SQL, SECURITY DEFINER, search_path = public to avoid PL/pgSQL exception masking or RLS recursion

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
GRANT ALL ON public.profiles TO authenticated;

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
  public.is_super_admin() OR id = auth.uid()
);

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE TO authenticated USING (
  id = auth.uid() OR public.is_super_admin()
) WITH CHECK (
  id = auth.uid() OR public.is_super_admin()
);

-- 2. CUSTOMERS TABLE RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.customers TO authenticated;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (assigned_salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "customers_insert_policy" ON public.customers
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (assigned_salesman_id IS NULL OR assigned_salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "customers_update_policy" ON public.customers
FOR UPDATE TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (assigned_salesman_id = auth.uid() OR created_by = auth.uid())
  )
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (assigned_salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "customers_delete_policy" ON public.customers
FOR DELETE TO authenticated USING (
  public.is_super_admin()
);

-- 3. QUOTATIONS TABLE RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.quotations TO authenticated;

DROP POLICY IF EXISTS "quotations_select_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_delete_policy" ON public.quotations;

CREATE POLICY "quotations_select_policy" ON public.quotations
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.is_super_admin()
    OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
    OR (
      public.get_user_role() = 'salesperson'
      AND country::text = public.get_user_country()
      AND (salesman_id = auth.uid() OR created_by = auth.uid())
    )
  )
);

CREATE POLICY "quotations_insert_policy" ON public.quotations
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "quotations_update_policy" ON public.quotations
FOR UPDATE TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (salesman_id = auth.uid() OR created_by = auth.uid())
  )
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "quotations_delete_policy" ON public.quotations
FOR DELETE TO authenticated USING (
  public.is_super_admin()
);

-- 4. QUOTATION ITEMS TABLE RLS
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.quotation_items TO authenticated;

DROP POLICY IF EXISTS "quotation_items_select_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_all_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_insert_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_update_policy" ON public.quotation_items;
DROP POLICY IF EXISTS "quotation_items_delete_policy" ON public.quotation_items;

CREATE POLICY "quotation_items_select_policy" ON public.quotation_items
FOR SELECT TO authenticated USING ( true );

CREATE POLICY "quotation_items_insert_policy" ON public.quotation_items
FOR INSERT TO authenticated WITH CHECK ( true );

CREATE POLICY "quotation_items_update_policy" ON public.quotation_items
FOR UPDATE TO authenticated USING ( true ) WITH CHECK ( true );

CREATE POLICY "quotation_items_delete_policy" ON public.quotation_items
FOR DELETE TO authenticated USING ( true );

-- 5. INVOICES TABLE RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.invoices TO authenticated;

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.is_super_admin()
    OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
    OR (
      public.get_user_role() = 'salesperson'
      AND country::text = public.get_user_country()
      AND (salesman_id = auth.uid() OR created_by = auth.uid())
    )
  )
);

CREATE POLICY "invoices_insert_policy" ON public.invoices
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "invoices_update_policy" ON public.invoices
FOR UPDATE TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (salesman_id = auth.uid() OR created_by = auth.uid())
  )
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    public.get_user_role() = 'salesperson'
    AND country::text = public.get_user_country()
    AND (salesman_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "invoices_delete_policy" ON public.invoices
FOR DELETE TO authenticated USING (
  public.is_super_admin()
);

-- 6. INVOICE ITEMS TABLE RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.invoice_items TO authenticated;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT TO authenticated USING ( true );

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT TO authenticated WITH CHECK ( true );

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE TO authenticated USING ( true ) WITH CHECK ( true );

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE TO authenticated USING ( true );

-- 7. RECEIPTS TABLE RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.receipts TO authenticated;

DROP POLICY IF EXISTS "receipts_select_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_delete_policy" ON public.receipts;

CREATE POLICY "receipts_select_policy" ON public.receipts
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.is_super_admin()
    OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
    OR (
      country::text = public.get_user_country() AND (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND (c.assigned_salesman_id = auth.uid() OR c.created_by = auth.uid()))
      )
    )
  )
);

CREATE POLICY "receipts_insert_policy" ON public.receipts
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country() AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND (c.assigned_salesman_id = auth.uid() OR c.created_by = auth.uid()))
    )
  )
);

CREATE POLICY "receipts_update_policy" ON public.receipts
FOR UPDATE TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country() AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND (c.assigned_salesman_id = auth.uid() OR c.created_by = auth.uid()))
    )
  )
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country() AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND (c.assigned_salesman_id = auth.uid() OR c.created_by = auth.uid()))
    )
  )
);

CREATE POLICY "receipts_delete_policy" ON public.receipts
FOR DELETE TO authenticated USING (
  public.is_super_admin()
);

-- 8. EXPENSES TABLE RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.expenses TO authenticated;

DROP POLICY IF EXISTS "expenses_select_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_policy" ON public.expenses;

CREATE POLICY "expenses_select_policy" ON public.expenses
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.is_super_admin()
    OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
    OR (
      country::text = public.get_user_country()
      AND (salesperson_id = auth.uid() OR created_by = auth.uid())
    )
  )
);

CREATE POLICY "expenses_insert_policy" ON public.expenses
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country()
    AND (salesperson_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "expenses_update_policy" ON public.expenses
FOR UPDATE TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country()
    AND (salesperson_id = auth.uid() OR created_by = auth.uid())
    AND status = 'Pending'
  )
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country()
    AND (salesperson_id = auth.uid() OR created_by = auth.uid())
    AND status = 'Pending'
  )
);

CREATE POLICY "expenses_delete_policy" ON public.expenses
FOR DELETE TO authenticated USING (
  public.is_super_admin()
);

-- 9. CASH HANDOVERS TABLE RLS
ALTER TABLE public.cash_handovers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cash_handovers TO authenticated;

DROP POLICY IF EXISTS "cash_handovers_select_policy" ON public.cash_handovers;
DROP POLICY IF EXISTS "cash_handovers_insert_policy" ON public.cash_handovers;
DROP POLICY IF EXISTS "cash_handovers_update_policy" ON public.cash_handovers;
DROP POLICY IF EXISTS "cash_handovers_delete_policy" ON public.cash_handovers;

CREATE POLICY "cash_handovers_select_policy" ON public.cash_handovers
FOR SELECT TO authenticated USING (
  (is_deleted = false OR public.is_super_admin()) AND (
    public.is_super_admin()
    OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
    OR (
      country::text = public.get_user_country()
      AND (salesperson_id = auth.uid() OR received_by = auth.uid() OR created_by = auth.uid())
    )
  )
);

CREATE POLICY "cash_handovers_insert_policy" ON public.cash_handovers
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country()
    AND (salesperson_id = auth.uid() OR created_by = auth.uid())
  )
);

CREATE POLICY "cash_handovers_update_policy" ON public.cash_handovers
FOR UPDATE TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country()
    AND (salesperson_id = auth.uid() OR created_by = auth.uid())
    AND status = 'Pending'
  )
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (
    country::text = public.get_user_country()
    AND (salesperson_id = auth.uid() OR created_by = auth.uid())
    AND status = 'Pending'
  )
);

CREATE POLICY "cash_handovers_delete_policy" ON public.cash_handovers
FOR DELETE TO authenticated USING (
  public.is_super_admin()
);

-- 10. SALESPERSON OPENING BALANCES TABLE RLS
ALTER TABLE public.salesperson_opening_balances ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.salesperson_opening_balances TO authenticated;

DROP POLICY IF EXISTS "opening_balances_select_policy" ON public.salesperson_opening_balances;
DROP POLICY IF EXISTS "opening_balances_manage_policy" ON public.salesperson_opening_balances;

CREATE POLICY "opening_balances_select_policy" ON public.salesperson_opening_balances
FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
  OR (country::text = public.get_user_country() AND salesperson_id = auth.uid())
);

CREATE POLICY "opening_balances_manage_policy" ON public.salesperson_opening_balances
FOR ALL TO authenticated USING (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
) WITH CHECK (
  public.is_super_admin()
  OR (public.get_user_role() = 'accountant' AND country::text = public.get_user_country())
);

-- 11. PRODUCTS TABLE RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.products TO authenticated;

DROP POLICY IF EXISTS "products_select_policy" ON public.products;
DROP POLICY IF EXISTS "products_manage_policy" ON public.products;

CREATE POLICY "products_select_policy" ON public.products
FOR SELECT TO authenticated USING ( true );

CREATE POLICY "products_manage_policy" ON public.products
FOR ALL TO authenticated USING (
  public.is_super_admin()
  OR public.get_user_role() = 'accountant'
) WITH CHECK (
  public.is_super_admin()
  OR public.get_user_role() = 'accountant'
);

-- RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
