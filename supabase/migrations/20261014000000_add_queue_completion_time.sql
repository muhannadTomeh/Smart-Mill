-- Keep the time an olive pressing turn reaches the invoice queue.
ALTER TABLE public.queue
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_queue_completed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_queue_completed_at ON public.queue;
CREATE TRIGGER set_queue_completed_at
  BEFORE UPDATE ON public.queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_queue_completed_at();
