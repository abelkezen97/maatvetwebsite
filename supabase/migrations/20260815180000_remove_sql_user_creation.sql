-- Migration: Remove legacy SQL user creation function to enforce Supabase Admin Auth API
-- Target: Supabase Postgres
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, text);
NOTIFY pgrst, 'reload schema';
