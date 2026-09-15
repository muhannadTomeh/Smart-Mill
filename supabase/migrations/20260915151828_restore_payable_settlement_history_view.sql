-- Read-only settlement history for the Payables UI.  It is based on the
-- append-only obligation ledger and therefore cannot be edited from the app.
CREATE OR REPLACE VIEW public.payable_settlement_history
WITH (security_invoker = true) AS
SELECT
  om.id,
  om.payable_id,
  om.mill_id,
  om.season_id,
  om.amount,
  om.payment_method,
  om.financial_transaction_id,
  om.created_at,
  om.reason,
  om.reversal_of,
  om.movement_type,
  om.operation_id,
  (
    om.reversal_of IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.obligation_movements reversal
      WHERE reversal.reversal_of = om.id
    )
  ) AS reversed
FROM public.obligation_movements om
WHERE om.movement_type IN ('settlement', 'settlement_reversal');

REVOKE ALL ON public.payable_settlement_history FROM PUBLIC, anon;
GRANT SELECT ON public.payable_settlement_history TO authenticated;
