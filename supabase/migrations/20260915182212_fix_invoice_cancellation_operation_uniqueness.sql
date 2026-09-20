-- A source document can legitimately have more than one business operation:
-- for example, invoice creation and invoice cancellation.  The old constraint
-- rejected the cancellation operation because it omitted operation_type.
ALTER TABLE public.business_operations
  DROP CONSTRAINT IF EXISTS business_operations_source_unique;

DROP INDEX IF EXISTS public.business_operations_source_unique;

ALTER TABLE public.business_operations
  ADD CONSTRAINT business_operations_source_operation_unique
  UNIQUE (mill_id, source_type, source_id, operation_type);
