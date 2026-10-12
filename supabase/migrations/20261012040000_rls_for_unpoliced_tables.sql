-- ==============================================================================
-- RLS policies for tables that had RLS on but no policies left
--
-- PR #4 removed the public (anon) policies. These five tables had no other
-- policy, so only the service-role key could read them and the app showed
-- e.g. 0 stock to signed-in users when the server runs without that key.
--
--   inventory_transactions  read / add rows of the user's own country
--   product_categories      everyone signed in reads; admins add / change
--   settings, document_settings  everyone signed in reads; admins change
--   activity_logs           everyone signed in may add; staff read
--
-- Non-destructive: policies are only created when missing.
-- ==============================================================================

do $$
declare
  is_admin text := 'exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = ''super_admin'' and p.is_active is not false)';
  is_staff text := 'exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in (''super_admin'', ''accountant'') and p.is_active is not false)';
begin
  -- inventory_transactions
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'inventory_transactions_select_own_country') then
    execute 'create policy inventory_transactions_select_own_country on public.inventory_transactions for select to authenticated using (public.is_own_country(country::text))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'inventory_transactions_insert_own_country') then
    execute 'create policy inventory_transactions_insert_own_country on public.inventory_transactions for insert to authenticated with check (public.is_own_country(country::text))';
  end if;

  -- product_categories
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'product_categories_select_authenticated') then
    execute 'create policy product_categories_select_authenticated on public.product_categories for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'product_categories_admin_write') then
    execute format('create policy product_categories_admin_write on public.product_categories for all to authenticated using (%s) with check (%s)', is_admin, is_admin);
  end if;

  -- settings
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'settings_select_authenticated') then
    execute 'create policy settings_select_authenticated on public.settings for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'settings_admin_write') then
    execute format('create policy settings_admin_write on public.settings for all to authenticated using (%s) with check (%s)', is_admin, is_admin);
  end if;

  -- document_settings
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'document_settings_select_authenticated') then
    execute 'create policy document_settings_select_authenticated on public.document_settings for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'document_settings_admin_write') then
    execute format('create policy document_settings_admin_write on public.document_settings for all to authenticated using (%s) with check (%s)', is_admin, is_admin);
  end if;

  -- activity_logs
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'activity_logs_insert_authenticated') then
    execute 'create policy activity_logs_insert_authenticated on public.activity_logs for insert to authenticated with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'activity_logs_select_staff') then
    execute format('create policy activity_logs_select_staff on public.activity_logs for select to authenticated using (%s)', is_staff);
  end if;
end
$$;

grant select, insert on public.inventory_transactions to authenticated;
grant select, insert, update, delete on public.product_categories, public.settings, public.document_settings to authenticated;
grant select, insert on public.activity_logs to authenticated;
revoke all on public.inventory_transactions, public.product_categories, public.settings, public.document_settings, public.activity_logs from anon;
