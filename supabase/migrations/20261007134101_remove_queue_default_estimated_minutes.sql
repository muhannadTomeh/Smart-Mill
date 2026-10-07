-- Queue duration is intentionally optional and must not be inferred automatically.
ALTER TABLE public.queue
  ALTER COLUMN estimated_minutes DROP DEFAULT;

COMMENT ON COLUMN public.queue.estimated_minutes IS
  'Optional estimated milling duration in minutes. NULL means the duration is not specified.';
