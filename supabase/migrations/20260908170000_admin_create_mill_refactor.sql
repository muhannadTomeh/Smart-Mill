-- ==============================================================================
-- Migration: 20260908170000_admin_create_mill_refactor.sql
-- Goal: Redesign admin_create_mill RPC with strict 10-step atomic sequence,
--       guarantee owner_user_id is set upon insertion, enforce single-path,
--       and establish clean RLS policies for tenant isolation without affecting Platform Admin.
-- ==============================================================================

-- 1. Helper Functions: Hardened Role Checks
CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role::text = 'platform_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, anon, service_role;

-- 2. Redesigned Atomic RPC: admin_create_mill
CREATE OR REPLACE FUNCTION public.admin_create_mill(
  p_mill_name TEXT,
  p_country TEXT DEFAULT 'فلسطين',
  p_username TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL,
  p_owner_phone TEXT DEFAULT NULL,
  p_owner_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_mill_id UUID;
  v_owner_user_id UUID;
  v_clean_username TEXT;
  v_email TEXT;
BEGIN
  -- -------------------------------------------------------------
  -- STEP 1: Verify auth.uid() is truly Platform Admin from user_roles
  -- -------------------------------------------------------------
  IF v_caller_id IS NULL OR NOT public.is_platform_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Only platform admins can create mills';
  END IF;

  -- -------------------------------------------------------------
  -- STEP 2: Clean and validate username
  -- -------------------------------------------------------------
  v_clean_username := lower(trim(p_username));
  IF v_clean_username IS NULL OR v_clean_username = '' THEN
    RAISE EXCEPTION 'يرجى إدخال اسم مستخدم صالح';
  END IF;

  -- Remove any invalid characters
  v_clean_username := regexp_replace(v_clean_username, '[^a-z0-9_.-]', '', 'g');
  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية أو أرقام فقط';
  END IF;

  -- Clean orphaned memberships from previously deleted mills to free usernames
  DELETE FROM public.mill_memberships 
  WHERE mill_id IS NULL OR mill_id NOT IN (SELECT id FROM public.mills);

  -- Check if username is already taken by an active mill
  IF EXISTS (
    SELECT 1 FROM public.mill_memberships mm
    JOIN public.mills m ON mm.mill_id = m.id
    WHERE lower(mm.username) = v_clean_username
  ) THEN
    RAISE EXCEPTION 'اسم المستخدم "%" مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر', v_clean_username;
  END IF;

  v_email := v_clean_username || '@smartmill.com';

  -- -------------------------------------------------------------
  -- STEP 3 & 4: Create or find Auth User and acquire owner_user_id
  -- -------------------------------------------------------------
  SELECT id INTO v_owner_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_owner_user_id IS NULL THEN
    v_owner_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      v_owner_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      extensions.crypt(COALESCE(p_password, '12345678'), extensions.gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'display_name', p_owner_name,
        'mill_name', p_mill_name,
        'username', v_clean_username,
        'phone', p_owner_phone,
        'country', p_country
      ),
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_owner_user_id AND provider = 'email') THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_owner_user_id,
        jsonb_build_object('sub', v_owner_user_id::text, 'email', v_email),
        'email',
        v_owner_user_id::text,
        now(),
        now(),
        now()
      );
    END IF;
  ELSE
    -- If user already exists in auth.users (e.g. from previously deleted mill),
    -- safeguard: NEVER allow taking over a Platform Admin account!
    IF public.is_platform_admin(v_owner_user_id) THEN
      RAISE EXCEPTION 'لا يمكن ربط معصرة بحساب المشرف العام';
    END IF;

    -- Update password and user metadata
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(COALESCE(p_password, '12345678'), extensions.gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object(
          'display_name', p_owner_name,
          'mill_name', p_mill_name,
          'username', v_clean_username,
          'phone', p_owner_phone,
          'country', p_country
        ),
        updated_at = now()
    WHERE id = v_owner_user_id;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_owner_user_id AND provider = 'email') THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_owner_user_id,
        jsonb_build_object('sub', v_owner_user_id::text, 'email', v_email),
        'email',
        v_owner_user_id::text,
        now(),
        now(),
        now()
      );
    END IF;
  END IF;

  -- -------------------------------------------------------------
  -- STEP 5: Create new Mill with owner_user_id explicitly set
  -- -------------------------------------------------------------
  INSERT INTO public.mills (
    name, country, phone, secondary_phone, subscription_status,
    owner_user_id, mill_code, created_at, updated_at
  ) VALUES (
    p_mill_name, p_country, p_owner_phone, p_owner_email, 'active',
    v_owner_user_id, v_clean_username, now(), now()
  )
  RETURNING id INTO v_mill_id;

  -- -------------------------------------------------------------
  -- STEP 6: Create or update profiles
  -- -------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_owner_user_id) THEN
    UPDATE public.profiles
    SET mill_name = p_mill_name,
        display_name = p_owner_name,
        phone = p_owner_phone,
        secondary_phone = p_owner_email,
        country = p_country,
        mill_code = v_clean_username,
        subscription_status = 'active',
        parent_mill_id = NULL,
        updated_at = now()
    WHERE user_id = v_owner_user_id;
  ELSE
    INSERT INTO public.profiles (
      user_id, display_name, mill_name, phone, secondary_phone, country,
      mill_code, subscription_status, created_at, updated_at
    ) VALUES (
      v_owner_user_id, p_owner_name, p_mill_name, p_owner_phone, p_owner_email, p_country,
      v_clean_username, 'active', now(), now()
    );
  END IF;

  -- -------------------------------------------------------------
  -- STEP 7: Create mill_memberships (mill_id, user_id, role='mill_owner')
  -- -------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE user_id = v_owner_user_id) THEN
    UPDATE public.mill_memberships
    SET mill_id = v_mill_id,
        role = 'mill_owner',
        display_username = p_owner_name,
        username = v_clean_username,
        updated_at = now()
    WHERE user_id = v_owner_user_id;
  ELSE
    INSERT INTO public.mill_memberships (
      mill_id, user_id, role, username, display_username, created_at, updated_at
    ) VALUES (
      v_mill_id, v_owner_user_id, 'mill_owner', v_clean_username, p_owner_name, now(), now()
    );
  END IF;

  -- -------------------------------------------------------------
  -- STEP 8: Create user_roles (user_id, role='mill_owner')
  -- -------------------------------------------------------------
  -- Ensure platform admin role is NEVER removed or changed
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_owner_user_id AND role::text = 'mill_owner') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_owner_user_id, 'mill_owner');
  END IF;

  -- -------------------------------------------------------------
  -- STEP 9: Initialize settings for the Mill
  -- -------------------------------------------------------------
  -- Clean any legacy unique constraint on user_id if present
  BEGIN
    EXECUTE 'ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_user_id_key';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Clean any orphaned settings for this user/mill
  DELETE FROM public.settings 
  WHERE mill_id = v_mill_id 
     OR (user_id = v_owner_user_id AND (mill_id IS NULL OR mill_id NOT IN (SELECT id FROM public.mills)));

  IF EXISTS (SELECT 1 FROM public.settings WHERE mill_id = v_mill_id) THEN
    UPDATE public.settings
    SET user_id = v_owner_user_id, updated_at = now()
    WHERE mill_id = v_mill_id;
  ELSE
    INSERT INTO public.settings (mill_id, user_id, created_at, updated_at)
    VALUES (v_mill_id, v_owner_user_id, now(), now());
  END IF;

  -- -------------------------------------------------------------
  -- STEP 10: Return atomic result
  -- -------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'mill_id', v_mill_id,
    'user_id', v_owner_user_id,
    'username', v_clean_username,
    'email', v_email
  );
