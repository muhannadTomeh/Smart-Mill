CREATE OR REPLACE FUNCTION public.restore_queue_entry_command(
  p_queue_id uuid,
  p_mill_id uuid,
  p_season_id uuid,
  p_customer_id uuid,
  p_name text,
  p_phone text,
  p_bags integer,
  p_notes text,
  p_previous_status text,
  p_previous_position integer,
  p_estimated_minutes integer
)
RETURNS TABLE(queue_id uuid, restored_position integer, restored_status text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_active_count integer;
  v_position integer;
  v_status text;
  v_estimated_minutes integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_queue_id IS NULL
     OR p_mill_id IS NULL
     OR p_season_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'QUEUE_RESTORE_INVALID';
  END IF;

  IF NOT public.check_user_mill_access(p_mill_id) THEN
    RAISE EXCEPTION 'QUEUE_RESTORE_FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.seasons s
    WHERE s.id = p_season_id
      AND s.mill_id = p_mill_id
  ) THEN
    RAISE EXCEPTION 'SEASON_MILL_MISMATCH';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.mill_id = p_mill_id
  ) THEN
    RAISE EXCEPTION 'QUEUE_CUSTOMER_TENANT_MISMATCH';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_mill_id::text),
    pg_catalog.hashtext(p_season_id::text)
  );

  IF EXISTS (SELECT 1 FROM public.queue q WHERE q.id = p_queue_id) THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_ALREADY_EXISTS';
  END IF;

  -- Normalize the current active sequence before reopening the saved position.
  WITH ranked AS (
    SELECT
      q.id,
      pg_catalog.row_number() OVER (
        ORDER BY q.position NULLS LAST, q.created_at, q.id
      )::integer AS new_position
    FROM public.queue q
    WHERE q.mill_id = p_mill_id
      AND q.season_id = p_season_id
      AND q.status <> 'done'
  )
  UPDATE public.queue q
  SET position = ranked.new_position
  FROM ranked
  WHERE q.id = ranked.id
    AND q.position IS DISTINCT FROM ranked.new_position;

  SELECT pg_catalog.count(*)::integer
  INTO v_active_count
  FROM public.queue q
  WHERE q.mill_id = p_mill_id
    AND q.season_id = p_season_id
    AND q.status <> 'done';

  v_position := LEAST(
    GREATEST(COALESCE(p_previous_position, v_active_count + 1), 1),
    v_active_count + 1
  );
  v_status := CASE WHEN p_previous_status = 'completed' THEN 'completed' ELSE 'waiting' END;
  v_estimated_minutes := CASE
    WHEN p_estimated_minutes IS NOT NULL AND p_estimated_minutes > 0 THEN p_estimated_minutes
    ELSE NULL
  END;

  UPDATE public.queue q
  SET position = q.position + 1
  WHERE q.mill_id = p_mill_id
    AND q.season_id = p_season_id
    AND q.status <> 'done'
    AND q.position >= v_position;

  INSERT INTO public.queue (
    id,
    user_id,
    mill_id,
    season_id,
    customer_id,
    name,
    phone,
    bags,
    notes,
    status,
    position,
    estimated_minutes,
    started_at
  ) VALUES (
    p_queue_id,
    v_actor,
    p_mill_id,
    p_season_id,
    p_customer_id,
    pg_catalog.btrim(p_name),
    NULLIF(pg_catalog.btrim(p_phone), ''),
    GREATEST(COALESCE(p_bags, 0), 0),
    p_notes,
    v_status,
    v_position,
    v_estimated_minutes,
    NULL
  );

  RETURN QUERY SELECT p_queue_id, v_position, v_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_queue_entry_command(
  uuid, uuid, uuid, uuid, text, text, integer, text, text, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.restore_queue_entry_command(
  uuid, uuid, uuid, uuid, text, text, integer, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.restore_queue_entry_command(
  uuid, uuid, uuid, uuid, text, text, integer, text, text, integer, integer
) IS 'Atomically restores a deleted queue entry at its previous position and shifts following entries.';
