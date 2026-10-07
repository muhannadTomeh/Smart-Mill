-- Canonical platform-admin cash ledger.
-- This ledger belongs to the Smart Mill platform operator and is completely
-- separate from every mill's operational financial_transactions ledger.

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reversed_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.mill_admin_charges
  DROP CONSTRAINT IF EXISTS mill_admin_charges_status_check,
  DROP CONSTRAINT IF EXISTS mill_admin_charges_settlement_check;

ALTER TABLE public.mill_admin_charges
  ADD CONSTRAINT mill_admin_charges_status_check
    CHECK (status IN ('outstanding', 'partially_paid', 'paid', 'cancelled')),
  ADD CONSTRAINT mill_admin_charges_settlement_check CHECK (
    (status IN ('outstanding', 'partially_paid') AND settled_by IS NULL AND settled_at IS NULL)
    OR
    (status IN ('paid', 'cancelled') AND settled_by IS NOT NULL AND settled_at IS NOT NULL)
  );

CREATE TABLE public.mill_admin_charge_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES public.mill_admin_charges(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  notes text NULL CHECK (notes IS NULL OR char_length(notes) <= 2000),
  idempotency_key uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz NULL,
  reversed_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT mill_admin_charge_payments_reversal_check CHECK (
    (reversed_at IS NULL AND reversed_by IS NULL)
    OR
    (reversed_at IS NOT NULL AND reversed_by IS NOT NULL)
  )
);

CREATE INDEX mill_admin_charge_payments_charge_date_idx
  ON public.mill_admin_charge_payments (charge_id, payment_date DESC, created_at DESC);

ALTER TABLE public.mill_admin_charge_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY mill_admin_charge_payments_platform_admin_select
ON public.mill_admin_charge_payments
FOR SELECT
TO authenticated
USING ((SELECT public.is_platform_admin((SELECT auth.uid()))));

REVOKE ALL ON TABLE public.mill_admin_charge_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mill_admin_charge_payments TO authenticated;
GRANT ALL ON TABLE public.mill_admin_charge_payments TO service_role;

CREATE TABLE public.platform_financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  category text NOT NULL CHECK (category IN (
    'subscription_payment',
    'admin_charge_payment',
    'manual_income',
    'manual_expense',
    'reversal'
  )),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  mill_id uuid NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  reference_type text NOT NULL CHECK (reference_type IN (
    'subscription_payment',
    'admin_charge_payment',
    'manual_movement',
    'reversal'
  )),
  reference_id uuid NULL,
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 500),
  transaction_date date NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  reversal_of uuid NULL REFERENCES public.platform_financial_transactions(id) ON DELETE RESTRICT,
  reversal_reason text NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_financial_transactions_reversal_check CHECK (
    (category <> 'reversal' AND reversal_of IS NULL AND reversal_reason IS NULL)
    OR
    (category = 'reversal' AND reversal_of IS NOT NULL AND char_length(trim(reversal_reason)) >= 3)
  )
);

