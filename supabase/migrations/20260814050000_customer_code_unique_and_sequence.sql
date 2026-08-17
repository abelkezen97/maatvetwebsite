-- Migration: 20260814050000_customer_code_unique_and_sequence.sql
-- Description: Idempotent sequence & UNIQUE constraint for concurrency-safe customer code generation.

-- 1. Create customer code sequence if not exists
CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq;

-- 2. Sync sequence value to current max numeric code
SELECT setval(
  'public.customer_code_seq',
  GREATEST(
    1,
    COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(customer_code, '\D', '', 'g'), '')::integer) FROM public.customers),
      0
    )
  ),
  true
);

-- 3. Add UNIQUE constraint on customer_code if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_code_key'
  ) THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);
  END IF;
END $$;

-- 4. Atomic customer code generator RPC function
CREATE OR REPLACE FUNCTION public.get_next_customer_code()
RETURNS TEXT AS $$
DECLARE
  v_next_val BIGINT;
  v_code TEXT;
BEGIN
  v_next_val := nextval('public.customer_code_seq');
  v_code := 'CUST-' || LPAD(v_next_val::text, 6, '0');
  RETURN v_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
