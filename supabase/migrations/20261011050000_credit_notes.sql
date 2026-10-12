-- ==============================================================================
-- Credit notes & returns
--
-- 1. credit_notes / credit_note_items: built from an invoice's lines (items and
--    quantities coming back, at the invoice's net unit price). Each line says
--    whether the goods go back to stock (restock) or are written off.
-- 2. Approval: a salesperson's credit note starts Pending; an admin or
--    accountant approves or rejects it. Notes created by staff are approved at
--    once. Only Approved notes count.
-- 3. An approved credit note lowers its invoice's open amount first; credit
--    beyond what is open (e.g. the invoice was already paid) stays with the
--    customer as credit and lowers their balance.
-- 4. invoice_balances / customer_balances rebuilt to include credit notes.
--
-- Non-destructive and re-runnable: views are replaced in place (new columns
-- appended at the end), policies are created only if missing.
-- ==============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.credit_notes (
  id                  uuid primary key default gen_random_uuid(),
  credit_note_number  text not null unique,
  invoice_id          uuid not null references public.invoices(id) on delete restrict,
  customer_id         uuid not null references public.customers(id) on delete restrict,
  salesman_id         uuid references public.profiles(id) on delete set null,
  country             public.user_country not null,
  credit_date         date not null default current_date,
  reason              text not null,
  notes               text,
  total               numeric(14,3) not null check (total > 0),
  status              text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  requested_by        uuid references public.profiles(id) on delete set null,
  requested_at        timestamptz not null default now(),
  approved_by         uuid references public.profiles(id) on delete set null,
  approved_at         timestamptz,
  rejected_by         uuid references public.profiles(id) on delete set null,
  rejected_at         timestamptz,
  rejection_reason    text,
  is_deleted          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists credit_notes_invoice_idx  on public.credit_notes (invoice_id);
create index if not exists credit_notes_customer_idx on public.credit_notes (customer_id);
create index if not exists credit_notes_status_idx   on public.credit_notes (country, status);

create table if not exists public.credit_note_items (
  id               uuid primary key default gen_random_uuid(),
  credit_note_id   uuid not null references public.credit_notes(id) on delete cascade,
  invoice_item_id  uuid not null references public.invoice_items(id) on delete restrict,
  product_id       uuid not null references public.products(id) on delete restrict,
  quantity         integer not null check (quantity > 0),
  unit_price       numeric(14,3) not null check (unit_price >= 0),
  line_total       numeric(14,3) not null check (line_total >= 0),
  restock          boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists credit_note_items_note_idx on public.credit_note_items (credit_note_id);
create index if not exists credit_note_items_invoice_item_idx on public.credit_note_items (invoice_item_id);

-- ---------------------------------------------------------------------------
-- 2. RLS (same pattern as invoices; items follow their credit note)
-- ---------------------------------------------------------------------------
alter table public.credit_notes enable row level security;
alter table public.credit_note_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'credit_notes_select_policy') then
    execute $p$create policy credit_notes_select_policy on public.credit_notes for select to authenticated
  using (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and (salesman_id = (select auth.uid()) or requested_by = (select auth.uid())))
  )$p$;
  end if;
  -- Salespeople may only file Pending requests; staff may file approved notes.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'credit_notes_insert_policy') then
    execute $p$create policy credit_notes_insert_policy on public.credit_notes for insert to authenticated
  with check (
    public.is_country_staff(country::text)
    or (public.is_own_country(country::text)
        and requested_by = (select auth.uid())
        and status = 'Pending')
  )$p$;
  end if;
  -- Only staff approve, reject or delete.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'credit_notes_update_policy') then
    execute $p$create policy credit_notes_update_policy on public.credit_notes for update to authenticated
  using (public.is_country_staff(country::text))
  with check (public.is_country_staff(country::text))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'credit_note_items_select_policy') then
    execute $p$create policy credit_note_items_select_policy on public.credit_note_items for select to authenticated
  using (exists (select 1 from public.credit_notes cn where cn.id = credit_note_items.credit_note_id))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'credit_note_items_insert_policy') then
    execute $p$create policy credit_note_items_insert_policy on public.credit_note_items for insert to authenticated
  with check (exists (select 1 from public.credit_notes cn where cn.id = credit_note_items.credit_note_id))$p$;
  end if;
end
$$;

grant select, insert, update on public.credit_notes to authenticated;
grant select, insert on public.credit_note_items to authenticated;
revoke all on public.credit_notes, public.credit_note_items from anon;