CREATE UNIQUE INDEX platform_financial_transactions_one_reversal_idx
  ON public.platform_financial_transactions (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE INDEX platform_financial_transactions_date_idx
  ON public.platform_financial_transactions (transaction_date DESC, created_at DESC);

CREATE INDEX platform_financial_transactions_mill_idx
  ON public.platform_financial_transactions (mill_id, transaction_date DESC);

ALTER TABLE public.platform_financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_financial_transactions_platform_admin_select
ON public.platform_financial_transactions
FOR SELECT
TO authenticated
USING ((SELECT public.is_platform_admin((SELECT auth.uid()))));

REVOKE ALL ON TABLE public.platform_financial_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_financial_transactions TO authenticated;
GRANT ALL ON TABLE public.platform_financial_transactions TO service_role;

CREATE OR REPLACE VIEW public.mill_admin_charge_balances
WITH (security_invoker = true)
AS
SELECT
  c.*,
  m.name AS mill_name,
  COALESCE(p.paid_amount, 0::numeric) AS paid_amount,
  GREATEST(c.amount - COALESCE(p.paid_amount, 0::numeric), 0::numeric) AS remaining_amount,
  CASE
    WHEN c.status = 'cancelled' THEN 'cancelled'
    WHEN COALESCE(p.paid_amount, 0::numeric) >= c.amount THEN 'paid'
    WHEN COALESCE(p.paid_amount, 0::numeric) > 0 THEN 'partially_paid'
    ELSE 'outstanding'
  END AS effective_status
FROM public.mill_admin_charges c
LEFT JOIN public.mills m ON m.id = c.mill_id
LEFT JOIN (
  SELECT charge_id, SUM(amount) AS paid_amount
  FROM public.mill_admin_charge_payments
  WHERE reversed_at IS NULL
  GROUP BY charge_id
) p ON p.charge_id = c.id;

CREATE OR REPLACE VIEW public.platform_financial_effective_events
WITH (security_invoker = true)
AS
SELECT
  tx.*,
  m.name AS mill_name,
  EXISTS (
    SELECT 1
    FROM public.platform_financial_transactions reversal
    WHERE reversal.reversal_of = tx.id
  ) AS is_reversed
FROM public.platform_financial_transactions tx
LEFT JOIN public.mills m ON m.id = tx.mill_id;

REVOKE ALL ON TABLE public.mill_admin_charge_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_financial_effective_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mill_admin_charge_balances TO authenticated, service_role;
GRANT SELECT ON TABLE public.platform_financial_effective_events TO authenticated, service_role;

-- Preserve the one existing meaning of "paid" from the earlier charge UI by
-- materializing it as a real charge payment and a real platform cash event.
INSERT INTO public.mill_admin_charge_payments (
  charge_id,
  amount,
  payment_date,
  notes,
  idempotency_key,
  created_by,
  created_at
)
SELECT
  c.id,
  c.amount,
  COALESCE(c.settled_at::date, c.created_at::date),
  'ترحيل سداد سابق إلى صندوق إدارة المنصة',
  c.id,
  COALESCE(c.settled_by, c.created_by),
  COALESCE(c.settled_at, c.created_at)
FROM public.mill_admin_charges c
WHERE c.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.mill_admin_charge_payments p WHERE p.charge_id = c.id
  );

INSERT INTO public.platform_financial_transactions (
  direction,
  category,
  amount,
  mill_id,
  reference_type,
  reference_id,
  description,
  transaction_date,
  idempotency_key,
  created_by,
  created_at
)
SELECT
  'in',
  'admin_charge_payment',
  p.amount,
  c.mill_id,
  'admin_charge_payment',
  p.id,
  'سداد دين إداري: ' || c.title,
  p.payment_date,
  p.idempotency_key,
  p.created_by,
  p.created_at
FROM public.mill_admin_charge_payments p
JOIN public.mill_admin_charges c ON c.id = p.charge_id
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.platform_financial_transactions (
  direction,
  category,
  amount,
  mill_id,
  reference_type,
  reference_id,
  description,
  transaction_date,
  idempotency_key,
  created_by,
  created_at
)
SELECT
  'in',
  'subscription_payment',
  sp.amount,
  sp.mill_id,
  'subscription_payment',
  sp.id,
  'دفعة اشتراك معصرة',
  sp.payment_date,
  sp.idempotency_key,
  sp.recorded_by,
  sp.created_at
