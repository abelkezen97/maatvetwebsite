-- ==============================================================================
-- Country-scoped administration (UAE admin, Oman admin, no global owner)
--
-- 1. Helpers: is_country_staff(country) / is_country_admin(country)
-- 2. Every business-table policy rewritten so the admin role (stored as
--    'super_admin') only reaches rows of its own country, like accountants.
-- 3. invoice_items / quotation_items scoped through their parent document
--    (they were open to every signed-in user).
-- 4. profiles: users may edit their own name/phone but never their own role,
--    country or active flag; admins manage users of their own country only.
-- 5. Per-country prices on products (existing columns = UAE / AED,
--    new *_omr columns = Oman / OMR), guarded by a trigger.
-- 6. admin_audit_logs table (the app writes to it; it was missing).
-- 7. get_all_profiles_for_admin scoped to the caller's country;
--    unused admin_create_user RPC removed.
--
-- Contains DROP POLICY statements: run in the SQL editor, as one script.
-- ==============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_country_staff(row_country text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text in ('super_admin', 'accountant')
      and p.country::text = row_country
  );
$$;

create or replace function public.is_country_admin(row_country text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text = 'super_admin'
      and p.country::text = row_country
  );
$$;

revoke execute on function public.is_country_staff(text) from anon, public;
revoke execute on function public.is_country_admin(text) from anon, public;
grant execute on function public.is_country_staff(text) to authenticated;
grant execute on function public.is_country_admin(text) to authenticated;

-- A salesperson's own-country check, used below
create or replace function public.is_own_country(row_country text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.country::text = row_country
  );
$$;
revoke execute on function public.is_own_country(text) from anon, public;
grant execute on function public.is_own_country(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Business tables
-- ---------------------------------------------------------------------------

-- customers -----------------------------------------------------------------
drop policy if exists customers_select_policy on public.customers;
drop policy if exists customers_insert_policy on public.customers;
drop policy if exists customers_update_policy on public.customers;
drop policy if exists customers_delete_policy on public.customers;

create policy customers_select_policy on public.customers for select to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (assigned_salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy customers_insert_policy on public.customers for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (assigned_salesman_id is null or assigned_salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy customers_update_policy on public.customers for update to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (assigned_salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  )
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (assigned_salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy customers_delete_policy on public.customers for delete to authenticated
  using (public.is_country_admin(country::text));

-- quotations ----------------------------------------------------------------
drop policy if exists quotations_select_policy on public.quotations;
drop policy if exists quotations_insert_policy on public.quotations;
drop policy if exists quotations_update_policy on public.quotations;
drop policy if exists quotations_delete_policy on public.quotations;

create policy quotations_select_policy on public.quotations for select to authenticated
  using (
    (is_deleted = false or public.is_country_admin(country::text))
    and (public.is_country_staff(country::text)
         or (public.is_own_country(country::text)
             and (salesman_id = (select auth.uid()) or created_by = (select auth.uid()))))
  );
create policy quotations_insert_policy on public.quotations for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy quotations_update_policy on public.quotations for update to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  )
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy quotations_delete_policy on public.quotations for delete to authenticated
  using (public.is_country_admin(country::text));

-- invoices ------------------------------------------------------------------
drop policy if exists invoices_select_policy on public.invoices;
drop policy if exists invoices_insert_policy on public.invoices;
drop policy if exists invoices_update_policy on public.invoices;
drop policy if exists invoices_delete_policy on public.invoices;

create policy invoices_select_policy on public.invoices for select to authenticated
  using (
    (is_deleted = false or public.is_country_admin(country::text))
    and (public.is_country_staff(country::text)
         or (public.is_own_country(country::text)
             and (salesman_id = (select auth.uid()) or created_by = (select auth.uid()))))
  );
create policy invoices_insert_policy on public.invoices for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy invoices_update_policy on public.invoices for update to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  )
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy invoices_delete_policy on public.invoices for delete to authenticated
  using (public.is_country_admin(country::text));

-- line items follow their parent document's visibility ----------------------
drop policy if exists quotation_items_select_policy on public.quotation_items;
drop policy if exists quotation_items_insert_policy on public.quotation_items;
drop policy if exists quotation_items_update_policy on public.quotation_items;
drop policy if exists quotation_items_delete_policy on public.quotation_items;

create policy quotation_items_select_policy on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id));
create policy quotation_items_insert_policy on public.quotation_items for insert to authenticated
  with check (exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id));
