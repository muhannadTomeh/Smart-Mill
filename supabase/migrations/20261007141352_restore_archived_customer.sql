-- Restore the same archived customer row without changing any historical links.
-- Only mill owners (or the platform admin) may undo customer archival.
CREATE OR REPLACE FUNCTION public.restore_customer_command(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill_id uuid;
  v_customer_name text;
  v_updated integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_RESTORE_FORBIDDEN';
  END IF;

  SELECT mill_id, name
  INTO v_mill_id, v_customer_name
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_NOT_FOUND';
  END IF;

  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_RESTORE_FORBIDDEN';
  END IF;

  UPDATE public.customers
  SET active = true,
      updated_at = now()
  WHERE id = p_customer_id
    AND active = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'restored', v_updated = 1,
    'customer_id', p_customer_id,
    'customer_name', v_customer_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_customer_command(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_customer_command(uuid) TO authenticated;
