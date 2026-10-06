BEGIN;

-- Legacy, non-idempotent expense reversal path. The application uses
-- cancel_expense_lifecycle_command, which also handles payable dependencies
-- and command receipts atomically.
REVOKE ALL ON FUNCTION public.void_expense_and_reverse(uuid,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.void_expense_and_reverse(uuid,text)
TO service_role;

COMMIT;
