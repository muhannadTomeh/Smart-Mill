-- Keep every newly-created queue entry consistent, including non-UI clients.
ALTER TABLE public.queue
  ALTER COLUMN estimated_minutes SET DEFAULT 30;

COMMENT ON COLUMN public.queue.estimated_minutes IS
  'Estimated milling duration in minutes. New queue entries default to 30 minutes.';
