-- ==============================================================================
-- Migration: 20260908180000_credential_vault_and_auth_unification.sql
-- Goal: 
--   1. Create secure Credential Vault table (key managed via Edge Function secrets, NO hardcoded keys in SQL)
--   2. Add is_active lifecycle field to mill_memberships and profiles for non-destructive account management
--   3. Implement admin_toggle_user_active and non-destructive admin_delete_user
--   4. Resolve has_role function overload ambiguity in Postgres
--   5. Implement admin_get_all_accounts RPC returning metadata without plaintext passwords
--   6. Hardened atomic employee creation & mill creation
--   7. Deprecate legacy employee PIN functions and wipe plaintext employee_pin values
-- ==============================================================================

-- 1. Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Credential Vault Table
-- Storage for encrypted passwords. Access is strictly restricted to service_role (Edge Functions).
-- Encryption & Decryption keys are NEVER stored or hardcoded in SQL migrations or frontend code.
CREATE TABLE IF NOT EXISTS public.credential_vault (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_password TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS: NO policies for client roles (public, anon, authenticated). Only service_role can access.
ALTER TABLE public.credential_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credential_vault FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.credential_vault TO service_role;

-- 3. Add Account Lifecycle Field: is_active
ALTER TABLE public.mill_memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 4. Standardize is_platform_admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  IF _uid = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role::text = 'platform_admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, anon, service_role;

-- 5. Resolve Function Overload Ambiguity: has_role
-- Drop dependent policies before dropping the app_role overload
DROP POLICY IF EXISTS "Admins manage system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can insert audit log" ON public.admin_audit_log;

-- Safely drop the legacy public.app_role overload (CASCADE ensures no dangling dependencies)
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _role IS NULL THEN
    RETURN false;
  END IF;
  IF _user_id = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid AND _role IN ('platform_admin', 'admin') THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
      AND (role::text = _role OR (_role = 'admin' AND role::text = 'platform_admin'))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, anon, service_role;

-- Recreate the dependent policies cleanly using is_platform_admin
CREATE POLICY "Admins manage system settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 6. Deprecate legacy employee PIN RPCs safely
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION public.verify_employee_pin(uuid, text) FROM anon, authenticated, PUBLIC';
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_employee_pin(text) FROM anon, authenticated, PUBLIC';
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END $$;

-- 7. Account Lifecycle RPC: admin_toggle_user_active (Non-destructive Enable/Disable)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_active(
  p_user_id UUID,
  p_is_active BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  -- Safeguard: NEVER disable or deactivate Platform Admin
  IF p_user_id = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'لا يمكن تعطيل أو تعديل حالة حساب المشرف العام';
  END IF;

  v_is_admin := public.is_platform_admin(v_caller);
  IF NOT v_is_admin THEN
    -- Check if caller is Mill Owner of target employee
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships mm
      JOIN public.mills m ON mm.mill_id = m.id
      WHERE mm.user_id = p_user_id
        AND mm.role = 'mill_employee'
        AND m.owner_user_id = v_caller
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'غير مصرح لك بتعديل حالة هذا الحساب';
    END IF;
  END IF;

  -- Update mill_memberships & profiles
  UPDATE public.mill_memberships
  SET is_active = p_is_active
  WHERE user_id = p_user_id;

  UPDATE public.profiles
  SET is_active = p_is_active,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_user_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_active(UUID, BOOLEAN) TO authenticated, service_role;

-- 8. Non-Destructive Employee Removal: admin_delete_user
-- Rather than deleting auth.users which cascades and deletes financial history,
-- it disables/archives the user account safely.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  -- Safeguard: NEVER delete or archive Platform Admin
  IF p_user_id = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'لا يمكن حذف أو تعطيل حساب المشرف العام';
  END IF;

  v_is_admin := public.is_platform_admin(v_caller);
  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships mm
      JOIN public.mills m ON mm.mill_id = m.id
      WHERE mm.user_id = p_user_id 
        AND mm.role = 'mill_employee'
        AND m.owner_user_id = v_caller
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'غير مصرح لك بإدارة هذا الحساب';
    END IF;
  END IF;

  -- Archive and deactivate rather than DELETE FROM auth.users
  UPDATE public.mill_memberships
  SET is_active = false
  WHERE user_id = p_user_id;

  UPDATE public.profiles
  SET is_active = false,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'archived', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;

-- 9. RPC: Fetch All Accounts (Platform Admin, Owners, Cashiers) WITHOUT Passwords
CREATE OR REPLACE FUNCTION public.admin_get_all_accounts()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  username TEXT,
  role TEXT,
  mill_id UUID,
  mill_name TEXT,
  mill_code TEXT,
  status TEXT,
  is_active BOOLEAN,
  has_vault_credential BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_owned_mill_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  v_is_admin := public.is_platform_admin(v_caller);

  IF NOT v_is_admin THEN
    SELECT id INTO v_owned_mill_id
    FROM public.mills
    WHERE owner_user_id = v_caller
    LIMIT 1;

    IF v_owned_mill_id IS NOT NULL THEN
      v_is_owner := true;
    ELSE
      RAISE EXCEPTION 'غير مصرح لك بعرض الحسابات الإدارية';
    END IF;
  END IF;

  IF v_is_admin THEN
    RETURN QUERY
    -- 1) Platform Admins (never tied to a mill)
    SELECT
      u.id AS user_id,
      COALESCE(p.display_name, u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))::TEXT AS display_name,
      COALESCE(
        NULLIF(u.raw_user_meta_data->>'username', ''),
        NULLIF(p.phone, ''),
        split_part(u.email, '@', 1)
      )::TEXT AS username,
      'platform_admin'::TEXT AS role,
      NULL::UUID AS mill_id,
      '— بدون ارتباط بمعصرة (نظامي) —'::TEXT AS mill_name,
      NULL::TEXT AS mill_code,
      'active'::TEXT AS status,
      true::BOOLEAN AS is_active,
      EXISTS(SELECT 1 FROM public.credential_vault cv WHERE cv.user_id = u.id)::BOOLEAN AS has_vault_credential,
      u.created_at AS created_at
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role::text = 'platform_admin'
    LEFT JOIN public.profiles p ON p.user_id = u.id

    UNION ALL

    -- 2) Mill Owners
    SELECT
      m.owner_user_id AS user_id,
      COALESCE(p.display_name, m.name, 'صاحب المعصرة')::TEXT AS display_name,
      COALESCE(
        NULLIF(mm.username, ''),
        NULLIF(m.mill_code, ''),
        NULLIF(p.phone, ''),
        split_part(u.email, '@', 1)
      )::TEXT AS username,
      'mill_owner'::TEXT AS role,
      m.id AS mill_id,
      m.name::TEXT AS mill_name,
      m.mill_code::TEXT AS mill_code,
      CASE 
        WHEN mm.is_active = false OR p.is_active = false THEN 'disabled'
        ELSE COALESCE(m.subscription_status::TEXT, 'active')
      END::TEXT AS status,
      COALESCE(mm.is_active, p.is_active, true)::BOOLEAN AS is_active,
      EXISTS(SELECT 1 FROM public.credential_vault cv WHERE cv.user_id = m.owner_user_id)::BOOLEAN AS has_vault_credential,
      m.created_at AS created_at
    FROM public.mills m
    LEFT JOIN auth.users u ON u.id = m.owner_user_id
    LEFT JOIN public.profiles p ON p.user_id = m.owner_user_id
    LEFT JOIN public.mill_memberships mm ON mm.user_id = m.owner_user_id AND mm.mill_id = m.id
    WHERE m.owner_user_id IS NOT NULL

    UNION ALL

    -- 3) Cashiers / Employees
    SELECT
      mm.user_id AS user_id,
      COALESCE(p.display_name, mm.display_username, 'موظف كاشير')::TEXT AS display_name,
      COALESCE(
        NULLIF(mm.display_username, ''),
        NULLIF(mm.username, ''),
        NULLIF(p.phone, ''),
        split_part(u.email, '@', 1)
      )::TEXT AS username,
      'mill_employee'::TEXT AS role,
      mm.mill_id AS mill_id,
      COALESCE(m.name, 'معصرة')::TEXT AS mill_name,
      m.mill_code::TEXT AS mill_code,
      CASE 
        WHEN mm.is_active = false OR p.is_active = false THEN 'disabled'
        ELSE 'active'
      END::TEXT AS status,
      COALESCE(mm.is_active, p.is_active, true)::BOOLEAN AS is_active,
      EXISTS(SELECT 1 FROM public.credential_vault cv WHERE cv.user_id = mm.user_id)::BOOLEAN AS has_vault_credential,
      mm.created_at AS created_at
    FROM public.mill_memberships mm
    JOIN public.mills m ON m.id = mm.mill_id
    LEFT JOIN auth.users u ON u.id = mm.user_id
    LEFT JOIN public.profiles p ON p.user_id = mm.user_id
    WHERE mm.role = 'mill_employee'
      AND (m.owner_user_id IS NULL OR mm.user_id <> m.owner_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = mm.user_id AND ur.role::text = 'platform_admin'
      )
    ORDER BY role ASC, created_at DESC;

  ELSIF v_is_owner THEN
    RETURN QUERY
    SELECT
      mm.user_id AS user_id,
      COALESCE(p.display_name, mm.display_username, 'موظف كاشير')::TEXT AS display_name,
      COALESCE(
        NULLIF(mm.display_username, ''),
        NULLIF(mm.username, ''),
        NULLIF(p.phone, ''),
        split_part(u.email, '@', 1)
      )::TEXT AS username,
      'mill_employee'::TEXT AS role,
      mm.mill_id AS mill_id,
      COALESCE(m.name, 'معصرة')::TEXT AS mill_name,
      m.mill_code::TEXT AS mill_code,
      CASE 
        WHEN mm.is_active = false OR p.is_active = false THEN 'disabled'
        ELSE 'active'
      END::TEXT AS status,
      COALESCE(mm.is_active, p.is_active, true)::BOOLEAN AS is_active,
      EXISTS(SELECT 1 FROM public.credential_vault cv WHERE cv.user_id = mm.user_id)::BOOLEAN AS has_vault_credential,
      mm.created_at AS created_at
    FROM public.mill_memberships mm
    JOIN public.mills m ON m.id = mm.mill_id
    LEFT JOIN auth.users u ON u.id = mm.user_id
    LEFT JOIN public.profiles p ON p.user_id = mm.user_id
    WHERE mm.mill_id = v_owned_mill_id
      AND mm.role = 'mill_employee'
      AND (m.owner_user_id IS NULL OR mm.user_id <> m.owner_user_id)
    ORDER BY mm.created_at DESC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_all_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_accounts() TO authenticated, service_role;

