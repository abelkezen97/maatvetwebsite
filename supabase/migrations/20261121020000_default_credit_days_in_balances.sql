-- One rule for "overdue" everywhere: an invoice with no credit days counts as
-- the country's default credit days (credit_policy.default_credit_days, 90).
create or replace view invoice_balances as
 WITH applied AS (
         SELECT a.invoice_id,
            sum(a.amount) FILTER (WHERE ((r.cheque_status IS NULL) OR (r.cheque_status = 'Cleared'::text))) AS paid,
            sum(a.amount) FILTER (WHERE (r.cheque_status = 'Pending'::text)) AS pending
           FROM (receipt_applications a
             JOIN receipts r ON ((r.id = a.receipt_id)))
          WHERE (r.is_deleted = false)
          GROUP BY a.invoice_id
        ), credited AS (
         SELECT credit_notes.invoice_id,
            sum(credit_notes.total) AS credited
           FROM credit_notes
          WHERE ((credit_notes.status = 'Approved'::text) AND (credit_notes.is_deleted = false))
          GROUP BY credit_notes.invoice_id
        ), base AS (
         SELECT i.id AS invoice_id,
            i.invoice_number,
            i.customer_id,
            i.salesman_id,
            i.country,
            COALESCE(i.issue_date, i.invoice_date) AS invoice_date,
            COALESCE(i.credit_days, 0) AS credit_days,
            COALESCE(i.due_date, (COALESCE(i.issue_date, i.invoice_date) + (
                CASE WHEN COALESCE(i.credit_days, 0) > 0 THEN i.credit_days
                     ELSE COALESCE(p.default_credit_days, 90) END))) AS due_date,
            COALESCE(i.grand_total, (0)::numeric) AS grand_total,
            COALESCE(ap.paid, (0)::numeric) AS paid_amount,
            COALESCE(ap.pending, (0)::numeric) AS pending_cheques,
            COALESCE(cr.credited, (0)::numeric) AS credited_amount,
            i.billing_series
           FROM invoices i
             LEFT JOIN applied ap ON ((ap.invoice_id = i.id))
             LEFT JOIN credited cr ON ((cr.invoice_id = i.id))
             LEFT JOIN credit_policy p ON ((p.country = (i.country)::text))
          WHERE ((i.is_deleted = false) AND (COALESCE(i.status, ''::text) <> 'Cancelled'::text))
        )
 SELECT invoice_id,
    invoice_number,
    customer_id,
    salesman_id,
    country,
    invoice_date,
    credit_days,
    due_date,
    grand_total,
    paid_amount,
    pending_cheques,
    GREATEST(((grand_total - paid_amount) - credited_amount), (0)::numeric) AS outstanding,
    GREATEST((((grand_total - paid_amount) - credited_amount) - pending_cheques), (0)::numeric) AS available_to_allocate,
        CASE
            WHEN (((grand_total - paid_amount) - credited_amount) <= 0.0005) THEN 'Paid'::text
            WHEN ((((grand_total - paid_amount) - credited_amount) - pending_cheques) <= 0.0005) THEN 'Cheque pending'::text
            WHEN ((paid_amount > (0)::numeric) OR (credited_amount > (0)::numeric)) THEN 'Partly paid'::text
            ELSE 'Unpaid'::text
        END AS payment_state,
    ((((grand_total - paid_amount) - credited_amount) > 0.0005) AND (due_date < CURRENT_DATE)) AS is_overdue,
    GREATEST((CURRENT_DATE - due_date), 0) AS days_overdue,
    credited_amount,
    GREATEST(((paid_amount + credited_amount) - grand_total), (0)::numeric) AS excess_credit,
    billing_series
   FROM base b;
