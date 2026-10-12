-- ==============================================================================
-- invoice_balances: expose billing_series (appended as the last column)
--
-- The receipt screen shows a customer's open invoices of one billing series
-- at a time (UAE-registered or Oman-registered). Non-destructive.
-- ==============================================================================

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
         coalesce(cr.credited, 0)                               as credited_amount,
         i.billing_series
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
       greatest(b.paid_amount + b.credited_amount - b.grand_total, 0)                     as excess_credit,
       b.billing_series
  from base b;

grant select on public.invoice_balances to authenticated;
revoke all on public.invoice_balances from anon;

notify pgrst, 'reload schema';