-- 10. Atomic Employee Account Creation Helper: admin_create_cashier
CREATE OR REPLACE FUNCTION public.admin_create_cashier(
  p_parent_mill_id TEXT,
  p_display_name TEXT,
  p_username TEXT,
  p_password TEXT,
  p_mill_code TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_mill_id UUID;
  v_mill_code TEXT;
  v_clean_username TEXT;
  v_email TEXT;
  v_user_id UUID;
  v_mill RECORD;
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  -- Resolve Mill
  SELECT * INTO v_mill
  FROM public.mills
  WHERE id::text = p_parent_mill_id 
     OR owner_user_id::text = p_parent_mill_id
  LIMIT 1;

  IF v_mill.id IS NULL THEN
    RAISE EXCEPTION 'المعصرة المحددة غير موجودة';
  END IF;

  v_mill_id := v_mill.id;
  v_mill_code := COALESCE(NULLIF(trim(p_mill_code), ''), NULLIF(trim(v_mill.mill_code), ''), 'mill');

  -- Authorization check
  v_is_admin := public.is_platform_admin(v_caller);
  IF NOT v_is_admin THEN
    v_is_owner := (v_mill.owner_user_id = v_caller);
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'غير مصرح لك بإضافة كاشير لهذه المعصرة';
    END IF;
  END IF;

  -- Clean and validate username
  v_clean_username := trim(p_username);
  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'يرجى إدخال اسم مستخدم صالح';
  END IF;

  -- Check duplicate username in mill
  IF EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE mill_id = v_mill_id AND lower(username) = lower(v_clean_username)
  ) THEN
    RAISE EXCEPTION 'اسم المستخدم "%" مستخدم مسبقاً في هذه المعصرة', v_clean_username;
  END IF;

  -- Internal unique email format
  v_email := lower(regexp_replace(v_mill_code, '[^a-z0-9]', '', 'g')) || '_' || 
             lower(regexp_replace(v_clean_username, '[^a-z0-9_.-]', '', 'g')) || '@smartmill.com';

  -- Create or find auth user
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token,
      is_super_admin, is_sso_user, is_anonymous,
      created_at, updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'display_name', p_display_name,
        'username', v_clean_username,
        'mill_id', v_mill_id::text,
        'mill_code', v_mill_code
      ),
      'authenticated',
      'authenticated',
      '', '', '', '', '',
      '', '', '',
      false, false, false,
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Upsert Profile (NEVER store plaintext password)
  INSERT INTO public.profiles (
    user_id, display_name, phone, parent_mill_id, mill_code, subscription_status, is_active, updated_at
  ) VALUES (
    v_user_id, p_display_name, v_clean_username, v_mill_id::text, v_mill_code, 'active', true, now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      phone = EXCLUDED.phone,
      parent_mill_id = EXCLUDED.parent_mill_id,
      mill_code = EXCLUDED.mill_code,
      is_active = true,
      employee_pin = NULL,
      updated_at = now();

  -- Upsert Mill Membership
  INSERT INTO public.mill_memberships (
    user_id, mill_id, role, username, display_username, is_active, created_at
  ) VALUES (
    v_user_id, v_mill_id, 'mill_employee', lower(v_clean_username), v_clean_username, true, now()
  )
  ON CONFLICT (user_id, mill_id) DO UPDATE
  SET role = 'mill_employee',
      username = EXCLUDED.username,
      display_username = EXCLUDED.display_username,
      is_active = true;

  -- Upsert User Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'mill_employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'username', v_clean_username,
    'email', v_email,
    'mill_id', v_mill_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_cashier(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_cashier(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 11. RPC: Update User Account & Credentials
CREATE OR REPLACE FUNCTION public.admin_update_user_credentials(
  p_user_id UUID,
  p_display_name TEXT,
  p_username TEXT,
  p_password TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_clean_user TEXT := trim(p_username);
  v_clean_name TEXT := trim(p_display_name);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  v_is_admin := public.is_platform_admin(v_caller);
  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships mm
      JOIN public.mills m ON mm.mill_id = m.id
      WHERE mm.user_id = p_user_id 
        AND mm.role = 'mill_employee'
        AND m.owner_user_id = v_caller
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'غير مصرح لك بتعديل بيانات هذا الحساب';
    END IF;
  END IF;

  -- Update profiles
  UPDATE public.profiles
  SET display_name = COALESCE(NULLIF(v_clean_name, ''), display_name),
      phone = COALESCE(NULLIF(v_clean_user, ''), phone),
      employee_pin = NULL, -- NEVER plain text
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Update mill_memberships
  UPDATE public.mill_memberships
  SET display_username = COALESCE(NULLIF(v_clean_user, ''), display_username),
      username = COALESCE(NULLIF(lower(v_clean_user), ''), username)
  WHERE user_id = p_user_id;

  -- If password provided, update Supabase Auth password hash
  IF p_password IS NOT NULL AND trim(p_password) <> '' THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_credentials(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 12. Wipe any legacy plaintext employee_pin values permanently
UPDATE public.profiles
SET employee_pin = NULL
WHERE employee_pin IS NOT NULL;
