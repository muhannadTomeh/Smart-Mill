CREATE OR REPLACE FUNCTION public.set_queue_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.position IS NULL OR NEW.position <= 0 THEN
    SELECT COALESCE(MAX(q.position), 0) + 1
      INTO NEW.position
      FROM public.queue q
     WHERE q.season_id = NEW.season_id
       AND q.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_queue_position_trigger ON public.queue;
CREATE TRIGGER set_queue_position_trigger
BEFORE INSERT ON public.queue
FOR EACH ROW EXECUTE FUNCTION public.set_queue_position();

ALTER TABLE public.queue ALTER COLUMN position DROP NOT NULL;
ALTER TABLE public.queue ALTER COLUMN position DROP DEFAULT;