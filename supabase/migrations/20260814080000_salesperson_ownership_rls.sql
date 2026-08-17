-- ==============================================================================
-- MAATWEB Targeted Migration: Salesperson Data Ownership RLS Policy Alignment
-- Target: PostgreSQL 15+ / Supabase
-- Description: Enforces global salesperson ownership rules at database level.
-- ==============================================================================

-- 1. CUSTOMERS TABLE RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND assigned_salesman_id = auth.uid())
);

CREATE POLICY "customers_insert_policy" ON public.customers
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND assigned_salesman_id = auth.uid())
);

CREATE POLICY "customers_update_policy" ON public.customers
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND assigned_salesman_id = auth.uid())
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND assigned_salesman_id = auth.uid())
);

-- 2. QUOTATIONS TABLE RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotations_select_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert_policy" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update_policy" ON public.quotations;

CREATE POLICY "quotations_select_policy" ON public.quotations
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
  )
);

CREATE POLICY "quotations_insert_policy" ON public.quotations
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
);

CREATE POLICY "quotations_update_policy" ON public.quotations
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
);

-- 3. INVOICES TABLE RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
  )
);

CREATE POLICY "invoices_insert_policy" ON public.invoices
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
);

CREATE POLICY "invoices_update_policy" ON public.invoices
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (country = (SELECT country FROM public.get_auth_profile()) AND salesman_id = auth.uid())
);

-- 4. RECEIPTS TABLE RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_policy" ON public.receipts;

CREATE POLICY "receipts_select_policy" ON public.receipts
FOR SELECT TO authenticated USING (
  (is_deleted = false OR (SELECT role FROM public.get_auth_profile()) = 'super_admin') AND (
    (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
    OR (
      country = (SELECT country FROM public.get_auth_profile()) AND (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND c.assigned_salesman_id = auth.uid())
      )
    )
  )
);

CREATE POLICY "receipts_insert_policy" ON public.receipts
FOR INSERT TO authenticated WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country = (SELECT country FROM public.get_auth_profile()) AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND c.assigned_salesman_id = auth.uid())
    )
  )
);

CREATE POLICY "receipts_update_policy" ON public.receipts
FOR UPDATE TO authenticated USING (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country = (SELECT country FROM public.get_auth_profile()) AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND c.assigned_salesman_id = auth.uid())
    )
  )
) WITH CHECK (
  (SELECT role FROM public.get_auth_profile()) IN ('super_admin', 'accountant')
  OR (
    country = (SELECT country FROM public.get_auth_profile()) AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = receipts.invoice_id AND i.salesman_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = receipts.customer_id AND c.assigned_salesman_id = auth.uid())
    )
  )
);
