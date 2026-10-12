-- ==============================================================================
-- Salesman commission (UAE)
--
-- Commission is earned on money collected against an invoice within 100 days
-- of the invoice date. Each salesman's eligible collections are totalled per
-- calendar quarter and paid in bands, each band at its own rate:
--     0 - 25,000      0%
--     25,000 - 35,000 3%
--     35,000 - 45,000 4%
--     above 45,000    4%
--
-- 1. commission_bands         the bands per country (seeded for UAE)
-- 2. commission_payouts       admin / accountant records a quarter as paid
-- 3. commission_collections   every amount applied to an invoice, with the
--                             date it counts as collected (cash / transfer:
--                             payment date; cheque: the day it cleared) and
--                             the days after the invoice date
--
-- Non-destructive and re-runnable.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bands
-- ---------------------------------------------------------------------------
create table if not exists public.commission_bands (
  id          uuid primary key default gen_random_uuid(),
  country     public.user_country not null,
  from_amount numeric(14,3) not null check (from_amount >= 0),
  to_amount   numeric(14,3) check (to_amount is null or to_amount > from_amount),
  rate        numeric(6,3) not null check (rate >= 0 and rate <= 100),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (country, from_amount)
);

insert into public.commission_bands (country, from_amount, to_amount, rate) values
  ('UAE', 0,     25000, 0),
  ('UAE', 25000, 35000, 3),
  ('UAE', 35000, 45000, 4),
  ('UAE', 45000, null,  4)
on conflict (country, from_amount) do nothing;

alter table public.commission_bands enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Payouts
-- ---------------------------------------------------------------------------
create table if not exists public.commission_payouts (
  id                uuid primary key default gen_random_uuid(),
  salesman_id       uuid not null references public.profiles(id) on delete cascade,
  country           public.user_country not null,
  year              integer not null check (year between 2000 and 2100),
  quarter           integer not null check (quarter between 1 and 4),
  eligible_amount   numeric(14,3) not null default 0,
  commission_amount numeric(14,3) not null default 0,
  notes             text,
  paid_at           timestamptz not null default now(),
  paid_by           uuid references public.profiles(id) on delete set null,
  unique (salesman_id, year, quarter)
);

alter table public.commission_payouts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'commission_bands_select_own_country') then
    execute 'create policy commission_bands_select_own_country on public.commission_bands for select to authenticated using (public.is_own_country(country::text))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'commission_bands_admin_write') then
    execute 'create policy commission_bands_admin_write on public.commission_bands for all to authenticated using (public.is_country_admin(country::text)) with check (public.is_country_admin(country::text))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'commission_payouts_select') then
    execute 'create policy commission_payouts_select on public.commission_payouts for select to authenticated using (public.is_country_staff(country::text) or salesman_id = (select auth.uid()))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'commission_payouts_staff_write') then
    execute 'create policy commission_payouts_staff_write on public.commission_payouts for all to authenticated using (public.is_country_staff(country::text)) with check (public.is_country_staff(country::text))';
  end if;
end
$$;

grant select, insert, update, delete on public.commission_bands, public.commission_payouts to authenticated;
revoke all on public.commission_bands, public.commission_payouts from anon;

-- ---------------------------------------------------------------------------
-- 3. Collections with their "collected on" date
-- ---------------------------------------------------------------------------
create or replace view public.commission_collections
with (security_invoker = true) as
select a.receipt_id,
       a.invoice_id,
       a.amount,
       r.receipt_number,
       r.payment_method,
       r.customer_id,
       c.company_name,
       i.invoice_number,
       i.salesman_id,
       i.country,
       coalesce(i.issue_date, i.invoice_date)                                         as invoice_date,
       -- A cheque counts on the day it cleared (Dubai time); everything else on the payment date.
       case when r.cheque_status = 'Cleared'
            then coalesce((r.cleared_at at time zone 'Asia/Dubai')::date, r.payment_date)
            else r.payment_date
       end                                                                             as collected_on
  from public.receipt_applications a
  join public.receipts  r on r.id = a.receipt_id
  join public.invoices  i on i.id = a.invoice_id
  left join public.customers c on c.id = r.customer_id
 where r.is_deleted = false
   and i.is_deleted = false
   and coalesce(i.status, '') <> 'Cancelled'
   and (r.cheque_status is null or r.cheque_status = 'Cleared');

grant select on public.commission_collections to authenticated;
revoke all on public.commission_collections from anon;

notify pgrst, 'reload schema';
