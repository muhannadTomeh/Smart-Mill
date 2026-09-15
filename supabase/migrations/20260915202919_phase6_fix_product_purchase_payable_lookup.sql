-- Existing product purchases use the canonical payable source type `purchase`.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.cancel_product_purchase_command(uuid,text,uuid)'::regprocedure)
  INTO definition;
  definition := replace(
    definition,
    'WHERE source_type=''product_purchase'' AND source_id=p.id FOR UPDATE',
    'WHERE source_type IN (''product_purchase'', ''purchase'') AND source_id=p.id FOR UPDATE'
  );
  EXECUTE definition;
END $$;

-- Reconcile only cancelled purchases whose linked payable has never been paid.
UPDATE public.payables payable
SET paid_amount=0, remaining_amount=0, status='cancelled', updated_at=now()
FROM public.product_purchases purchase
WHERE purchase.status='cancelled'
  AND payable.source_id=purchase.id
  AND payable.source_type IN ('product_purchase','purchase')
  AND payable.paid_amount=0
  AND payable.status <> 'cancelled';
