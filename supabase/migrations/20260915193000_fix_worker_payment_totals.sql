-- Fix: pay_worker_and_settle was missing UPDATE workers.total_paid after payment.
-- This migration restores that line and reconciles any existing payment data.

-- 1. Recreate the function with the missing total_paid update
CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(
  p_user_id uuid,
  p_season_id uuid,
  p_worker_id uuid,
  p_amount numeric,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  m uuid;
  op uuid;
  pay uuid;
  w_name text;
  v_desc text;
BEGIN
  SELECT mill_id INTO m FROM public.seasons WHERE id = p_season_id;
  IF m IS NULL OR p_amount <= 0 OR NOT public.has_active_mill_role(m, ARRAY['mill_owner','mill_employee']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKER_PAYMENT_FORBIDDEN';
  END IF;

  SELECT name INTO w_name FROM public.workers WHERE id = p_worker_id;

  INSERT INTO public.business_operations(mill_id, season_id, operation_type, source_type, created_by)
  VALUES (m, p_season_id, 'worker_payment', 'worker_payment', auth.uid())
  RETURNING id INTO op;

  INSERT INTO public.worker_payments(user_id, mill_id, season_id, worker_id, amount, notes)
  VALUES (p_user_id, m, p_season_id, p_worker_id, p_amount, p_notes)
  RETURNING id INTO pay;

  -- *** FIX: Update worker total_paid ***
  UPDATE public.workers
  SET total_paid = total_paid + p_amount
  WHERE id = p_worker_id;

  v_desc := 'أجر العامل: ' || COALESCE(w_name, 'عامل') || CASE WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN ' (' || TRIM(p_notes) || ')' ELSE '' END;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount,
    direction, payment_method, reference_type, reference_id,
    party_type, party_id, party_name, description, status, operation_id
  )
  VALUES (
    auth.uid(), m, p_season_id,
    'worker_payment'::public.financial_tx_type,
    'أجور عمال',
    p_amount,
    'out'::public.financial_direction,
    'cash'::public.financial_payment_method,
    'worker_payment',
    pay,
    'worker',
    p_worker_id,
    w_name,
    v_desc,
    'active'::public.financial_tx_status,
    op
  );
END;
$$;

-- 2. Reconcile: sync workers.total_paid from actual worker_payments sum
UPDATE public.workers w
SET total_paid = COALESCE(sub.actual_paid, 0)
FROM (
  SELECT worker_id, SUM(amount) AS actual_paid
  FROM public.worker_payments
  GROUP BY worker_id
) sub
WHERE w.id = sub.worker_id
  AND w.total_paid IS DISTINCT FROM COALESCE(sub.actual_paid, 0);

-- Also fix any workers with payments but not in the subquery (zero out orphans)
UPDATE public.workers w
SET total_paid = 0
WHERE NOT EXISTS (SELECT 1 FROM public.worker_payments wp WHERE wp.worker_id = w.id)
  AND w.total_paid <> 0;
