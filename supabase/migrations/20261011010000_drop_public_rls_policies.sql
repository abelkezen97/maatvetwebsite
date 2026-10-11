-- ==============================================================================
-- Remove leftover "allow everyone" RLS policies.
--
-- These policies were created in the dashboard early on and never lived in a
-- migration. Because Postgres ORs permissive policies together, they let
-- signed-out visitors (anon key, which ships in the browser) insert, update
-- and delete customers, and read/write/delete products, quotations and
-- quotation items. They also let signed-in staff bypass their role and
-- country scope.
--
-- The scoped policies for the `authenticated` role on these tables remain.
-- Applied to production by hand in the SQL editor on 2026-10-11; this file
-- keeps the repo in step and is safe to re-run.
-- ==============================================================================

drop policy if exists "Allow deletes" on public.customers;
drop policy if exists "Allow inserts" on public.customers;
drop policy if exists "Allow updates" on public.customers;
drop policy if exists "Allow public all access to products" on public.products;
drop policy if exists "Allow public read access to products" on public.products;
drop policy if exists "Allow public all access to quotations" on public.quotations;
drop policy if exists "Allow public read access to quotations" on public.quotations;
drop policy if exists "Allow public all access to quotation_items" on public.quotation_items;
drop policy if exists "Allow public read access to quotation_items" on public.quotation_items;

NOTIFY pgrst, 'reload schema';
