CREATE OR REPLACE FUNCTION public.resequence_queue_before_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Only active queue entries participate in the visible turn sequence.
  IF OLD.status = 'done'
     OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM 'done') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Serialize removals for the same mill/season before touching sibling rows.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(COALESCE(OLD.mill_id::text, OLD.user_id::text)),
    pg_catalog.hashtext(COALESCE(OLD.season_id::text, ''))
  );

  WITH ranked AS (
    SELECT
      q.id,
      row_number() OVER (
        ORDER BY q.position NULLS LAST, q.created_at, q.id
      )::integer AS new_position
    FROM public.queue q
    WHERE (
        (OLD.mill_id IS NOT NULL AND q.mill_id = OLD.mill_id)
        OR (OLD.mill_id IS NULL AND q.mill_id IS NULL AND q.user_id = OLD.user_id)
      )
      AND q.season_id IS NOT DISTINCT FROM OLD.season_id
      AND q.status <> 'done'
      AND q.id <> OLD.id
  )
  UPDATE public.queue q
  SET position = ranked.new_position
  FROM ranked
  WHERE q.id = ranked.id
    AND q.position IS DISTINCT FROM ranked.new_position;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.resequence_queue_before_removal()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_resequence_before_removal ON public.queue;
CREATE TRIGGER queue_resequence_before_removal
BEFORE DELETE OR UPDATE OF status ON public.queue
FOR EACH ROW
EXECUTE FUNCTION public.resequence_queue_before_removal();

COMMENT ON FUNCTION public.resequence_queue_before_removal() IS
  'Trigger-only helper that keeps active queue positions dense after deletion or transition to done.';
