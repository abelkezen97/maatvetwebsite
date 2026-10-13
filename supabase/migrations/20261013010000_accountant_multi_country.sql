-- ============================================================================
-- Accountant: one login for several countries, full access except logins
-- ============================================================================
-- 1. profiles.countries: the countries a user may work in. `country` stays the
--    ACTIVE country, so every existing country rule keeps working; switching
--    country (server side, /api/profile/country) just changes `country`.
--    Empty means "only `country`".
-- 2. Profile protection: users could update their own profile row, every
--    column included (role, country, is_active...). Only a country admin (or
--    the server with the service key) may change those now.
-- 3. Accountant write access where rules were admin-only: products,
--    categories, settings, document settings, commission bands.
-- Non-destructive: adds a column, a trigger and policies.

-- 1 ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists countries text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_countries_valid') then
    alter table public.profiles
      add constraint profiles_countries_valid check (countries <@ array['UAE','Oman']::text[]);
  end if;
end $$;

comment on column public.profiles.countries is
  'Countries this user may work in (switchable). Empty = only `country`. `country` is the active one.';

-- 2 ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server with the service key / SQL editor: no end-user session.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- An admin of any country the user works in may manage them.
  if public.is_country_admin(old.country::text)
     or exists (select 1 from unnest(old.countries) c where public.is_country_admin(c::text)) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.country is distinct from old.country
     or new.countries is distinct from old.countries
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    raise exception 'Only an admin can change role, country, status or email'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- A multi-country user is visible to (and manageable by the admin of) every
-- country they work in, not only the one they have open.
drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_own_country(country::text)
    or exists (select 1 from unnest(countries) c where public.is_own_country(c::text))
  );

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or public.is_country_admin(country::text)
    or exists (select 1 from unnest(countries) c where public.is_country_admin(c::text))
  )
  with check (
    id = (select auth.uid())
    or public.is_country_admin(country::text)
    or exists (select 1 from unnest(countries) c where public.is_country_admin(c::text))
  );

-- 3 ---------------------------------------------------------------------------
-- Office staff (admin or accountant), any country.
create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text in ('super_admin', 'accountant')
  );
$$;

do $$
begin
  -- products: insert / delete were admin-only (update already allowed accountants)
  drop policy if exists products_insert_policy on public.products;
  create policy products_insert_policy on public.products
    for insert to authenticated with check (public.is_staff_user());

  drop policy if exists products_delete_policy on public.products;
  create policy products_delete_policy on public.products
    for delete to authenticated using (public.is_staff_user());

  drop policy if exists products_update_policy on public.products;
  create policy products_update_policy on public.products
    for update to authenticated using (public.is_staff_user()) with check (public.is_staff_user());

  -- categories, settings, document settings
  drop policy if exists product_categories_admin_write on public.product_categories;
  create policy product_categories_admin_write on public.product_categories
    for all to authenticated using (public.is_staff_user()) with check (public.is_staff_user());

  drop policy if exists settings_admin_write on public.settings;
  create policy settings_admin_write on public.settings
    for all to authenticated using (public.is_staff_user()) with check (public.is_staff_user());

  drop policy if exists document_settings_admin_write on public.document_settings;
  create policy document_settings_admin_write on public.document_settings
    for all to authenticated using (public.is_staff_user()) with check (public.is_staff_user());

  -- commission bands (per country)
  drop policy if exists commission_bands_admin_write on public.commission_bands;
  create policy commission_bands_admin_write on public.commission_bands
    for all to authenticated
    using (public.is_country_staff(country::text))
    with check (public.is_country_staff(country::text));
end $$;
