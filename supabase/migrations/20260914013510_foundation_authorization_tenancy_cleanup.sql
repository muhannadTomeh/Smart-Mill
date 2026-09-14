-- Foundation cleanup: canonical identity and tenant authorization.
-- A non-platform user is authorized only through an active mill_memberships row.

CREATE OR REPLACE FUNCTION public.can_access_mill_data(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.mill_memberships caller
    JOIN public.mill_memberships target ON target.mill_id = caller.mill_id
    WHERE caller.user_id = auth.uid()
      AND caller.is_active = true
      AND target.user_id = p_owner_user_id
      AND target.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_mill_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mill_id
  FROM public.mill_memberships
  WHERE user_id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_owned_mill_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mill_id
  FROM public.mill_memberships
  WHERE user_id = auth.uid() AND role = 'mill_owner' AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_accessible_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT target.user_id
  FROM public.mill_memberships caller
  JOIN public.mill_memberships target ON target.mill_id = caller.mill_id
  WHERE caller.user_id = auth.uid()
    AND caller.role = 'mill_owner'
    AND caller.is_active = true
    AND target.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_my_effective_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_mill_owner_of(_mill_id uuid, _uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_uid)
  OR EXISTS (
    SELECT 1
    FROM public.mill_memberships
    WHERE mill_id = _mill_id
      AND user_id = _uid
      AND role = 'mill_owner'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.set_admin_pin(new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE caller_uid uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE user_id = caller_uid AND role = 'mill_owner' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'MILL_OWNER_REQUIRED';
  END IF;
  IF new_pin IS NULL OR NOT (new_pin ~ '^[0-9]{4,8}$') THEN
    RAISE EXCEPTION 'INVALID_ADMIN_PIN';
  END IF;
  UPDATE public.profiles
  SET admin_pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf')),
      report_pin = NULL,
      employee_pin = NULL,
      updated_at = now()
  WHERE user_id = caller_uid;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_pin(input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE caller_uid uuid := auth.uid();
DECLARE stored_hash text;
BEGIN
  IF caller_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE user_id = caller_uid AND role = 'mill_owner' AND is_active = true
  ) THEN
    RETURN false;
  END IF;
  SELECT admin_pin_hash INTO stored_hash FROM public.profiles WHERE user_id = caller_uid;
  RETURN stored_hash IS NOT NULL AND stored_hash = extensions.crypt(input_pin, stored_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_cashier_by_username(p_username text)
RETURNS TABLE(found_email text, ambiguous boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_clean text := lower(trim(coalesce(p_username, '')));
DECLARE v_match_count int;
DECLARE v_result_email text;
BEGIN
  IF v_clean = '' OR length(v_clean) < 2 THEN RETURN; END IF;
  SELECT count(DISTINCT u.email), min(u.email)
  INTO v_match_count, v_result_email
  FROM public.mill_memberships mm
  JOIN auth.users u ON u.id = mm.user_id
  WHERE (lower(mm.username) = v_clean OR lower(mm.display_username) = v_clean)
    AND mm.role = 'mill_employee'
    AND mm.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id AND ur.role::text = 'platform_admin'
    );
  IF v_match_count > 1 THEN RETURN QUERY SELECT NULL::text, true;
  ELSIF v_match_count = 1 THEN RETURN QUERY SELECT v_result_email, false;
  END IF;
END;
$$;

-- Repair all active lifecycle commands that still named the retired `employee` role.
DO $$
DECLARE fn record;
DECLARE definition text;
BEGIN
  FOR fn IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%ARRAY[''mill_owner'',''employee'']%'
  LOOP
    definition := replace(
      pg_get_functiondef(fn.oid),
      'ARRAY[''mill_owner'', ''employee'']',
      'ARRAY[''mill_owner'', ''mill_employee'']'
    );
    definition := replace(
      definition,
      'ARRAY[''mill_owner'',''employee'']',
      'ARRAY[''mill_owner'',''mill_employee'']'
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_mill_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_accessible_user_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_mill_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_owned_mill_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_effective_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_mill_owner_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_admin_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_cashier_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_mill_data(uuid), public.get_auth_user_accessible_user_ids(), public.get_auth_user_mill_ids(), public.get_auth_user_owned_mill_ids(), public.get_my_effective_user_id(), public.is_mill_owner_of(uuid, uuid), public.set_admin_pin(text), public.verify_admin_pin(text), public.lookup_cashier_by_username(text) TO authenticated;
