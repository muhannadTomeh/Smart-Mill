ALTER TABLE public.mills
  ADD COLUMN IF NOT EXISTS subscription_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS subscription_fee numeric NOT NULL DEFAULT 0;

UPDATE public.mills
SET subscription_fee = GREATEST(COALESCE(monthly_fee, 0), 0)
WHERE subscription_fee = 0
  AND COALESCE(monthly_fee, 0) > 0;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mills'::regclass
      AND conname = 'mills_subscription_type_check'
  ) THEN
    ALTER TABLE public.mills
      ADD CONSTRAINT mills_subscription_type_check
      CHECK (subscription_type IN ('monthly', 'seasonal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mills'::regclass
      AND conname = 'mills_subscription_fee_check'
  ) THEN
    ALTER TABLE public.mills
      ADD CONSTRAINT mills_subscription_fee_check
      CHECK (subscription_fee >= 0);
  END IF;
END
$constraints$;

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS subscription_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS subscription_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NOT NULL DEFAULT gen_random_uuid();

UPDATE public.subscription_payments sp
SET subscription_type = m.subscription_type,
    subscription_fee = m.subscription_fee
FROM public.mills m
WHERE m.id = sp.mill_id;

ALTER TABLE public.subscription_payments
  ALTER COLUMN mill_id SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_payments'::regclass
      AND conname = 'subscription_payments_amount_check'
  ) THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_amount_check
      CHECK (amount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_payments'::regclass
      AND conname = 'subscription_payments_type_check'
  ) THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_type_check
      CHECK (subscription_type IN ('monthly', 'seasonal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_payments'::regclass
      AND conname = 'subscription_payments_fee_check'
  ) THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_fee_check
      CHECK (subscription_fee >= 0);
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_idempotency_key_idx
  ON public.subscription_payments (idempotency_key);

CREATE INDEX IF NOT EXISTS subscription_payments_mill_date_idx
  ON public.subscription_payments (mill_id, payment_date DESC, created_at DESC);

DROP POLICY IF EXISTS "Tenant isolation for subscription_payments"
  ON public.subscription_payments;
DROP POLICY IF EXISTS "platform_admins_manage_payments"
  ON public.subscription_payments;
DROP POLICY IF EXISTS "platform_admin_select_subscription_payments"
  ON public.subscription_payments;

CREATE POLICY "platform_admin_select_subscription_payments"
ON public.subscription_payments
FOR SELECT
TO authenticated
USING ((SELECT public.is_platform_admin((SELECT auth.uid()))));

REVOKE ALL ON TABLE public.subscription_payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscription_payments TO authenticated;
GRANT ALL ON TABLE public.subscription_payments TO service_role;

CREATE OR REPLACE FUNCTION public.update_mill_subscription_plan_command(
  p_mill_id uuid,
  p_subscription_type text,
  p_subscription_fee numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_type text := lower(trim(COALESCE(p_subscription_type, '')));
  v_mill public.mills%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;

  IF v_type NOT IN ('monthly', 'seasonal') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SUBSCRIPTION_TYPE';
  END IF;

  IF p_subscription_fee IS NULL OR p_subscription_fee < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SUBSCRIPTION_FEE';
  END IF;

  UPDATE public.mills
  SET subscription_type = v_type,
      subscription_fee = p_subscription_fee,
      monthly_fee = CASE WHEN v_type = 'monthly' THEN p_subscription_fee ELSE 0 END,
      updated_at = now()
  WHERE id = p_mill_id
  RETURNING * INTO v_mill;

  IF v_mill.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MILL_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'mill_id', v_mill.id,
    'subscription_type', v_mill.subscription_type,
    'subscription_fee', v_mill.subscription_fee
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_subscription_payment_command(
  p_mill_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_mill public.mills%ROWTYPE;
  v_payment public.subscription_payments%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SUBSCRIPTION_PAYMENT_AMOUNT';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUBSCRIPTION_PAYMENT_DATE_REQUIRED';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE idempotency_key = p_idempotency_key;

  IF v_payment.id IS NOT NULL THEN
    IF v_payment.mill_id IS DISTINCT FROM p_mill_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'mill_id', v_payment.mill_id,
      'amount', v_payment.amount,
      'payment_date', v_payment.payment_date,
      'duplicate', true
    );
  END IF;

  SELECT * INTO v_mill
  FROM public.mills
  WHERE id = p_mill_id;

  IF v_mill.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MILL_NOT_FOUND';
  END IF;

  IF v_mill.owner_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MILL_OWNER_REQUIRED';
  END IF;

  INSERT INTO public.subscription_payments (
    mill_id,
    mill_user_id,
    amount,
    payment_date,
    notes,
    recorded_by,
    subscription_type,
    subscription_fee,
    idempotency_key
  ) VALUES (
    v_mill.id,
    v_mill.owner_user_id,
    p_amount,
    p_payment_date,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    auth.uid(),
    v_mill.subscription_type,
    v_mill.subscription_fee,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_payment;

  IF v_payment.id IS NULL THEN
    SELECT * INTO v_payment
    FROM public.subscription_payments
    WHERE idempotency_key = p_idempotency_key;
  END IF;

  IF v_payment.mill_id IS DISTINCT FROM p_mill_id THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'mill_id', v_payment.mill_id,
    'amount', v_payment.amount,
    'payment_date', v_payment.payment_date,
    'duplicate', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_mill_subscription_plan_command(uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_subscription_payment_command(uuid, numeric, date, text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_mill_subscription_plan_command(uuid, text, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_subscription_payment_command(uuid, numeric, date, text, uuid)
  TO authenticated, service_role;
