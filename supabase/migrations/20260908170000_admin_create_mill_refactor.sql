-- ==============================================================================
-- Migration: 20260908170000_admin_create_mill_refactor.sql
-- Goal: Fix root cause of ON CONFLICT failure in on_auth_user_created_setup,
--       clean all RLS duplicate policies, make auth user creation 100% GoTrue-compatible,
--       and establish atomic admin_create_mill RPC.
-- ==============================================================================

-- ==============================================================================
-- 1. FIX ROOT CAUSE: handle_new_user_setup & Triggers on auth.users
-- ==============================================================================
-- Drop the problematic trigger on auth.users that was trying to insert settings by user_id
DROP TRIGGER IF EXISTS on_auth_user_created_setup ON auth.users;

-- Re-define handle_new_user_setup to remove settings/inventory inserts by user_id
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cat TEXT;
    categories TEXT[] := ARRAY['صيانة المعدات', 'فطور العمال', 'مواد التشحيم', 'النقل والمواصلات', 'فواتير الكهرباء', 'مواد التنظيف', 'أدوات ومستلزمات', 'أخرى'];
BEGIN
    -- Only trigger when a season is created on public.seasons
    IF TG_TABLE_NAME = 'seasons' THEN
        FOREACH cat IN ARRAY categories LOOP
            IF NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE season_id = NEW.id AND name = cat) THEN
                INSERT INTO public.expense_categories (user_id, season_id, name)
                VALUES (NEW.user_id, NEW.id, cat);
            END IF;
        END LOOP;
        
        IF NOT EXISTS (SELECT 1 FROM public.container_types WHERE season_id = NEW.id AND name = 'بلاستيك') THEN
            INSERT INTO public.container_types (user_id, season_id, name, price)
            VALUES (NEW.user_id, NEW.id, 'بلاستيك', 10);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.container_types WHERE season_id = NEW.id AND name = 'حديد') THEN
            INSERT INTO public.container_types (user_id, season_id, name, price)
            VALUES (NEW.user_id, NEW.id, 'حديد', 15);
        END IF;
            
        IF NOT EXISTS (SELECT 1 FROM public.inventory WHERE season_id = NEW.id) THEN
            INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
            VALUES (NEW.user_id, NEW.id, 0, 0);
        END IF;
    END IF;

    -- On auth.users: DO NOT insert into settings or inventory!
    -- Settings are created per mill via admin_create_mill.
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;

-- Ensure handle_new_user for profiles is idempotent and does not fail on conflict
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (user_id, display_name, mill_name, phone)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'owner_name', NEW.email),
      NEW.raw_user_meta_data->>'mill_name',
      NEW.raw_user_meta_data->>'phone'
    );
  ELSE
    UPDATE public.profiles
    SET display_name = COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'owner_name', display_name),
        mill_name = COALESCE(NEW.raw_user_meta_data->>'mill_name', mill_name),
        phone = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
        updated_at = now()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ==============================================================================
-- 2. FIX EXISTING auth.users SCAN ERRORS (Database error querying schema)
-- ==============================================================================
-- Supabase GoTrue crashes with HTTP 500 'Database error querying schema' when scanning NULL strings
UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    is_super_admin = COALESCE(is_super_admin, false),
    is_sso_user = COALESCE(is_sso_user, false),
    is_anonymous = COALESCE(is_anonymous, false),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL
   OR is_super_admin IS NULL
   OR is_sso_user IS NULL
   OR is_anonymous IS NULL
   OR email_confirmed_at IS NULL;