create policy quotation_items_update_policy on public.quotation_items for update to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id))
  with check (exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id));
create policy quotation_items_delete_policy on public.quotation_items for delete to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id));

drop policy if exists invoice_items_select_policy on public.invoice_items;
drop policy if exists invoice_items_insert_policy on public.invoice_items;
drop policy if exists invoice_items_update_policy on public.invoice_items;
drop policy if exists invoice_items_delete_policy on public.invoice_items;

create policy invoice_items_select_policy on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id));
create policy invoice_items_insert_policy on public.invoice_items for insert to authenticated
  with check (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id));
create policy invoice_items_update_policy on public.invoice_items for update to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id))
  with check (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id));
create policy invoice_items_delete_policy on public.invoice_items for delete to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id));

-- receipts ------------------------------------------------------------------
drop policy if exists receipts_select_policy on public.receipts;
drop policy if exists receipts_insert_policy on public.receipts;
drop policy if exists receipts_update_policy on public.receipts;
drop policy if exists receipts_delete_policy on public.receipts;

create policy receipts_select_policy on public.receipts for select to authenticated
  using (
    (is_deleted = false or public.is_country_admin(country::text))
    and (public.is_country_staff(country::text)
         or (public.is_own_country(country::text)
             and (created_by = (select auth.uid())
                  or exists (select 1 from public.invoices i where i.id = receipts.invoice_id and i.salesman_id = (select auth.uid()))
                  or exists (select 1 from public.customers c where c.id = receipts.customer_id
                             and (c.assigned_salesman_id = (select auth.uid()) or c.created_by = (select auth.uid()))))))
  );
create policy receipts_insert_policy on public.receipts for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (created_by = (select auth.uid())
             or exists (select 1 from public.invoices i where i.id = receipts.invoice_id and i.salesman_id = (select auth.uid()))
             or exists (select 1 from public.customers c where c.id = receipts.customer_id
                        and (c.assigned_salesman_id = (select auth.uid()) or c.created_by = (select auth.uid())))))
  );
create policy receipts_update_policy on public.receipts for update to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (created_by = (select auth.uid())
             or exists (select 1 from public.invoices i where i.id = receipts.invoice_id and i.salesman_id = (select auth.uid()))
             or exists (select 1 from public.customers c where c.id = receipts.customer_id
                        and (c.assigned_salesman_id = (select auth.uid()) or c.created_by = (select auth.uid())))))
  )
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (created_by = (select auth.uid())
             or exists (select 1 from public.invoices i where i.id = receipts.invoice_id and i.salesman_id = (select auth.uid()))
             or exists (select 1 from public.customers c where c.id = receipts.customer_id
                        and (c.assigned_salesman_id = (select auth.uid()) or c.created_by = (select auth.uid())))))
  );
create policy receipts_delete_policy on public.receipts for delete to authenticated
  using (public.is_country_admin(country::text));

-- expenses ------------------------------------------------------------------
drop policy if exists expenses_select_policy on public.expenses;
drop policy if exists expenses_insert_policy on public.expenses;
drop policy if exists expenses_update_policy on public.expenses;
drop policy if exists expenses_delete_policy on public.expenses;

create policy expenses_select_policy on public.expenses for select to authenticated
  using (
    (is_deleted = false or public.is_country_admin(country::text))
    and (public.is_country_staff(country::text)
         or (public.is_own_country(country::text)
             and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid()))))
  );
create policy expenses_insert_policy on public.expenses for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy expenses_update_policy on public.expenses for update to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid()))
        and status = 'Pending')
  )
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid()))
        and status = 'Pending')
  );
create policy expenses_delete_policy on public.expenses for delete to authenticated
  using (public.is_country_admin(country::text));

