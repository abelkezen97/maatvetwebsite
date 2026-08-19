-- Migration: Add handover_type to cash_handovers
-- Description: Adds handover_type column to cash_handovers table to differentiate
--              between 'admin_handover' (handed over to Admin) and 'carry_forward' (retained cash carried forward).

ALTER TABLE public.cash_handovers
  ADD COLUMN IF NOT EXISTS handover_type TEXT NOT NULL DEFAULT 'admin_handover';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_handovers_type_check') THEN
    ALTER TABLE public.cash_handovers ADD CONSTRAINT cash_handovers_type_check CHECK (handover_type IN ('admin_handover', 'carry_forward'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
