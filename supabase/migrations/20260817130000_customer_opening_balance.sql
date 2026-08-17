-- Add opening_balance column to public.customers if not exists
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;

-- Populate opening_balance from existing imported pending_balance values
UPDATE public.customers
SET opening_balance = pending_balance
WHERE opening_balance = 0 AND pending_balance <> 0;
