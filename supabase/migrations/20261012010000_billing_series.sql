-- ==============================================================================
-- UAE billing series: UAE-registered vs Oman-registered products
--
-- In the UAE, Oman-registered products are billed on their own invoices
-- (own number series, printed without the company header); their payments are
-- kept apart the same way. The customer still has one combined balance.
--
-- 1. products.registered_in        UAE | Oman  (one country per product)
-- 2. billing_series on invoices, receipts and credit notes:
--      'standard'  UAE-registered (with header)  - every Oman invoice too
--      'oman_reg'  Oman-registered sold in the UAE (no header)
--    invoices.invoice_group_id links the two halves of one split sale.
-- 3. document_series: per salesman, a prefix + next number for each
--    document type (invoice / receipt) and billing series, set by the admin.
--    next_document_number() hands out numbers atomically.
-- 4. A receipt can only be allocated to invoices of its own billing series.
--
-- Non-destructive and re-runnable.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- 1. Product registration
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists registered_in public.user_country not null default 'UAE';

-- ---------------------------------------------------------------------------
-- 2. Billing series on documents
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists billing_series   text not null default 'standard',
  add column if not exists invoice_group_id uuid;
alter table public.receipts
  add column if not exists billing_series text not null default 'standard';
alter table public.credit_notes
  add column if not exists billing_series text not null default 'standard';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_billing_series_check') then
    alter table public.invoices add constraint invoices_billing_series_check
      check (billing_series in ('standard', 'oman_reg'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'receipts_billing_series_check') then
    alter table public.receipts add constraint receipts_billing_series_check
      check (billing_series in ('standard', 'oman_reg'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_notes_billing_series_check') then
    alter table public.credit_notes add constraint credit_notes_billing_series_check
      check (billing_series in ('standard', 'oman_reg'));
  end if;
  -- Oman-registered billing exists only in the UAE.
  if not exists (select 1 from pg_constraint where conname = 'invoices_oman_reg_uae_only') then
    alter table public.invoices add constraint invoices_oman_reg_uae_only
      check (billing_series = 'standard' or country = 'UAE');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'receipts_oman_reg_uae_only') then
    alter table public.receipts add constraint receipts_oman_reg_uae_only
      check (billing_series = 'standard' or country = 'UAE');
  end if;
end
$$;

create index if not exists invoices_group_idx on public.invoices (invoice_group_id) where invoice_group_id is not null;
create index if not exists invoices_series_idx on public.invoices (country, billing_series);
create index if not exists receipts_series_idx on public.receipts (country, billing_series);

-- A credit note always takes its invoice's billing series.
create or replace function public.credit_note_set_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select i.billing_series into new.billing_series from public.invoices i where i.id = new.invoice_id;
  new.billing_series := coalesce(new.billing_series, 'standard');
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_credit_note_series') then
    create trigger trg_credit_note_series
      before insert or update of invoice_id on public.credit_notes
      for each row execute function public.credit_note_set_series();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Number series per salesman
-- ---------------------------------------------------------------------------
create table if not exists public.document_series (
  id              uuid primary key default gen_random_uuid(),
  salesman_id     uuid not null references public.profiles(id) on delete cascade,
  doc_type        text not null check (doc_type in ('invoice', 'receipt')),
  billing_series  text not null check (billing_series in ('standard', 'oman_reg')),
  prefix          text not null check (length(trim(prefix)) between 1 and 12),
  next_number     integer not null check (next_number > 0),
  pad_length      integer not null default 4 check (pad_length between 1 and 8),
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (salesman_id, doc_type, billing_series)
);
-- Two salesmen may never share a prefix for the same document type,
-- otherwise their numbers would collide.
create unique index if not exists document_series_prefix_uidx
  on public.document_series (doc_type, upper(prefix));

alter table public.document_series enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'document_series_select_policy') then
    execute $p$create policy document_series_select_policy on public.document_series for select to authenticated
      using (
        salesman_id = (select auth.uid())
        or exists (select 1 from public.profiles p
                    where p.id = document_series.salesman_id
                      and public.is_country_staff(p.country::text))
      )$p$;
  end if;
end
$$;

-- Changes go through the admin API (service role) only.
grant select on public.document_series to authenticated;
revoke all on public.document_series from anon;

-- Next number of a salesman's series, e.g. 'AM-0101'; NULL when the series is
-- not set up. Skips numbers that already exist (e.g. imported documents).
create or replace function public.next_document_number(
  p_salesman_id    uuid,
  p_doc_type       text,
  p_billing_series text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_country text;
  v_prefix  text;
  v_num     integer;
  v_pad     integer;
  v_candidate text;
  v_taken   boolean;
  v_tries   integer := 0;
begin
  select country::text into v_country from public.profiles where id = p_salesman_id;
  if v_country is null then
    return null;
  end if;

  -- Service role (no auth.uid()), the salesman himself, or staff of his country.
  if v_caller is not null
     and v_caller <> p_salesman_id
     and not public.is_country_staff(v_country) then
    raise exception 'not allowed to use this number series' using errcode = '42501';
  end if;

  loop
    update public.document_series
       set next_number = next_number + 1
     where salesman_id = p_salesman_id
       and doc_type = p_doc_type
       and billing_series = p_billing_series
    returning prefix, next_number - 1, pad_length into v_prefix, v_num, v_pad;

    if v_prefix is null then
      return null;
    end if;

    v_candidate := v_prefix || lpad(v_num::text, v_pad, '0');

    if p_doc_type = 'invoice' then
      select exists (select 1 from public.invoices where invoice_number = v_candidate) into v_taken;
    else
      select exists (select 1 from public.receipts where receipt_number = v_candidate) into v_taken;
    end if;

    if not v_taken then
      return v_candidate;
    end if;

    v_tries := v_tries + 1;
    if v_tries > 1000 then
      raise exception 'number series % is exhausted or out of step', v_prefix;
    end if;
  end loop;
end;
$$;

revoke all on function public.next_document_number(uuid, text, text) from public, anon;
grant execute on function public.next_document_number(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Receipts settle only invoices of their own billing series
-- ---------------------------------------------------------------------------
create or replace function public.receipt_allocation_same_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt text;
  v_invoice text;
begin
  select billing_series into v_receipt from public.receipts where id = new.receipt_id;
  select billing_series into v_invoice from public.invoices where id = new.invoice_id;
  if v_receipt is distinct from v_invoice then
    raise exception 'A % receipt cannot settle a % invoice',
      case v_receipt when 'oman_reg' then 'Oman-registered' else 'UAE-registered' end,
      case v_invoice when 'oman_reg' then 'Oman-registered' else 'UAE-registered' end
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A receipt tied to one invoice (e.g. the automatic receipt of a Paid
-- invoice) takes that invoice's billing series.
create or replace function public.receipt_set_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_id is not null then
    select i.billing_series into new.billing_series from public.invoices i where i.id = new.invoice_id;
    new.billing_series := coalesce(new.billing_series, 'standard');
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_receipt_series') then
    create trigger trg_receipt_series
      before insert or update of invoice_id on public.receipts
      for each row execute function public.receipt_set_series();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_receipt_allocation_series') then
    create trigger trg_receipt_allocation_series
      before insert or update on public.receipt_allocations
      for each row execute function public.receipt_allocation_same_series();
  end if;
end
$$;

notify pgrst, 'reload schema';
