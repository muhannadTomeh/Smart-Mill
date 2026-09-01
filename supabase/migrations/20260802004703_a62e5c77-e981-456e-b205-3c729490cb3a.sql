UPDATE public.queue SET status = 'completed' WHERE status = 'done';
ALTER TABLE public.queue
  ADD CONSTRAINT queue_status_check
  CHECK (status IN ('waiting', 'processing', 'completed'));