-- ==============================================================================
-- 3. ENSURE REQUIRED CONSTRAINTS
-- ==============================================================================
DO $$
BEGIN
    -- Drop legacy UNIQUE(user_id) on settings if exists
    ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_user_id_key;

    -- Ensure settings.mill_id UNIQUE
    DELETE FROM public.settings s1
    USING public.settings s2
    WHERE s1.mill_id = s2.mill_id AND s1.ctid < s2.ctid AND s1.mill_id IS NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'settings_mill_id_key' AND conrelid = 'public.settings'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.settings ADD CONSTRAINT settings_mill_id_key UNIQUE (mill_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- Ensure profiles.user_id UNIQUE
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_user_id_key' AND conrelid = 'public.profiles'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- Ensure mill_memberships.user_id UNIQUE
    DELETE FROM public.mill_memberships m1
    USING public.mill_memberships m2
    WHERE m1.user_id = m2.user_id AND m1.ctid < m2.ctid;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'mill_memberships_user_id_key' AND conrelid = 'public.mill_memberships'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.mill_memberships ADD CONSTRAINT mill_memberships_user_id_key UNIQUE (user_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- Ensure mill_memberships(mill_id, user_id) UNIQUE
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'mill_memberships_mill_user_key' AND conrelid = 'public.mill_memberships'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.mill_memberships ADD CONSTRAINT mill_memberships_mill_user_key UNIQUE (mill_id, user_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- Ensure user_roles(user_id, role) UNIQUE
    DELETE FROM public.user_roles r1
    USING public.user_roles r2
    WHERE r1.user_id = r2.user_id AND r1.role = r2.role AND r1.ctid < r2.ctid;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_roles_user_id_role_key' AND conrelid = 'public.user_roles'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- Ensure mills.mill_code UNIQUE
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'mills_mill_code_key' AND conrelid = 'public.mills'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.mills ADD CONSTRAINT mills_mill_code_key UNIQUE (mill_code);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;

-- ==============================================================================
-- 4. HELPER FUNCTIONS: Hardened Role Checks
-- ==============================================================================
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

-- SECURITY DEFINER helpers to eliminate RLS recursion on mill_memberships and mills
CREATE OR REPLACE FUNCTION public.get_auth_user_mill_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid()
  UNION
  SELECT id FROM public.mills WHERE owner_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_mill_ids() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_auth_user_owned_mill_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid() AND role = 'mill_owner'
  UNION
  SELECT id FROM public.mills WHERE owner_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_owned_mill_ids() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_auth_user_accessible_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT user_id FROM public.mill_memberships
  WHERE mill_id IN (
    SELECT mill_id FROM public.mill_memberships WHERE user_id = auth.uid() AND role = 'mill_owner'
    UNION
    SELECT id FROM public.mills WHERE owner_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_accessible_user_ids() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.is_mill_owner_of(_mill_id uuid, _uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mills WHERE id = _mill_id AND owner_user_id = _uid
  ) OR EXISTS (
    SELECT 1 FROM public.mill_memberships WHERE mill_id = _mill_id AND user_id = _uid AND role = 'mill_owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_mill_owner_of(uuid, uuid) TO authenticated, anon, service_role;

-- ==============================================================================
-- 5. ATOMIC RPC: admin_create_mill (GoTrue Compatible)
-- ==============================================================================
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
  -- 1. Check Platform Admin
  IF v_caller_id IS NULL OR NOT public.is_platform_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Only platform admins can create mills';
  END IF;

  -- 2. Clean and validate username
  v_clean_username := lower(trim(p_username));
  IF v_clean_username IS NULL OR v_clean_username = '' THEN
    RAISE EXCEPTION 'يرجى إدخال اسم مستخدم صالح';
  END IF;

  v_clean_username := regexp_replace(v_clean_username, '[^a-z0-9_.-]', '', 'g');
  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية أو أرقام فقط';
  END IF;

  -- Clean orphaned memberships from previously deleted mills
  DELETE FROM public.mill_memberships 
  WHERE mill_id IS NULL OR mill_id NOT IN (SELECT id FROM public.mills);

  IF EXISTS (
    SELECT 1 FROM public.mill_memberships mm
    JOIN public.mills m ON mm.mill_id = m.id
    WHERE lower(mm.username) = v_clean_username
  ) THEN
    RAISE EXCEPTION 'اسم المستخدم "%" مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر', v_clean_username;
  END IF;

  v_email := v_clean_username || '@smartmill.com';

  -- 3 & 4. Create or find Auth User (Fully compatible with GoTrue)
  SELECT id INTO v_owner_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_owner_user_id IS NULL THEN
    v_owner_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token,
      is_super_admin, is_sso_user, is_anonymous,
      created_at, updated_at
    ) VALUES (
      v_owner_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      extensions.crypt(COALESCE(p_password, '12345678'), extensions.gen_salt('bf', 10)),
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
      '', '', '', '', '',
      '', '', '',
      false, false, false,
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
    -- Safeguard: NEVER allow taking over a Platform Admin account!
    IF public.is_platform_admin(v_owner_user_id) THEN
      RAISE EXCEPTION 'لا يمكن ربط معصرة بحساب المشرف العام';
    END IF;

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(COALESCE(p_password, '12345678'), extensions.gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        reauthentication_token = COALESCE(reauthentication_token, ''),
        is_super_admin = COALESCE(is_super_admin, false),
        is_sso_user = COALESCE(is_sso_user, false),
        is_anonymous = COALESCE(is_anonymous, false),
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

  -- 5. Create new Mill with owner_user_id explicitly set upon insert
  INSERT INTO public.mills (
    name, country, phone, secondary_phone, subscription_status,
    owner_user_id, mill_code, created_at, updated_at
  ) VALUES (
    p_mill_name, p_country, p_owner_phone, p_owner_email, 'active',
    v_owner_user_id, v_clean_username, now(), now()
  )
  RETURNING id INTO v_mill_id;

  -- 6. Create or update profile
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

  -- 7. Create mill membership
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

  -- 8. Assign mill_owner role
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_owner_user_id AND role::text = 'mill_owner') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_owner_user_id, 'mill_owner');
  END IF;

  -- 9. Initialize settings for the Mill (linked via mill_id)
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

  -- 10. Return atomic result
  RETURN jsonb_build_object(
    'success', true,
    'mill_id', v_mill_id,
    'user_id', v_owner_user_id,
    'username', v_clean_username,
    'email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 6. CLEAN UP ALL DUPLICATE/OLD POLICIES AND REBUILD RLS
-- ==============================================================================
-- Drop ALL existing policies on target tables dynamically to prevent duplicate policy clashes
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' 
          AND tablename IN ('mills', 'mill_memberships', 'profiles', 'settings', 'user_roles')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- Enable RLS and grant authenticated access
ALTER TABLE public.mills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mill_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mill_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;

-- -------------------------------------------------------------
-- RLS: public.mills
-- -------------------------------------------------------------
CREATE POLICY "platform_admin_manage_mills"
  ON public.mills FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "mill_owner_select_mills"
  ON public.mills FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid() OR
    id IN (SELECT public.get_auth_user_mill_ids())
  );

CREATE POLICY "mill_owner_update_mills"
  ON public.mills FOR UPDATE
  TO authenticated
  USING (public.is_mill_owner_of(id, auth.uid()))
  WITH CHECK (public.is_mill_owner_of(id, auth.uid()));

-- -------------------------------------------------------------
-- RLS: public.mill_memberships
-- -------------------------------------------------------------
CREATE POLICY "platform_admin_manage_memberships"
  ON public.mill_memberships FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "mill_owner_manage_own_mill_memberships"
  ON public.mill_memberships FOR ALL
  TO authenticated
  USING (mill_id IN (SELECT public.get_auth_user_owned_mill_ids()))
  WITH CHECK (mill_id IN (SELECT public.get_auth_user_owned_mill_ids()));

CREATE POLICY "users_view_own_membership"
  ON public.mill_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------
-- RLS: public.profiles
-- -------------------------------------------------------------
CREATE POLICY "platform_admin_manage_profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "users_manage_own_profile"
  ON public.profiles FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mill_owner_view_mill_profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IN (SELECT public.get_auth_user_accessible_user_ids())
  );

-- -------------------------------------------------------------
-- RLS: public.user_roles
-- -------------------------------------------------------------
CREATE POLICY "platform_admin_manage_user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "users_read_own_user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------
-- RLS: public.settings
-- -------------------------------------------------------------
CREATE POLICY "platform_admin_manage_settings"
  ON public.settings FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "mill_members_manage_settings"
  ON public.settings FOR ALL
  TO authenticated
  USING (
    mill_id IN (SELECT public.get_auth_user_mill_ids()) OR
    user_id = auth.uid()
  )
  WITH CHECK (
    mill_id IN (SELECT public.get_auth_user_mill_ids()) OR
    user_id = auth.uid()
  );
