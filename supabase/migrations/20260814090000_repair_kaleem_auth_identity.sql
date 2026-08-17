-- ==============================================================================
-- MAATWEB Targeted Repair: Fix Missing auth.identities Record for Dr Kaleem
-- Target: PostgreSQL 15+ / Supabase (qoalkjijnxhhiqtynbri)
-- Description: Inserts missing auth.identities record for existing user ID
--              'fdcaf1cb-1b42-41ed-9ddc-1b0865d9a6d4' (kaleem@maatvet.com)
--              without deleting or altering any existing auth/profile/business data.
-- ==============================================================================

DO $$
DECLARE
  v_user_id UUID := 'fdcaf1cb-1b42-41ed-9ddc-1b0865d9a6d4'::uuid;
  v_email TEXT := 'kaleem@maatvet.com';
BEGIN
  -- 1. Ensure email_confirmed_at and confirmed_at are set on auth.users
  UPDATE auth.users
  SET 
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    confirmed_at = COALESCE(confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = v_user_id;

  -- 2. Insert missing auth.identities row for email provider
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at,
      email
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      v_user_id::text,
      NOW(),
      NOW(),
      NOW(),
      v_email
    );
  END IF;
END $$;
