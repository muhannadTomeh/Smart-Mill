-- Step A invariant: the additive bridge has backfilled every existing financial
-- event and supplies an operation_id before each future insert.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.financial_transactions
    WHERE operation_id IS NULL
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_OPERATION_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

ALTER TABLE public.financial_transactions
  ALTER COLUMN operation_id SET NOT NULL;

-- These indexes have the same definition. Keep the newer canonical name.
DROP INDEX IF EXISTS public.financial_transactions_session_idx;

COMMENT ON TABLE public.financial_command_receipts IS
  'Legacy idempotency receipts retained during module cutover; new lifecycle commands use business_command_receipts.';