-- cash_handovers ------------------------------------------------------------
drop policy if exists cash_handovers_select_policy on public.cash_handovers;
drop policy if exists cash_handovers_insert_policy on public.cash_handovers;
drop policy if exists cash_handovers_update_policy on public.cash_handovers;
drop policy if exists cash_handovers_delete_policy on public.cash_handovers;

create policy cash_handovers_select_policy on public.cash_handovers for select to authenticated
  using (
    (is_deleted = false or public.is_country_admin(country::text))
    and (public.is_country_staff(country::text)
         or (public.is_own_country(country::text)
             and (salesperson_id = (select auth.uid()) or received_by = (select auth.uid()) or created_by = (select auth.uid()))))
  );
create policy cash_handovers_insert_policy on public.cash_handovers for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy cash_handovers_update_policy on public.cash_handovers for update to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid()))
        and status = 'Pending')
  )
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesperson_id = (select auth.uid()) or created_by = (select auth.uid()))
        and status = 'Pending')
  );
create policy cash_handovers_delete_policy on public.cash_handovers for delete to authenticated
  using (public.is_country_admin(country::text));

-- salesperson_opening_balances ----------------------------------------------
drop policy if exists opening_balances_manage_policy on public.salesperson_opening_balances;
drop policy if exists opening_balances_select_policy on public.salesperson_opening_balances;

create policy opening_balances_select_policy on public.salesperson_opening_balances for select to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text) and salesperson_id = (select auth.uid()))
  );
create policy opening_balances_manage_policy on public.salesperson_opening_balances for all to authenticated
  using (public.is_country_staff(country::text))
  with check (public.is_country_staff(country::text));

-- products: one shared catalogue; admins of either country manage it,
-- each country's prices are protected by protect_country_prices below ----
drop policy if exists products_manage_policy on public.products;
drop policy if exists products_select_policy on public.products;

create policy products_select_policy on public.products for select to authenticated
  using (true);
create policy products_insert_policy on public.products for insert to authenticated
  with check (public.is_super_admin());
-- accountants may update prices (the API and the price trigger limit them to their own country)
create policy products_update_policy on public.products for update to authenticated
  using (public.is_super_admin() or public.get_user_role() = 'accountant')
  with check (public.is_super_admin() or public.get_user_role() = 'accountant');
create policy products_delete_policy on public.products for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 4. profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_policy on public.profiles;
drop policy if exists profiles_insert_policy on public.profiles;
drop policy if exists profiles_update_policy on public.profiles;

create policy profiles_select_policy on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_own_country(country::text));
create policy profiles_insert_policy on public.profiles for insert to authenticated
  with check (public.is_country_admin(country::text));
create policy profiles_update_policy on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_country_admin(country::text))
  with check (id = (select auth.uid()) or public.is_country_admin(country::text));

-- Nobody changes their own role, country or active flag, and an admin cannot
-- move a user to another country. The service role (server code) and the SQL
-- editor have no auth.uid() and are not restricted.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.country is distinct from old.country
     or new.is_active is distinct from old.is_active then
    if new.id = (select auth.uid()) then
      raise exception 'You cannot change your own role, country or active status';
    end if;
    if not public.is_country_admin(old.country::text)
       or not public.is_country_admin(new.country::text) then
      raise exception 'Only an admin of this country can change a user''s role, country or status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---------------------------------------------------------------------------
-- 5. Per-country prices
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists selling_price_omr numeric(14,3);
alter table public.products add column if not exists cost_price_omr    numeric(14,3);
alter table public.products add column if not exists price_10_omr      numeric(14,3);
alter table public.products add column if not exists price_50_omr      numeric(14,3);
alter table public.products add column if not exists price_100_omr     numeric(14,3);

-- A product created by the Oman admin has no UAE price yet
alter table public.products alter column selling_price set default 0;

comment on column public.products.selling_price     is 'UAE price, AED';
comment on column public.products.selling_price_omr is 'Oman price, OMR';

-- Omani rial has 3 decimals (1 OMR = 1000 baisa): widen every money column
-- from numeric(12,2) to numeric(14,3). Existing values are kept exactly.
alter table public.products
  alter column selling_price type numeric(14,3),
  alter column cost_price    type numeric(14,3),
  alter column price_10      type numeric(14,3),
  alter column price_50      type numeric(14,3),
  alter column price_100     type numeric(14,3);
