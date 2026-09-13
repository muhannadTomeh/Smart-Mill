-- Step A least-privilege cleanup for internal receipt tables and trigger-only
-- functions. These changes do not alter any client command contract.

DROP POLICY IF EXISTS business_command_receipts_no_client_access
  ON public.business_command_receipts;
CREATE POLICY business_command_receipts_no_client_access
ON public.business_command_receipts
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS financial_command_receipts_no_client_access
  ON public.financial_command_receipts;
CREATE POLICY financial_command_receipts_no_client_access
ON public.financial_command_receipts
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.prevent_closed_session_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'لا يمكن تعديل جلسة كاش مغلقة؛ الجلسة أصبحت سجلاً تاريخياً مقفلاً.';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions execute through their triggers and are not Data API RPCs.
REVOKE ALL ON FUNCTION public.prevent_closed_session_modification()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_and_stamp_cash_session()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_cash_session()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_cash_session_invoices()
  FROM PUBLIC, anon, authenticated;
