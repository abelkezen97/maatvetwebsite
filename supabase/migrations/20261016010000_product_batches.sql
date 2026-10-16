-- Batches with expiry dates, per product and country.
-- qty_received: stock of the batch when it was loaded (backup) plus later receipts.
-- Remaining stock = qty_received - quantities sold on invoice lines linked to the batch.
create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  country text not null check (country in ('UAE', 'Oman')),
  batch_no text not null,
  manufacture_date date,
  expiry_date date,
  qty_received numeric not null default 0,
  -- Batch number shared by several products in the old system: expiry needs checking.
  needs_check boolean not null default false,
  notes text,
  source text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (product_id, country, batch_no)
);
create index if not exists product_batches_product_idx on public.product_batches (product_id, country);
create index if not exists product_batches_expiry_idx on public.product_batches (country, expiry_date);

alter table public.product_batches enable row level security;

create policy product_batches_select on public.product_batches
  for select to authenticated using (public.is_own_country(country));
create policy product_batches_insert on public.product_batches
  for insert to authenticated with check (public.is_country_staff(country));
create policy product_batches_update on public.product_batches
  for update to authenticated using (public.is_country_staff(country)) with check (public.is_country_staff(country));
create policy product_batches_delete on public.product_batches
  for delete to authenticated using (public.is_country_staff(country));

-- The batch an invoice line was sold from (new sales; imported lines keep the text in description).
alter table public.invoice_items add column if not exists batch_id uuid references public.product_batches(id) on delete set null;
create index if not exists invoice_items_batch_idx on public.invoice_items (batch_id);

-- Stock and expiry per batch, respecting the caller's row-level security.
create or replace view public.batch_stock with (security_invoker = true) as
select
  b.id,
  b.product_id,
  b.country,
  b.batch_no,
  b.manufacture_date,
  b.expiry_date,
  b.qty_received,
  coalesce(s.sold, 0) as qty_sold,
  b.qty_received - coalesce(s.sold, 0) as qty_remaining,
  case when b.expiry_date is null then null else b.expiry_date - (now() at time zone 'Asia/Dubai')::date end as days_to_expiry,
  b.needs_check,
  b.notes,
  b.is_active
from public.product_batches b
left join (
  select ii.batch_id, sum(ii.quantity) as sold
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where ii.batch_id is not null and i.is_deleted = false and coalesce(i.status, '') <> 'Cancelled'
  group by ii.batch_id
) s on s.batch_id = b.id;
