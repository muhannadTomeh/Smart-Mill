-- Canonical payable settlement lifecycle: append-only history plus a financial
-- ledger event. Cash is derived from the ledger, so no legacy inventory or
-- cash-session mutation is performed here.
CREATE OR REPLACE FUNCTION public.settle_payable_lifecycle_command(
  p_payable_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payable public.payables%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_movement uuid := gen_random_uuid();
  v_financial uuid;
  v_remaining numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT * INTO v_payable
  FROM public.payables
  WHERE id = p_payable_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYABLE_NOT_FOUND';
  END IF;

  IF NOT public.has_active_mill_role(v_payable.mill_id, ARRAY['mill_owner', 'mill_employee']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYABLE_SETTLEMENT_FORBIDDEN';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_payable.remaining_amount
     OR p_payment_method NOT IN ('cash', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYABLE_SETTLEMENT_INVALID';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'settle_payable', v_payable.mill_id, v_payable.season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  v_remaining := v_payable.remaining_amount - p_amount;
  IF v_remaining <= 0.001 THEN
    v_remaining := 0;
  END IF;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by
  ) VALUES (
    v_payable.mill_id, v_payable.season_id, 'payable_settlement',
    'obligation_movement', v_movement, v_actor
  ) RETURNING id INTO v_operation;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount, direction,
    payment_method, reference_type, reference_id, party_type, party_id,
    party_name, description, status, operation_id, idempotency_key
  ) VALUES (
    v_actor, v_payable.mill_id, v_payable.season_id,
    'supplier_payment'::public.financial_tx_type,
    'payable_settlement',
    p_amount,
    (CASE WHEN p_payment_method = 'cash' THEN 'out' ELSE 'none' END)::public.financial_direction,
    (CASE WHEN p_payment_method = 'cash' THEN 'cash' ELSE 'credit' END)::public.financial_payment_method,
    'payable', v_payable.id,
    CASE WHEN v_payable.partner_id IS NULL THEN 'supplier' ELSE 'partner' END,
    coalesce(v_payable.partner_id, v_payable.supplier_id),
    v_payable.creditor_name,
    coalesce(nullif(btrim(p_notes), ''), 'سداد التزام: ' || v_payable.creditor_name),
    'active'::public.financial_tx_status,
    v_operation, p_idempotency_key
  ) RETURNING id INTO v_financial;

  INSERT INTO public.obligation_movements(
    id, payable_id, mill_id, season_id, operation_id, movement_type, amount,
    payment_method, financial_transaction_id, reason, created_by
  ) VALUES (
    v_movement, v_payable.id, v_payable.mill_id, v_payable.season_id,
    v_operation, 'settlement', p_amount, p_payment_method, v_financial,
    nullif(btrim(p_notes), ''), v_actor
  );

  UPDATE public.payables
  SET paid_amount = paid_amount + p_amount,
      remaining_amount = v_remaining,
      status = CASE WHEN v_remaining = 0 THEN 'paid' ELSE 'partially_paid' END,
      updated_at = now()
  WHERE id = v_payable.id;

  PERFORM private.complete_business_command(
    p_idempotency_key,
    'settle_payable',
    jsonb_build_object(
      'success', true,
      'payable_id', v_payable.id,
      'movement_id', v_movement,
      'operation_id', v_operation,
      'financial_transaction_id', v_financial,
      'remaining', v_remaining
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'payable_id', v_payable.id,
    'movement_id', v_movement,
    'operation_id', v_operation,
    'financial_transaction_id', v_financial,
    'remaining', v_remaining
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_payable_settlement_lifecycle_command(
  p_movement_id uuid,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_movement public.obligation_movements%ROWTYPE;
  v_payable public.payables%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_reverse_movement uuid := gen_random_uuid();
  v_original_financial public.financial_transactions%ROWTYPE;
  v_reverse_financial uuid;
  v_paid numeric;
  v_remaining numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_movement
  FROM public.obligation_movements
  WHERE id = p_movement_id
  FOR UPDATE;
  IF NOT FOUND OR v_movement.movement_type <> 'settlement' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SETTLEMENT_NOT_REVERSIBLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.obligation_movements WHERE reversal_of = v_movement.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SETTLEMENT_ALREADY_REVERSED';
  END IF;

  SELECT * INTO v_payable
  FROM public.payables
  WHERE id = v_movement.payable_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_active_mill_role(v_payable.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYABLE_SETTLEMENT_REVERSE_FORBIDDEN';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'reverse_payable_settlement', v_payable.mill_id, v_payable.season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by, reverses_operation_id
  ) VALUES (
    v_payable.mill_id, v_payable.season_id, 'payable_settlement_reversal',
    'obligation_movement', v_reverse_movement, v_actor, v_movement.operation_id
  ) RETURNING id INTO v_operation;

  IF v_movement.financial_transaction_id IS NOT NULL THEN
    SELECT * INTO v_original_financial
    FROM public.financial_transactions
    WHERE id = v_movement.financial_transaction_id
    FOR UPDATE;

    IF FOUND AND v_original_financial.payment_method = 'cash'::public.financial_payment_method THEN
      INSERT INTO public.financial_transactions(
        created_by, mill_id, season_id, type, category, amount, direction,
        payment_method, reference_type, reference_id, party_type, party_id,
        party_name, description, status, operation_id, idempotency_key,
        reversal_of, reversal_reason
      ) VALUES (
        v_actor, v_payable.mill_id, v_payable.season_id,
        'adjustment'::public.financial_tx_type,
        'payable_settlement_reversal',
        v_movement.amount,
        'in'::public.financial_direction,
        'cash'::public.financial_payment_method,
        'financial_reversal', v_original_financial.id,
        v_original_financial.party_type, v_original_financial.party_id,
        v_original_financial.party_name,
        'عكس سداد التزام: ' || btrim(p_reason),
        'active'::public.financial_tx_status,
        v_operation, p_idempotency_key,
        v_original_financial.id, btrim(p_reason)
      ) RETURNING id INTO v_reverse_financial;
    END IF;
  END IF;

  INSERT INTO public.obligation_movements(
    id, payable_id, mill_id, season_id, operation_id, movement_type, amount,
    payment_method, financial_transaction_id, reversal_of, reason, created_by
  ) VALUES (
    v_reverse_movement, v_payable.id, v_payable.mill_id, v_payable.season_id,
    v_operation, 'settlement_reversal', -v_movement.amount, v_movement.payment_method,
    v_reverse_financial, v_movement.id, btrim(p_reason), v_actor
  );

  v_paid := greatest(0, v_payable.paid_amount - v_movement.amount);
  v_remaining := least(v_payable.original_amount, v_payable.remaining_amount + v_movement.amount);
  UPDATE public.payables
  SET paid_amount = v_paid,
      remaining_amount = v_remaining,
      status = CASE
        WHEN v_remaining >= v_payable.original_amount - 0.001 THEN 'unpaid'
        ELSE 'partially_paid'
      END,
      updated_at = now()
  WHERE id = v_payable.id;

  PERFORM private.complete_business_command(
    p_idempotency_key,
    'reverse_payable_settlement',
    jsonb_build_object(
      'success', true,
      'payable_id', v_payable.id,
      'reversal_movement_id', v_reverse_movement,
      'financial_reversal_id', v_reverse_financial
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'payable_id', v_payable.id,
    'reversal_movement_id', v_reverse_movement,
    'financial_reversal_id', v_reverse_financial
  );
END;
$$;

-- Keep legacy entry points consistent with the lifecycle used by the UI.
CREATE OR REPLACE FUNCTION public.settle_payable_command(
  p_payable_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public.settle_payable_lifecycle_command(
    p_payable_id, p_amount, p_payment_method, p_notes, p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_payable_atomic(
  p_payable_id uuid, p_amount numeric, p_payment_method text, p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public.settle_payable_lifecycle_command(
    p_payable_id, p_amount, p_payment_method, p_notes, gen_random_uuid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payable_lifecycle_command(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_payable_settlement_lifecycle_command(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_payable_command(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_payable_atomic(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payable_lifecycle_command(uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payable_settlement_lifecycle_command(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payable_command(uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payable_atomic(uuid, numeric, text, text) TO authenticated;