FROM public.subscription_payments sp
WHERE sp.reversed_at IS NULL
ON CONFLICT (idempotency_key) DO NOTHING;

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
  v_actor uuid := auth.uid();
  v_mill public.mills%ROWTYPE;
  v_payment public.subscription_payments%ROWTYPE;
  v_duplicate boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
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

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('platform_finance_ledger'));

  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE idempotency_key = p_idempotency_key;

  IF v_payment.id IS NOT NULL THEN
    IF v_payment.mill_id IS DISTINCT FROM p_mill_id
       OR v_payment.amount IS DISTINCT FROM p_amount
       OR v_payment.payment_date IS DISTINCT FROM p_payment_date THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    v_duplicate := true;
  ELSE
    SELECT * INTO v_mill FROM public.mills WHERE id = p_mill_id;
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
      v_actor,
      v_mill.subscription_type,
      v_mill.subscription_fee,
      p_idempotency_key
    )
    RETURNING * INTO v_payment;
  END IF;

  IF v_payment.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUBSCRIPTION_PAYMENT_ALREADY_REVERSED';
  END IF;

  INSERT INTO public.platform_financial_transactions (
    direction,
    category,
    amount,
    mill_id,
    reference_type,
    reference_id,
    description,
    transaction_date,
    idempotency_key,
    created_by
  ) VALUES (
    'in',
    'subscription_payment',
    v_payment.amount,
    v_payment.mill_id,
    'subscription_payment',
    v_payment.id,
    'دفعة اشتراك معصرة',
    v_payment.payment_date,
    v_payment.idempotency_key,
    v_actor
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'mill_id', v_payment.mill_id,
    'amount', v_payment.amount,
    'payment_date', v_payment.payment_date,
    'duplicate', v_duplicate
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_mill_admin_charge_payment_command(
  p_charge_id uuid,
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
  v_actor uuid := auth.uid();
  v_charge public.mill_admin_charges%ROWTYPE;
  v_payment public.mill_admin_charge_payments%ROWTYPE;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_duplicate boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ADMIN_CHARGE_PAYMENT_AMOUNT';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADMIN_CHARGE_PAYMENT_DATE_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('platform_finance_ledger'));

  SELECT * INTO v_payment
  FROM public.mill_admin_charge_payments
  WHERE idempotency_key = p_idempotency_key;

  IF v_payment.id IS NOT NULL THEN
    IF v_payment.charge_id IS DISTINCT FROM p_charge_id
       OR v_payment.amount IS DISTINCT FROM p_amount
       OR v_payment.payment_date IS DISTINCT FROM p_payment_date THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    v_duplicate := true;
  ELSE
    SELECT * INTO v_charge
    FROM public.mill_admin_charges
    WHERE id = p_charge_id
    FOR UPDATE;

    IF v_charge.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ADMIN_CHARGE_NOT_FOUND';
    END IF;
    IF v_charge.status = 'cancelled' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_ALREADY_CLOSED';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.mill_admin_charge_payments
    WHERE charge_id = v_charge.id
      AND reversed_at IS NULL;

    v_remaining := v_charge.amount - v_paid;
    IF p_amount > v_remaining THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_PAYMENT_EXCEEDS_REMAINING';
    END IF;

    INSERT INTO public.mill_admin_charge_payments (
      charge_id,
      amount,
      payment_date,
      notes,
      idempotency_key,
      created_by
    ) VALUES (
      v_charge.id,
      p_amount,
      p_payment_date,
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      p_idempotency_key,
      v_actor
    )
    RETURNING * INTO v_payment;
  END IF;

  IF v_payment.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_PAYMENT_ALREADY_REVERSED';
  END IF;

  IF v_charge.id IS NULL THEN
    SELECT * INTO v_charge
    FROM public.mill_admin_charges
    WHERE id = v_payment.charge_id
    FOR UPDATE;
  END IF;

  INSERT INTO public.platform_financial_transactions (
    direction,
    category,
    amount,
    mill_id,
    reference_type,
    reference_id,
    description,
    transaction_date,
    idempotency_key,
    created_by
  ) VALUES (
    'in',
    'admin_charge_payment',
    v_payment.amount,
    v_charge.mill_id,
    'admin_charge_payment',
    v_payment.id,
    'سداد دين إداري: ' || v_charge.title,
    v_payment.payment_date,
    v_payment.idempotency_key,
    v_actor
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.mill_admin_charge_payments
  WHERE charge_id = v_charge.id
    AND reversed_at IS NULL;

  v_remaining := GREATEST(v_charge.amount - v_paid, 0);

  UPDATE public.mill_admin_charges
  SET status = CASE
        WHEN v_remaining = 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partially_paid'
        ELSE 'outstanding'
      END,
      settled_by = CASE WHEN v_remaining = 0 THEN v_actor ELSE NULL END,
      settled_at = CASE WHEN v_remaining = 0 THEN now() ELSE NULL END
  WHERE id = v_charge.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'charge_id', v_charge.id,
    'amount', v_payment.amount,
    'paid_amount', v_paid,
    'remaining_amount', v_remaining,
    'duplicate', v_duplicate
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_platform_cash_movement_command(
  p_direction text,
  p_amount numeric,
  p_description text,
  p_transaction_date date,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_direction text := lower(trim(COALESCE(p_direction, '')));
  v_balance numeric := 0;
  v_tx public.platform_financial_transactions%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;
  IF v_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PLATFORM_CASH_DIRECTION';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PLATFORM_CASH_AMOUNT';
  END IF;
  IF char_length(trim(COALESCE(p_description, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PLATFORM_CASH_DESCRIPTION_REQUIRED';
  END IF;
  IF p_transaction_date IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PLATFORM_CASH_INPUT_REQUIRED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('platform_finance_ledger'));

  SELECT * INTO v_tx
  FROM public.platform_financial_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF v_tx.id IS NOT NULL THEN
    IF v_tx.direction IS DISTINCT FROM v_direction
       OR v_tx.amount IS DISTINCT FROM p_amount
       OR v_tx.transaction_date IS DISTINCT FROM p_transaction_date THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('transaction_id', v_tx.id, 'duplicate', true);
  END IF;

  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
  INTO v_balance
  FROM public.platform_financial_transactions;

  IF v_direction = 'out' AND p_amount > v_balance THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INSUFFICIENT_PLATFORM_CASH';
  END IF;

  INSERT INTO public.platform_financial_transactions (
    direction,
    category,
    amount,
    reference_type,
    description,
    transaction_date,
    idempotency_key,
    created_by
  ) VALUES (
    v_direction,
    CASE WHEN v_direction = 'in' THEN 'manual_income' ELSE 'manual_expense' END,
    p_amount,
    'manual_movement',
    trim(p_description),
    p_transaction_date,
    p_idempotency_key,
    v_actor
  )
  RETURNING * INTO v_tx;

  RETURN jsonb_build_object('transaction_id', v_tx.id, 'duplicate', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_platform_financial_transaction_command(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_original public.platform_financial_transactions%ROWTYPE;
  v_reversal public.platform_financial_transactions%ROWTYPE;
  v_payment public.mill_admin_charge_payments%ROWTYPE;
  v_charge public.mill_admin_charges%ROWTYPE;
  v_balance numeric := 0;
  v_paid numeric := 0;
  v_remaining numeric := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PLATFORM_REVERSAL_REASON_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('platform_finance_ledger'));

  SELECT * INTO v_reversal
  FROM public.platform_financial_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF v_reversal.id IS NOT NULL THEN
    IF v_reversal.reversal_of IS DISTINCT FROM p_transaction_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('transaction_id', v_reversal.id, 'duplicate', true);
  END IF;

  SELECT * INTO v_original
  FROM public.platform_financial_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PLATFORM_TRANSACTION_NOT_FOUND';
  END IF;
  IF v_original.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PLATFORM_REVERSAL_OF_REVERSAL_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_financial_transactions WHERE reversal_of = v_original.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PLATFORM_TRANSACTION_ALREADY_REVERSED';
  END IF;

  IF v_original.direction = 'in' THEN
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM public.platform_financial_transactions;
    IF v_original.amount > v_balance THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INSUFFICIENT_PLATFORM_CASH_FOR_REVERSAL';
    END IF;
  END IF;

  INSERT INTO public.platform_financial_transactions (
    direction,
    category,
    amount,
    mill_id,
    reference_type,
    reference_id,
    description,
    transaction_date,
    idempotency_key,
    reversal_of,
    reversal_reason,
    created_by
  ) VALUES (
    CASE WHEN v_original.direction = 'in' THEN 'out' ELSE 'in' END,
    'reversal',
    v_original.amount,
    v_original.mill_id,
    'reversal',
    v_original.id,
    'عكس حركة: ' || v_original.description,
    current_date,
    p_idempotency_key,
    v_original.id,
    trim(p_reason),
    v_actor
  )
  RETURNING * INTO v_reversal;

  IF v_original.reference_type = 'subscription_payment' THEN
    UPDATE public.subscription_payments
    SET reversed_at = now(), reversed_by = v_actor
    WHERE id = v_original.reference_id
      AND reversed_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUBSCRIPTION_PAYMENT_ALREADY_REVERSED';
    END IF;
  ELSIF v_original.reference_type = 'admin_charge_payment' THEN
    UPDATE public.mill_admin_charge_payments
    SET reversed_at = now(), reversed_by = v_actor
    WHERE id = v_original.reference_id
      AND reversed_at IS NULL
    RETURNING * INTO v_payment;
    IF v_payment.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_PAYMENT_ALREADY_REVERSED';
    END IF;

    SELECT * INTO v_charge
    FROM public.mill_admin_charges
    WHERE id = v_payment.charge_id
    FOR UPDATE;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.mill_admin_charge_payments
    WHERE charge_id = v_charge.id
      AND reversed_at IS NULL;
    v_remaining := GREATEST(v_charge.amount - v_paid, 0);

    UPDATE public.mill_admin_charges
    SET status = CASE
          WHEN v_remaining = 0 THEN 'paid'
          WHEN v_paid > 0 THEN 'partially_paid'
          ELSE 'outstanding'
        END,
        settled_by = CASE WHEN v_remaining = 0 THEN v_actor ELSE NULL END,
        settled_at = CASE WHEN v_remaining = 0 THEN now() ELSE NULL END
    WHERE id = v_charge.id;
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_reversal.id,
    'reversal_of', v_original.id,
    'duplicate', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_mill_admin_charge_status_command(
  p_charge_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_charge public.mill_admin_charges%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADMIN_CHARGE_PAYMENT_REQUIRED';
  END IF;

  SELECT * INTO v_charge
  FROM public.mill_admin_charges
  WHERE id = p_charge_id
  FOR UPDATE;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ADMIN_CHARGE_NOT_FOUND';
  END IF;
  IF v_charge.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_ALREADY_CLOSED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.mill_admin_charge_payments
    WHERE charge_id = v_charge.id AND reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_HAS_PAYMENTS';
  END IF;

  UPDATE public.mill_admin_charges
  SET status = 'cancelled', settled_by = v_actor, settled_at = now()
  WHERE id = v_charge.id
  RETURNING * INTO v_charge;

  RETURN jsonb_build_object('charge_id', v_charge.id, 'mill_id', v_charge.mill_id, 'status', v_charge.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_platform_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;

  SELECT jsonb_build_object(
    'cash_balance', COALESCE((
      SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END)
      FROM public.platform_financial_transactions
    ), 0),
    'total_in', COALESCE((
      SELECT SUM(amount) FROM public.platform_financial_transactions WHERE direction = 'in'
    ), 0),
    'total_out', COALESCE((
      SELECT SUM(amount) FROM public.platform_financial_transactions WHERE direction = 'out'
    ), 0),
    'subscription_collected', COALESCE((
      SELECT SUM(amount) FROM public.platform_financial_transactions tx
      WHERE category = 'subscription_payment'
        AND NOT EXISTS (SELECT 1 FROM public.platform_financial_transactions r WHERE r.reversal_of = tx.id)
    ), 0),
    'charge_collected', COALESCE((
      SELECT SUM(amount) FROM public.platform_financial_transactions tx
      WHERE category = 'admin_charge_payment'
        AND NOT EXISTS (SELECT 1 FROM public.platform_financial_transactions r WHERE r.reversal_of = tx.id)
    ), 0),
    'outstanding_dues', COALESCE((
      SELECT SUM(remaining_amount)
      FROM public.mill_admin_charge_balances
      WHERE effective_status IN ('outstanding', 'partially_paid')
    ), 0),
    'open_dues_count', COALESCE((
      SELECT COUNT(*)
      FROM public.mill_admin_charge_balances
      WHERE effective_status IN ('outstanding', 'partially_paid')
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_subscription_payment_command(uuid, numeric, date, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_mill_admin_charge_payment_command(uuid, numeric, date, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_platform_cash_movement_command(text, numeric, text, date, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_platform_financial_transaction_command(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_mill_admin_charge_status_command(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_platform_finance_summary()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_subscription_payment_command(uuid, numeric, date, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_mill_admin_charge_payment_command(uuid, numeric, date, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_platform_cash_movement_command(text, numeric, text, date, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_platform_financial_transaction_command(uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_mill_admin_charge_status_command(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_finance_summary()
  TO authenticated, service_role;
