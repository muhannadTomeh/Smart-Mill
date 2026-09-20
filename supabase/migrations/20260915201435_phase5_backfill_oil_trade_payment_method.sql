-- Apply the safe ledger-derived display backfill to projects that received the
-- lifecycle migration before this column was added.
UPDATE public.oil_transactions t
SET payment_method = 'credit'
FROM public.financial_transactions f
WHERE f.reference_type = 'oil_transaction'
  AND f.reference_id = t.id
  AND f.reversal_of IS NULL
  AND f.payment_method = 'credit'::public.financial_payment_method;
