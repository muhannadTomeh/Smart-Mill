-- A cancelled payable is a valid compatibility-projection state. The source
-- expense and immutable obligation movements remain the canonical history.
ALTER TABLE public.payables DROP CONSTRAINT IF EXISTS payables_status_check;
ALTER TABLE public.payables ADD CONSTRAINT payables_status_check
  CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled'));
