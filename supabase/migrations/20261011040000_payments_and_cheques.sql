-- ==============================================================================
-- Payments & cheques
--
-- 1. Cheque details and life cycle on receipts:
--      Pending -> (received by office) -> Cleared | Bounced
--    A cheque counts as paid only once Cleared.
-- 2. receipt_allocations: one receipt can settle several invoices, in part or
--    in full; whatever is not allocated stays on the customer as an advance.
--    A receipt with invoice_id and no allocation rows (the older single-invoice
--    flow, and the automatic receipt of a Paid invoice) counts as applied to
--    that invoice in full.
-- 3. customers.cash_only: set when a cheque bounces; blocks credit invoices
--    and cheque payments until an admin removes it.
-- 4. Views (security_invoker, so RLS still applies):
--      receipt_applications  every receipt-to-invoice application
--      invoice_balances      paid / pending cheques / open amount / state per invoice
--      customer_balances     opening + open invoices - unapplied payments
-- 5. The two INSERT triggers that adjusted customers.pending_balance are
--    dropped: the app recalculates it from customer_balances, and the triggers
--    double-counted alongside that recalculation.
--
-- Contains DROP TRIGGER: run in the SQL editor, as one script.
-- ==============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Cheques on receipts
-- ---------------------------------------------------------------------------
alter table public.receipts
  add column if not exists cheque_number      text,
  add column if not exists cheque_date        date,
  add column if not exists bank_name          text,
  add column if not exists cheque_status      text,
  add column if not exists cheque_received_at timestamptz,
  add column if not exists cheque_received_by uuid references public.profiles(id) on delete set null,
  add column if not exists cleared_at         timestamptz,
  add column if not exists cleared_by         uuid references public.profiles(id) on delete set null,
  add column if not exists bounced_at         timestamptz,
  add column if not exists bounced_by         uuid references public.profiles(id) on delete set null,
  add column if not exists bounce_reason      text;

alter table public.receipts drop constraint if exists receipts_cheque_status_check;
alter table public.receipts add constraint receipts_cheque_status_check
  check (cheque_status is null or cheque_status in ('Pending', 'Cleared', 'Bounced'));

-- Cheque receipts recorded before this change are treated as already cleared.
update public.receipts
   set cheque_status = 'Cleared'
 where payment_method = 'Cheque' and cheque_status is null;

create index if not exists receipts_cheque_status_idx
  on public.receipts (country, cheque_status)
  where cheque_status = 'Pending';

-- ---------------------------------------------------------------------------
-- 2. Allocations
-- ---------------------------------------------------------------------------
create table if not exists public.receipt_allocations (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  invoice_id  uuid not null references public.invoices(id) on delete restrict,
  amount      numeric(14,3) not null check (amount > 0),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);
create index if not exists receipt_allocations_invoice_idx on public.receipt_allocations (invoice_id);

alter table public.receipt_allocations enable row level security;

drop policy if exists receipt_allocations_select_policy on public.receipt_allocations;
drop policy if exists receipt_allocations_insert_policy on public.receipt_allocations;
drop policy if exists receipt_allocations_delete_policy on public.receipt_allocations;

-- Visible / writable when both the receipt and the invoice are visible to the user.
create policy receipt_allocations_select_policy on public.receipt_allocations for select to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_allocations.receipt_id));
create policy receipt_allocations_insert_policy on public.receipt_allocations for insert to authenticated
  with check (
    exists (select 1 from public.receipts r where r.id = receipt_allocations.receipt_id)
    and exists (select 1 from public.invoices i where i.id = receipt_allocations.invoice_id)
  );
create policy receipt_allocations_delete_policy on public.receipt_allocations for delete to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_allocations.receipt_id));

grant select, insert, delete on public.receipt_allocations to authenticated;
revoke all on public.receipt_allocations from anon;

-- ---------------------------------------------------------------------------
-- 3. Cash-only flag on customers
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists cash_only        boolean not null default false,
  add column if not exists cash_only_reason text,
  add column if not exists cash_only_since  timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Views
-- ---------------------------------------------------------------------------
create or replace view public.receipt_applications
with (security_invoker = true) as
  select ra.receipt_id, ra.invoice_id, ra.amount
    from public.receipt_allocations ra
  union all
  select r.id, r.invoice_id, r.amount_paid
    from public.receipts r
   where r.invoice_id is not null
     and not exists (select 1 from public.receipt_allocations ra where ra.receipt_id = r.id);

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
         coalesce(ap.pending, 0)                                as pending_cheques
    from public.invoices i
    left join applied ap on ap.invoice_id = i.id
   where i.is_deleted = false
     and coalesce(i.status, '') <> 'Cancelled'
)
select b.*,
       greatest(b.grand_total - b.paid_amount, 0)                              as outstanding,
       greatest(b.grand_total - b.paid_amount - b.pending_cheques, 0)          as available_to_allocate,
       case
         when b.grand_total - b.paid_amount <= 0.0005                          then 'Paid'
         when b.grand_total - b.paid_amount - b.pending_cheques <= 0.0005      then 'Cheque pending'
         when b.paid_amount > 0                                                then 'Partly paid'
         else 'Unpaid'
       end                                                                     as payment_state,
       (b.grand_total - b.paid_amount > 0.0005 and b.due_date < current_date)  as is_overdue,
       greatest(current_date - b.due_date, 0)                                  as days_overdue
  from base b;

create or replace view public.customer_balances
with (security_invoker = true) as
with open_invoices as (
  select customer_id, sum(outstanding) as outstanding
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
       coalesce(c.opening_balance, 0) + coalesce(oi.outstanding, 0) - coalesce(u.unapplied, 0) as balance,
       c.cash_only
  from public.customers c
  left join open_invoices oi on oi.customer_id = c.id
  left join unapplied     u  on u.customer_id  = c.id
  left join pending       p  on p.customer_id  = c.id;

grant select on public.receipt_applications, public.invoice_balances, public.customer_balances to authenticated;
revoke all on public.receipt_applications, public.invoice_balances, public.customer_balances from anon;

-- ---------------------------------------------------------------------------
-- 5. One balance calculation
-- ---------------------------------------------------------------------------
drop trigger if exists trg_invoice_balance on public.invoices;
drop trigger if exists trg_receipt_balance on public.receipts;

update public.customers c
   set pending_balance = greatest(cb.balance, 0)
  from public.customer_balances cb
 where cb.customer_id = c.id;

notify pgrst, 'reload schema';

commit;
