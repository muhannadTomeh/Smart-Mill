-- The historical partial index has the same intent as the retired constraint
-- and still prevented cancellation operations for an existing source document.
DROP INDEX IF EXISTS public.business_operations_source_unique;
