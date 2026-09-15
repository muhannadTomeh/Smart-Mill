-- Phase 5: an oil trade is an immutable source document.  Its stock, cash and
-- payable effects are created together and are corrected only by cancellation.

ALTER TABLE public.oil_transactions
  ADD COLUMN IF NOT EXISTS payable_id uuid REFERENCES public.payables(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_operation_id uuid REFERENCES public.business_operations(id) ON DELETE RESTRICT;

ALTER TABLE public.oil_transactions
  DROP CONSTRAINT IF EXISTS oil_transactions_status_check;
ALTER TABLE public.oil_transactions
  ADD CONSTRAINT oil_transactions_status_check
  CHECK (status IN ('active', 'cancelled'));

ALTER TABLE public.oil_transactions
  DROP CONSTRAINT IF EXISTS oil_transactions_payment_method_check;
ALTER TABLE public.oil_transactions
  ADD CONSTRAINT oil_transactions_payment_method_check
  CHECK (payment_method IN ('cash', 'credit'));

ALTER TABLE public.oil_transactions
  DROP CONSTRAINT IF EXISTS oil_transactions_cancellation_consistent;
ALTER TABLE public.oil_transactions
  ADD CONSTRAINT oil_transactions_cancellation_consistent CHECK (
    (status = 'active' AND cancelled_at IS NULL AND cancelled_by IS NULL
      AND cancellation_reason IS NULL AND cancellation_operation_id IS NULL)
    OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
      AND nullif(btrim(cancellation_reason), '') IS NOT NULL
      AND cancellation_operation_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS oil_transactions_payable_id_idx
  ON public.oil_transactions(payable_id) WHERE payable_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_oil_trade_command(
  p_season_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_price numeric,
  p_payment_method text DEFAULT 'cash',
  p_party_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_total numeric;
  v_previous jsonb;
  v_operation uuid;
  v_trade uuid;
  v_payable uuid;
  v_financial uuid;
  v_oil uuid;
  v_current_oil numeric;
  v_creditor text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT mill_id INTO v_mill FROM public.seasons WHERE id = p_season_id;
  IF v_mill IS NULL
     OR NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner', 'mill_employee']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_FORBIDDEN';
  END IF;

  IF p_movement_type NOT IN ('IN', 'OUT')
     OR p_quantity IS NULL OR p_quantity <= 0
     OR p_unit_price IS NULL OR p_unit_price < 0
     OR p_payment_method NOT IN ('cash', 'credit') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_INVALID';
  END IF;

  -- Oil sales are cash-only in the MVP.  A credit sale needs a receivable
  -- lifecycle, which is deliberately not introduced by this phase.
  IF p_movement_type = 'OUT' AND p_payment_method <> 'cash' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_SALE_CREDIT_UNSUPPORTED';
  END IF;

  IF p_movement_type = 'IN' AND p_payment_method = 'credit'
     AND nullif(btrim(p_party_name), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_PURCHASE_CREDITOR_REQUIRED';
  END IF;

  IF p_movement_type = 'OUT' THEN
    SELECT coalesce(current_balance, oil_balance, 0) INTO v_current_oil
    FROM public.mill_oil_balance
    WHERE mill_id = v_mill AND season_id = p_season_id;
    IF coalesce(v_current_oil, 0) < p_quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_OIL_STOCK';
    END IF;
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'oil_trade', v_mill, p_season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  v_total := p_quantity * p_unit_price;
  v_creditor := nullif(btrim(p_party_name), '');

  INSERT INTO public.oil_transactions(
    user_id, mill_id, season_id, type, amount, price, total_price, payment_method, party_name, notes
  ) VALUES (
    v_actor, v_mill, p_season_id,
    CASE WHEN p_movement_type = 'IN' THEN 'buy' ELSE 'sell' END,
    p_quantity, p_unit_price, v_total, p_payment_method, v_creditor, nullif(btrim(p_notes), '')
  ) RETURNING id INTO v_trade;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by
  ) VALUES (
    v_mill, p_season_id, 'oil_trade', 'oil_transaction', v_trade, v_actor
  ) RETURNING id INTO v_operation;

  IF p_movement_type = 'IN' AND p_payment_method = 'credit' THEN
    INSERT INTO public.payables(
      mill_id, season_id, type, creditor_name, original_amount, paid_amount,
      remaining_amount, source_type, source_id, status, notes, created_by
    ) VALUES (
      v_mill, p_season_id, 'due_to_supplier', v_creditor, v_total, 0,
      v_total, 'purchase', v_trade, 'unpaid', nullif(btrim(p_notes), ''), v_actor
    ) RETURNING id INTO v_payable;

    UPDATE public.oil_transactions SET payable_id = v_payable WHERE id = v_trade;
  END IF;

  INSERT INTO public.oil_movements(
    mill_id, season_id, ownership, direction, movement_type, source_type,
    quantity, amount, unit_price, party_name, notes, reference_type, reference_id,
    created_by, idempotency_key
  ) VALUES (
    v_mill, p_season_id, 'mill', lower(p_movement_type), p_movement_type,
    CASE WHEN p_movement_type = 'IN' THEN 'oil_purchase' ELSE 'oil_sale' END,
    p_quantity, p_quantity, p_unit_price, v_creditor, nullif(btrim(p_notes), ''),
    'oil_transaction', v_trade, v_actor, p_idempotency_key
  ) RETURNING id INTO v_oil;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount, direction,
    payment_method, reference_type, reference_id, party_type, party_name,
    description, status, operation_id, idempotency_key
  ) VALUES (
    v_actor, v_mill, p_season_id,
    (CASE WHEN p_movement_type = 'IN' THEN 'expense' ELSE 'income' END)::public.financial_tx_type,
    CASE WHEN p_movement_type = 'IN' THEN 'oil_purchase' ELSE 'oil_sale' END,
    v_total,
    (CASE WHEN p_payment_method = 'cash' AND p_movement_type = 'IN' THEN 'out'
          WHEN p_payment_method = 'cash' THEN 'in' ELSE 'none' END)::public.financial_direction,
    (CASE WHEN p_payment_method = 'cash' THEN 'cash' ELSE 'credit' END)::public.financial_payment_method,
    'oil_transaction', v_trade,
    CASE WHEN p_movement_type = 'IN' THEN 'supplier' ELSE 'customer' END,
    v_creditor,
    CASE WHEN p_movement_type = 'IN' THEN 'شراء زيت' ELSE 'بيع زيت' END
      || ' (' || p_quantity || ' كغم)'
      || CASE WHEN nullif(btrim(p_notes), '') IS NOT NULL THEN ' — ' || btrim(p_notes) ELSE '' END,
    'active'::public.financial_tx_status, v_operation, p_idempotency_key
  ) RETURNING id INTO v_financial;

  PERFORM private.complete_business_command(
    p_idempotency_key, 'oil_trade',
    jsonb_build_object(
      'success', true, 'oil_transaction_id', v_trade, 'oil_movement_id', v_oil,
      'financial_transaction_id', v_financial, 'payable_id', v_payable,
      'payment_method', p_payment_method
    ), v_operation
  );

  RETURN jsonb_build_object(
    'success', true, 'oil_transaction_id', v_trade, 'oil_movement_id', v_oil,
    'financial_transaction_id', v_financial, 'payable_id', v_payable,
    'payment_method', p_payment_method
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_oil_trade_command(
  p_oil_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_trade public.oil_transactions%ROWTYPE;
  v_payable public.payables%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_original_operation uuid;
  v_original_financial public.financial_transactions%ROWTYPE;
  v_reverse_financial uuid;
  v_reverse_oil uuid;
  v_current_oil numeric;
  v_direction text;
  v_movement_type text;
  v_source_type text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_trade FROM public.oil_transactions WHERE id = p_oil_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_NOT_FOUND';
  END IF;
  IF NOT public.has_active_mill_role(v_trade.mill_id, ARRAY['mill_owner', 'mill_employee']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_CANCEL_FORBIDDEN';
  END IF;
  IF v_trade.status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_ALREADY_CANCELLED';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'cancel_oil_trade', v_trade.mill_id, v_trade.season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  IF v_trade.payable_id IS NOT NULL THEN
    SELECT * INTO v_payable FROM public.payables WHERE id = v_trade.payable_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_PAYABLE_NOT_FOUND';
    END IF;
    IF v_payable.paid_amount > 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DEPENDENT_SETTLEMENT_EXISTS';
    END IF;
  END IF;

  -- Cancelling a purchase emits an OUT movement, so the canonical balance must
  -- still cover the quantity.  This prevents a historical cancellation from
  -- creating negative stock after later sales/consumption.
  IF v_trade.type = 'buy' THEN
    SELECT coalesce(current_balance, oil_balance, 0) INTO v_current_oil
    FROM public.mill_oil_balance
    WHERE mill_id = v_trade.mill_id AND season_id = v_trade.season_id;
    IF coalesce(v_current_oil, 0) < v_trade.amount THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_OIL_STOCK_FOR_CANCELLATION';
    END IF;
    v_direction := 'out';
    v_movement_type := 'OUT';
    v_source_type := 'oil_purchase';
  ELSE
    v_direction := 'in';
    v_movement_type := 'IN';
    v_source_type := 'oil_sale';
  END IF;

  SELECT * INTO v_original_financial
  FROM public.financial_transactions
  WHERE reference_type = 'oil_transaction' AND reference_id = v_trade.id
    AND reversal_of IS NULL
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_LEDGER_EVENT_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE reversal_of = v_original_financial.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_ALREADY_CANCELLED';
  END IF;

  SELECT id INTO v_original_operation
  FROM public.business_operations
  WHERE id = v_original_financial.operation_id
  FOR UPDATE;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by,
    reverses_operation_id
  ) VALUES (
    v_trade.mill_id, v_trade.season_id, 'oil_trade_cancellation',
    'oil_transaction', v_trade.id, v_actor, v_original_operation
  ) RETURNING id INTO v_operation;

  INSERT INTO public.oil_movements(
    mill_id, season_id, ownership, direction, movement_type, source_type,
    quantity, amount, unit_price, party_name, notes, reference_type, reference_id,
    created_by, idempotency_key
  ) VALUES (
    v_trade.mill_id, v_trade.season_id, 'mill', v_direction, v_movement_type,
    v_source_type, v_trade.amount, v_trade.amount, v_trade.price, v_trade.party_name,
    'إلغاء عملية زيت: ' || btrim(p_reason), 'oil_transaction_cancellation',
    v_trade.id, v_actor, p_idempotency_key
  ) RETURNING id INTO v_reverse_oil;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount, direction,
    payment_method, reference_type, reference_id, party_type, party_id, party_name,
    description, status, operation_id, idempotency_key, reversal_of, reversal_reason
  ) VALUES (
    v_actor, v_trade.mill_id, v_trade.season_id,
    'adjustment'::public.financial_tx_type, 'oil_trade_cancellation',
    v_original_financial.amount,
    (CASE v_original_financial.direction
      WHEN 'in'::public.financial_direction THEN 'out'
      WHEN 'out'::public.financial_direction THEN 'in'
      ELSE 'none' END)::public.financial_direction,
    v_original_financial.payment_method,
    'oil_transaction_cancellation', v_trade.id,
    v_original_financial.party_type, v_original_financial.party_id,
    v_original_financial.party_name,
    'إلغاء ' || CASE WHEN v_trade.type = 'buy' THEN 'شراء زيت' ELSE 'بيع زيت' END
      || ': ' || btrim(p_reason),
    'active'::public.financial_tx_status, v_operation, p_idempotency_key,
    v_original_financial.id, btrim(p_reason)
  ) RETURNING id INTO v_reverse_financial;

  IF v_trade.payable_id IS NOT NULL THEN
    UPDATE public.payables
    SET paid_amount = 0, remaining_amount = 0, status = 'cancelled', updated_at = now()
    WHERE id = v_payable.id;
  END IF;

  IF v_original_operation IS NOT NULL THEN
    UPDATE public.business_operations
    SET status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    WHERE id = v_original_operation;
  END IF;

  UPDATE public.oil_transactions
  SET status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
      cancellation_reason = btrim(p_reason), cancellation_operation_id = v_operation
  WHERE id = v_trade.id;

  PERFORM private.complete_business_command(
    p_idempotency_key, 'cancel_oil_trade',
    jsonb_build_object(
      'success', true, 'oil_transaction_id', v_trade.id,
      'reversal_oil_movement_id', v_reverse_oil,
      'financial_reversal_id', v_reverse_financial,
      'payable_id', v_trade.payable_id
    ), v_operation
  );

  RETURN jsonb_build_object(
    'success', true, 'oil_transaction_id', v_trade.id,
    'reversal_oil_movement_id', v_reverse_oil,
    'financial_reversal_id', v_reverse_financial,
    'payable_id', v_trade.payable_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_oil_trade_command(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_oil_trade_command(uuid,text,uuid) TO authenticated;