END;
$$;

-- 3. Security Hardening for admin_create_mill
-- Revoke all permissions from anon and PUBLIC
REVOKE EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
-- Grant exclusively to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Rebuild Clean Row Level Security (RLS) Policies
-- Enable RLS on core tenant tables
ALTER TABLE public.mills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mill_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- RLS: public.mills
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "platform_admin_full_access_mills" ON public.mills;
DROP POLICY IF EXISTS "mill_owner_select_mills" ON public.mills;
DROP POLICY IF EXISTS "mill_owner_update_mills" ON public.mills;
DROP POLICY IF EXISTS "mill_employee_select_mills" ON public.mills;

-- Platform Admin can manage all mills
CREATE POLICY "platform_admin_full_access_mills"
  ON public.mills FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Mill Owner can view and update their own mill
CREATE POLICY "mill_owner_select_mills"
  ON public.mills FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid() OR
    id IN (SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "mill_owner_update_mills"
  ON public.mills FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid() OR id IN (SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid() AND role = 'mill_owner'))
  WITH CHECK (owner_user_id = auth.uid() OR id IN (SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid() AND role = 'mill_owner'));

-- -------------------------------------------------------------
-- RLS: public.mill_memberships
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "platform_admin_full_access_memberships" ON public.mill_memberships;
DROP POLICY IF EXISTS "mill_owner_manage_memberships" ON public.mill_memberships;
DROP POLICY IF EXISTS "users_view_own_membership" ON public.mill_memberships;

