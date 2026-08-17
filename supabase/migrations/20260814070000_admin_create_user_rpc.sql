-- ==============================================================================
-- MAATWEB Migration: Admin User Management & Profiles RLS Alignment
-- Target: PostgreSQL 15+ / Supabase Project (qoalkjijnxhhiqtynbri)
-- Description: 1. Full RLS policies (SELECT, INSERT, UPDATE) for public.profiles.
--              2. SECURITY DEFINER RPC function for Super Admin user creation.
--              3. SECURITY DEFINER RPC function to fetch all profiles for Super Admin.
-- ==============================================================================

-- 1. Helper function to check super admin status
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (public.get_user_role()::text = 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Profiles Table RLS (SELECT, INSERT, UPDATE)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

-- SELECT: User can view own profile; Super Admin & Accountant can view all profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT TO authenticated USING (
  id = auth.uid() OR public.get_user_role()::text IN ('super_admin', 'accountant')
);

-- INSERT: User can insert own profile; Super Admin can insert any profile
CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (
  id = auth.uid() OR public.get_user_role()::text = 'super_admin'
);

-- UPDATE: User can update own profile; Super Admin can update any profile
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE TO authenticated USING (
  id = auth.uid() OR public.get_user_role()::text = 'super_admin'
) WITH CHECK (
  id = auth.uid() OR public.get_user_role()::text = 'super_admin'
);

-- 3. Super Admin RPC to fetch all profiles
CREATE OR REPLACE FUNCTION public.get_all_profiles_for_admin()
RETURNS SETOF public.profiles AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admin can view all profiles.';
  END IF;

  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_all_profiles_for_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_profiles_for_admin() FROM anon, public;

-- 4. Super Admin RPC to create user
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_country TEXT,
  p_email TEXT,
  p_full_name TEXT,
  p_password TEXT,
  p_phone TEXT DEFAULT '',
  p_role TEXT DEFAULT 'salesperson'
) RETURNS jsonb AS $$
DECLARE
  v_caller_role TEXT;
  v_new_id UUID;
  v_encrypted_password TEXT;
  v_typed_role public.user_role;
  v_typed_country public.user_country;
  v_res jsonb;
BEGIN
  -- Validate caller is super_admin
  SELECT role::text INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admin can create accounts.';
  END IF;

  -- Validate text parameters
  IF lower(p_role) NOT IN ('super_admin', 'accountant', 'salesperson') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  
  IF p_country NOT IN ('UAE', 'Oman') THEN
    RAISE EXCEPTION 'Invalid country: %', p_country;
  END IF;

  v_typed_role := lower(p_role)::public.user_role;
  v_typed_country := p_country::public.user_country;

  -- Check for duplicate email in auth.users or profiles
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) OR
     EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'An account with this email already exists.';
  END IF;

  v_new_id := gen_random_uuid();
  v_encrypted_password := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- Insert into auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_new_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_password,
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', v_typed_role, 'country', v_typed_country),
    NOW(),
    NOW()
  );

  -- Insert into auth.identities to ensure GoTrue password authentication works properly
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email
  ) VALUES (
    gen_random_uuid(),
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email',
    v_new_id::text,
    NOW(),
    NOW(),
    NOW(),
    p_email
  ) ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Create Profile
  INSERT INTO public.profiles (
    id, full_name, email, phone, role, country, is_active, created_at, updated_at
  ) VALUES (
    v_new_id, p_full_name, p_email, COALESCE(p_phone, ''), v_typed_role, v_typed_country, true, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    country = EXCLUDED.country,
    is_active = true,
    updated_at = NOW();

  SELECT jsonb_build_object(
    'id', id,
    'full_name', full_name,
    'email', email,
    'phone', phone,
    'role', role::text,
    'country', country::text,
    'is_active', is_active
  ) INTO v_res
  FROM public.profiles
  WHERE id = v_new_id;

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text) FROM anon, public;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
