CREATE INDEX IF NOT EXISTS mill_admin_charge_payments_created_by_idx
  ON public.mill_admin_charge_payments (created_by);

CREATE INDEX IF NOT EXISTS mill_admin_charge_payments_reversed_by_idx
  ON public.mill_admin_charge_payments (reversed_by)
  WHERE reversed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_financial_transactions_created_by_idx
  ON public.platform_financial_transactions (created_by);

CREATE INDEX IF NOT EXISTS subscription_payments_reversed_by_idx
  ON public.subscription_payments (reversed_by)
  WHERE reversed_by IS NOT NULL;
