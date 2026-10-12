-- ==============================================================================
-- receipts.payment_group_id
--
-- One payment from a UAE customer can become two receipts (UAE-registered
-- first, the rest Oman-registered). They share payment_group_id, so a cheque
-- covering both is received, cleared or bounced together. Non-destructive.
-- ==============================================================================

alter table public.receipts
  add column if not exists payment_group_id uuid;

create index if not exists receipts_payment_group_idx
  on public.receipts (payment_group_id)
  where payment_group_id is not null;

notify pgrst, 'reload schema';
