-- Migration: 20260911000000_credential_vault_admin_pin.sql
-- Description: Unified, secure credential management with Admin PIN and encrypted vault support.

-- 1. Add encrypted_admin_pin column to credential_vault if not exists
ALTER TABLE public.credential_vault 
ADD COLUMN IF NOT EXISTS encrypted_admin_pin TEXT NULL;

-- Allow storing password or PIN independently
ALTER TABLE public.credential_vault ALTER COLUMN encrypted_password DROP NOT NULL;
ALTER TABLE public.credential_vault ALTER COLUMN encryption_version SET DEFAULT 'aes-256-gcm';
ALTER TABLE public.credential_vault ALTER COLUMN encryption_version DROP NOT NULL;

-- 2. Add admin_pin_hash to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS admin_pin_hash TEXT NULL;

-- 3. Ensure pgcrypto extension is active for crypt() and gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 4. Initialize admin_pin_hash for existing mill owners who do not have one yet (default '123456')
UPDATE public.profiles p
SET admin_pin_hash = extensions.crypt('123456', extensions.gen_salt('bf'))
WHERE p.admin_pin_hash IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.mill_memberships m
      WHERE m.user_id = p.user_id AND m.role = 'mill_owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.mills mil
      WHERE mil.owner_user_id = p.user_id
    )
  );

-- 5. Nullify legacy plaintext PIN columns in profiles so no plaintext credentials remain
UPDATE public.profiles
SET report_pin = NULL, employee_pin = NULL
WHERE report_pin IS NOT NULL OR employee_pin IS NOT NULL;

-- 6. Create RPC verify_admin_pin
CREATE OR REPLACE FUNCTION public.verify_admin_pin(input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller_uid uuid;
  is_owner boolean := false;
  stored_hash text;
BEGIN
  caller_uid := auth.uid();
  IF caller_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Verify caller is a mill_owner (Employees are strictly rejected)
  SELECT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE user_id = caller_uid AND role = 'mill_owner' AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.mills
    WHERE owner_user_id = caller_uid
  ) INTO is_owner;

  IF NOT is_owner THEN
    RETURN false;
  END IF;

  -- Fetch stored admin PIN hash
  SELECT admin_pin_hash INTO stored_hash
  FROM public.profiles
  WHERE user_id = caller_uid;

  -- If no hash set yet, check default '123456' and initialize hash
  IF stored_hash IS NULL THEN
    IF input_pin = '123456' THEN
      UPDATE public.profiles
      SET admin_pin_hash = extensions.crypt('123456', extensions.gen_salt('bf'))
      WHERE user_id = caller_uid;
      RETURN true;
    ELSE
      RETURN false;
    END IF;
  END IF;

  -- Compare hash with bcrypt
  RETURN stored_hash = extensions.crypt(input_pin, stored_hash);
END;
$$;

-- 7. Create RPC set_admin_pin
CREATE OR REPLACE FUNCTION public.set_admin_pin(new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller_uid uuid;
  is_owner boolean := false;
BEGIN
  caller_uid := auth.uid();
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً';
  END IF;

  -- Verify caller is a mill_owner
  SELECT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE user_id = caller_uid AND role = 'mill_owner' AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.mills
    WHERE owner_user_id = caller_uid
  ) INTO is_owner;

  IF NOT is_owner THEN
    RAISE EXCEPTION 'غير مصرح: هذه الميزة مخصصة لمالك المعصرة فقط';
  END IF;

  -- Validate format: 4 to 8 digits
  IF new_pin IS NULL OR NOT (new_pin ~ '^[0-9]{4,8}$') THEN
    RAISE EXCEPTION 'رمز PIN غير صالح: يجب أن يتكون من 4 إلى 8 أرقام فقط';
  END IF;

  -- Update profiles with bcrypt hash and clear legacy fields
  UPDATE public.profiles
  SET 
    admin_pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf')),
    report_pin = NULL,
    employee_pin = NULL,
    updated_at = now()
  WHERE user_id = caller_uid;

  RETURN true;
END;
$$;

-- Secure verify_admin_pin and set_admin_pin permissions: authenticated ONLY (revoke PUBLIC & anon)
REVOKE ALL ON FUNCTION public.verify_admin_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_admin_pin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_admin_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_pin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(text) TO authenticated;

-- 8. Create RPC admin_set_user_pin (strictly for privileged service_role and platform_admin)
CREATE OR REPLACE FUNCTION public.admin_set_user_pin(target_user_id uuid, new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller_role text;
  caller_uid uuid;
BEGIN
  -- Defense in depth: strictly enforce caller is service_role OR canonical platform_admin
  caller_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    auth.role(),
    current_user
  );
  caller_uid := auth.uid();

  IF caller_role != 'service_role' AND current_user != 'service_role' THEN
    IF caller_uid IS NULL OR NOT (
      caller_uid = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'
      OR EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = caller_uid AND role = 'platform_admin'
      )
    ) THEN
      RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لخادم النظام (service_role) والمشرف العام فقط';
    END IF;
  END IF;

  IF new_pin IS NULL OR NOT (new_pin ~ '^[0-9]{4,8}$') THEN
    RAISE EXCEPTION 'رمز PIN غير صالح: يجب أن يتكون من 4 إلى 8 أرقام فقط';
  END IF;

  UPDATE public.profiles
  SET 
    admin_pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf')),
    report_pin = NULL,
    employee_pin = NULL,
    updated_at = now()
  WHERE user_id = target_user_id;

  RETURN true;
END;
$$;

-- Secure admin_set_user_pin permissions: service_role ONLY (revoke PUBLIC, anon, and authenticated)
REVOKE ALL ON FUNCTION public.admin_set_user_pin(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_pin(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_user_pin(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_pin(uuid, text) TO service_role;