alter table public.quotations
  alter column subtotal       type numeric(14,3),
  alter column discount_total type numeric(14,3),
  alter column vat_total      type numeric(14,3),
  alter column vat_amount     type numeric(14,3),
  alter column total_amount   type numeric(14,3),
  alter column grand_total    type numeric(14,3);
alter table public.quotation_items
  alter column unit_price type numeric(14,3),
  alter column discount   type numeric(14,3),
  alter column line_total type numeric(14,3);
alter table public.invoices
  alter column subtotal       type numeric(14,3),
  alter column discount_total type numeric(14,3),
  alter column vat_total      type numeric(14,3),
  alter column vat_amount     type numeric(14,3),
  alter column total_amount   type numeric(14,3),
  alter column grand_total    type numeric(14,3);
alter table public.invoice_items
  alter column unit_price  type numeric(14,3),
  alter column discount    type numeric(14,3),
  alter column line_total  type numeric(14,3),
  alter column total_price type numeric(14,3);
alter table public.receipts
  alter column amount_paid       type numeric(14,3),
  alter column remaining_balance type numeric(14,3);
alter table public.customers
  alter column credit_limit    type numeric(14,3),
  alter column pending_balance type numeric(14,3);
alter table public.expenses
  alter column amount type numeric(14,3);
alter table public.cash_handovers
  alter column amount type numeric(14,3);
alter table public.salesperson_opening_balances
  alter column opening_cash type numeric(14,3);

-- An admin may only change the prices of their own country.
create or replace function public.protect_country_prices()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_country text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  select p.country::text into v_country from public.profiles p where p.id = (select auth.uid());

  if v_country = 'UAE' and (
       new.selling_price_omr is distinct from old.selling_price_omr
    or new.cost_price_omr    is distinct from old.cost_price_omr
    or new.price_10_omr      is distinct from old.price_10_omr
    or new.price_50_omr      is distinct from old.price_50_omr
    or new.price_100_omr     is distinct from old.price_100_omr) then
    raise exception 'UAE admins cannot change Oman prices';
  end if;

  if v_country = 'Oman' and (
       new.selling_price is distinct from old.selling_price
    or new.cost_price    is distinct from old.cost_price
    or new.price_10      is distinct from old.price_10
    or new.price_50      is distinct from old.price_50
    or new.price_100     is distinct from old.price_100) then
    raise exception 'Oman admins cannot change UAE prices';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_country_prices on public.products;
create trigger protect_country_prices
  before update on public.products
  for each row execute function public.protect_country_prices();

-- ---------------------------------------------------------------------------
-- 6. Admin audit log (written by the app, was missing)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  performed_by  uuid references public.profiles(id) on delete set null,
  performed_at  timestamptz not null default now(),
  action        text not null,
  target_user   uuid,
  details       jsonb,
  country       text default public.get_user_country()
);
create index if not exists admin_audit_logs_country_at_idx on public.admin_audit_logs (country, performed_at desc);

alter table public.admin_audit_logs enable row level security;
drop policy if exists admin_audit_logs_insert_policy on public.admin_audit_logs;
drop policy if exists admin_audit_logs_select_policy on public.admin_audit_logs;
create policy admin_audit_logs_insert_policy on public.admin_audit_logs for insert to authenticated
  with check (performed_by = (select auth.uid()));
create policy admin_audit_logs_select_policy on public.admin_audit_logs for select to authenticated
  using (public.is_country_admin(country));

-- ---------------------------------------------------------------------------
-- 7. Functions
-- ---------------------------------------------------------------------------
create or replace function public.get_all_profiles_for_admin()
returns setof public.profiles
language plpgsql stable security definer set search_path = 'public' as $$
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized: Only an admin can view all profiles.';
  end if;
  return query
    select * from public.profiles
    where country::text = public.get_user_country()
    order by created_at desc;
end;
$$;

drop function if exists public.admin_create_user(text, text, text, text, text, text);

notify pgrst, 'reload schema';

commit;