-- ---------------------------------------------------------------------------
-- 3. Balances including credit notes
-- ---------------------------------------------------------------------------
create or replace view public.invoice_balances
with (security_invoker = true) as
with applied as (
  select a.invoice_id,
         sum(a.amount) filter (where r.cheque_status is null or r.cheque_status = 'Cleared') as paid,
         sum(a.amount) filter (where r.cheque_status = 'Pending')                           as pending
    from public.receipt_applications a
    join public.receipts r on r.id = a.receipt_id
   where r.is_deleted = false
   group by a.invoice_id
), credited as (
  select invoice_id, sum(total) as credited
    from public.credit_notes
   where status = 'Approved' and is_deleted = false
   group by invoice_id
), base as (
  select i.id                                                   as invoice_id,
         i.invoice_number,
         i.customer_id,
         i.salesman_id,
         i.country,
         coalesce(i.issue_date, i.invoice_date)                 as invoice_date,
         coalesce(i.credit_days, 0)                             as credit_days,
         coalesce(i.due_date,
                  coalesce(i.issue_date, i.invoice_date) + coalesce(i.credit_days, 0)) as due_date,
         coalesce(i.grand_total, 0)                             as grand_total,
         coalesce(ap.paid, 0)                                   as paid_amount,
         coalesce(ap.pending, 0)                                as pending_cheques,
         coalesce(cr.credited, 0)                               as credited_amount
    from public.invoices i
    left join applied  ap on ap.invoice_id = i.id
    left join credited cr on cr.invoice_id = i.id
   where i.is_deleted = false
     and coalesce(i.status, '') <> 'Cancelled'
)
select b.invoice_id,
       b.invoice_number,
       b.customer_id,
       b.salesman_id,
       b.country,
       b.invoice_date,
       b.credit_days,
       b.due_date,
       b.grand_total,
       b.paid_amount,
       b.pending_cheques,
       greatest(b.grand_total - b.paid_amount - b.credited_amount, 0)                     as outstanding,
       greatest(b.grand_total - b.paid_amount - b.credited_amount - b.pending_cheques, 0) as available_to_allocate,
       case
         when b.grand_total - b.paid_amount - b.credited_amount <= 0.0005                     then 'Paid'
         when b.grand_total - b.paid_amount - b.credited_amount - b.pending_cheques <= 0.0005 then 'Cheque pending'
         when b.paid_amount > 0 or b.credited_amount > 0                                      then 'Partly paid'
         else 'Unpaid'
       end                                                                                 as payment_state,
       (b.grand_total - b.paid_amount - b.credited_amount > 0.0005 and b.due_date < current_date) as is_overdue,
       greatest(current_date - b.due_date, 0)                                             as days_overdue,
       b.credited_amount,
       -- credit beyond what was open on the invoice: stays with the customer as credit
       greatest(b.paid_amount + b.credited_amount - b.grand_total, 0)                     as excess_credit
  from base b;

create or replace view public.customer_balances
with (security_invoker = true) as
with open_invoices as (
  select customer_id, sum(outstanding) as outstanding, sum(excess_credit) as excess_credit
    from public.invoice_balances
   group by customer_id
), unapplied as (
  select r.customer_id,
         sum(r.amount_paid - coalesce(app.applied, 0)) as unapplied
    from public.receipts r
    left join (select receipt_id, sum(amount) as applied
                 from public.receipt_applications group by receipt_id) app
           on app.receipt_id = r.id
   where r.is_deleted = false
     and (r.cheque_status is null or r.cheque_status = 'Cleared')
   group by r.customer_id
), pending as (
  select customer_id, sum(amount_paid) as pending
    from public.receipts
   where is_deleted = false and cheque_status = 'Pending'
   group by customer_id
)
select c.id                                    as customer_id,
       c.country,
       coalesce(c.opening_balance, 0)          as opening_balance,
       coalesce(oi.outstanding, 0)             as invoices_outstanding,
       coalesce(u.unapplied, 0)                as unapplied_payments,
       coalesce(p.pending, 0)                  as cheques_pending,
       coalesce(c.opening_balance, 0) + coalesce(oi.outstanding, 0)
         - coalesce(u.unapplied, 0) - coalesce(oi.excess_credit, 0) as balance,
       c.cash_only,
       coalesce(oi.excess_credit, 0)           as unapplied_credit_notes
  from public.customers c
  left join open_invoices oi on oi.customer_id = c.id
  left join unapplied     u  on u.customer_id  = c.id
  left join pending       p  on p.customer_id  = c.id;

grant select on public.invoice_balances, public.customer_balances to authenticated;
revoke all on public.invoice_balances, public.customer_balances from anon;

update public.customers c
   set pending_balance = greatest(cb.balance, 0)
  from public.customer_balances cb
 where cb.customer_id = c.id;

notify pgrst, 'reload schema';

commit;
