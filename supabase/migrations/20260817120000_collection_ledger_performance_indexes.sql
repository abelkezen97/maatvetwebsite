-- Migration: Collection Ledger Performance Indexes
-- Description: Adds B-Tree indexes for filtering and joining columns used in Collection Ledger without modifying RLS policies.

CREATE INDEX IF NOT EXISTS idx_receipts_created_by_paymethod
ON public.receipts(created_by, payment_method);

CREATE INDEX IF NOT EXISTS idx_receipts_payment_date
ON public.receipts(payment_date);

CREATE INDEX IF NOT EXISTS idx_expenses_sp_status_method
ON public.expenses(salesperson_id, status, payment_method);

CREATE INDEX IF NOT EXISTS idx_expenses_employee_id
ON public.expenses(employee_id);

CREATE INDEX IF NOT EXISTS idx_expenses_created_by
ON public.expenses(created_by);

CREATE INDEX IF NOT EXISTS idx_expenses_date
ON public.expenses(expense_date);

CREATE INDEX IF NOT EXISTS idx_cash_handovers_sp
ON public.cash_handovers(salesperson_id);

CREATE INDEX IF NOT EXISTS idx_cash_handovers_created_by
ON public.cash_handovers(created_by);

CREATE INDEX IF NOT EXISTS idx_cash_handovers_date
ON public.cash_handovers(handover_date);

CREATE INDEX IF NOT EXISTS idx_sp_opening_balances_sp_date
ON public.salesperson_opening_balances(salesperson_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_salesman_id
ON public.invoices(salesman_id);
