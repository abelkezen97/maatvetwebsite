-- Credit control: per-country policy, per-customer release, and an ageing view.
-- Additive only (no drops).

create table if not exists public.credit_policy (
  country            text primary key,
  block_enabled      boolean not null default true,
  block_after_days   integer not null default 100 check (block_after_days > 0),
  default_credit_days integer not null default 90 check (default_credit_days >= 0),
  updated_by         uuid references public.profiles(id) on delete set null,
  updated_at         timestamptz not null default now()
);
alter table public.credit_policy enable row level security;
insert into public.credit_policy (country) values ('UAE'), ('Oman') on conflict do nothing;

-- Admin / accountant can release a blocked customer (until they pay or are re-checked).
alter table public.customers
  add column if not exists credit_released boolean not null default false,
  add column if not exists credit_released_reason text,
  add column if not exists credit_released_by uuid references public.profiles(id) on delete set null,
  add column if not exists credit_released_at timestamptz;

-- One row per customer with open invoices. Due date = invoice date + the invoice's
-- credit days (the policy default when the invoice has none).
create or replace view public.customer_credit_status
with (security_invoker = true) as
with inv as (
  select ib.customer_id,
         ib.country,
         ib.outstanding,
         (current_date - (ib.invoice_date + case when ib.credit_days > 0 then ib.credit_days
                                                 else coalesce(p.default_credit_days, 90) end)) as days_over
    from public.invoice_balances ib
    left join public.credit_policy p on p.country = ib.country::text
   where ib.outstanding > 0.0005
)
select customer_id,
       sum(outstanding)                                                  as open_amount,
       sum(outstanding) filter (where days_over <= 0)                    as not_due,
       sum(outstanding) filter (where days_over between 1 and 30)        as d1_30,
       sum(outstanding) filter (where days_over between 31 and 60)       as d31_60,
       sum(outstanding) filter (where days_over between 61 and 90)       as d61_90,
       sum(outstanding) filter (where days_over > 90)                    as d90_plus,
       sum(outstanding) filter (where days_over > 0)                     as overdue_amount,
       greatest(max(days_over), 0)                                       as max_days_overdue
  from inv
 group by customer_id;
