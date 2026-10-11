-- ==============================================================================
-- Revoke table privileges that earlier ad-hoc scripts granted to the `anon` role.
--
-- Several one-off scripts (now removed) ran
--   GRANT ALL ON public.inventory_movements / inventory_transactions TO anon
-- directly against the live database. Row Level Security still blocked reads
-- because every policy targets `authenticated`, but `anon` should hold no
-- privileges on business tables at all. This makes that explicit and idempotent.
-- ==============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_movements', 'inventory_transactions']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