-- Platform Admin can view and manage all memberships
CREATE POLICY "platform_admin_full_access_memberships"
  ON public.mill_memberships FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Mill Owner can manage memberships within their own mill
CREATE POLICY "mill_owner_manage_memberships"
  ON public.mill_memberships FOR ALL
  TO authenticated
  USING (
    mill_id IN (
      SELECT mill_id FROM public.mill_memberships
      WHERE user_id = auth.uid() AND role = 'mill_owner'
    )
  )
  WITH CHECK (
    mill_id IN (
      SELECT mill_id FROM public.mill_memberships
      WHERE user_id = auth.uid() AND role = 'mill_owner'
    )
  );

-- Users can view their own membership
CREATE POLICY "users_view_own_membership"
  ON public.mill_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------
-- RLS: public.profiles
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "platform_admin_full_access_profiles" ON public.profiles;
DROP POLICY IF EXISTS "users_manage_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "mill_owner_view_mill_profiles" ON public.profiles;

-- Platform Admin can view and manage all profiles
CREATE POLICY "platform_admin_full_access_profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Users can view and update their own profile
CREATE POLICY "users_manage_own_profile"
  ON public.profiles FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Mill Owner can view profiles of their mill employees
CREATE POLICY "mill_owner_view_mill_profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT mm.user_id FROM public.mill_memberships mm
      WHERE mm.mill_id IN (
        SELECT my_mm.mill_id FROM public.mill_memberships my_mm
        WHERE my_mm.user_id = auth.uid() AND my_mm.role = 'mill_owner'
      )
    )
  );

-- -------------------------------------------------------------
-- RLS: public.user_roles
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "platform_admin_full_access_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "users_read_own_user_roles" ON public.user_roles;

-- Platform Admin full access on user_roles
CREATE POLICY "platform_admin_full_access_user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Authenticated users can read their own roles
CREATE POLICY "users_read_own_user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------
-- RLS: public.settings
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "platform_admin_full_access_settings" ON public.settings;
DROP POLICY IF EXISTS "mill_members_access_settings" ON public.settings;

-- Platform Admin full access on settings
CREATE POLICY "platform_admin_full_access_settings"
  ON public.settings FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Mill members (owner/employee) can access their mill settings
CREATE POLICY "mill_members_access_settings"
  ON public.settings FOR ALL
  TO authenticated
  USING (
    mill_id IN (SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid()) OR
    user_id = auth.uid()
  )
  WITH CHECK (
    mill_id IN (SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid()) OR
    user_id = auth.uid()
  );
