-- Focused pre-merge corrections: expense lifecycle and worker financial authority.
-- No historical ledger row is deleted or edited; corrections append reversals.

CREATE OR REPLACE FUNCTION public.cancel_expense_lifecycle_command(
  p_expense_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_original public.financial_transactions%ROWTYPE;
  v_payable public.payables%ROWTYPE;
  v_previous jsonb;
  v_operation_id uuid;
  v_reversal_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_NOT_FOUND';
  END IF;
  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_expense.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_CANCEL_FORBIDDEN';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'cancel_expense', v_expense.mill_id, v_expense.season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;
  IF v_expense.voided_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_NOT_CANCELLABLE';
  END IF;

  SELECT * INTO v_original
  FROM public.financial_transactions
  WHERE reference_type = 'expense'
    AND reference_id = v_expense.id
    AND reversal_of IS NULL
    AND status = 'active'::public.financial_tx_status
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_LEDGER_NOT_FOUND';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_transactions r
    WHERE r.reversal_of = v_original.id AND r.status = 'active'::public.financial_tx_status
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_NOT_CANCELLABLE';
  END IF;

  IF v_expense.payable_id IS NOT NULL THEN
    SELECT * INTO v_payable FROM public.payables WHERE id = v_expense.payable_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_PAYABLE_NOT_FOUND';
    END IF;
    IF v_payable.paid_amount > 0
       OR EXISTS (
         SELECT 1 FROM public.obligation_movements m
         WHERE m.payable_id = v_payable.id
           AND m.movement_type = 'settlement'
           AND NOT EXISTS (
             SELECT 1 FROM public.obligation_movements r WHERE r.reversal_of = m.id
           )
       ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST';
    END IF;
  END IF;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by, reverses_operation_id
  ) VALUES (
    v_expense.mill_id, v_expense.season_id, 'expense_cancellation', 'expense_cancellation',
    v_expense.id, v_actor, v_original.operation_id
  ) RETURNING id INTO v_operation_id;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, party_type, party_id, party_name, description,
    status, reversal_of, reversal_reason, operation_id
  ) VALUES (
    v_actor, v_original.mill_id, v_original.season_id,
    'adjustment'::public.financial_tx_type, 'expense_reversal', v_original.amount,
    CASE
      WHEN v_original.direction = 'in'::public.financial_direction THEN 'out'::public.financial_direction
      WHEN v_original.direction = 'out'::public.financial_direction THEN 'in'::public.financial_direction
      ELSE 'none'::public.financial_direction
    END,
    v_original.payment_method, 'financial_reversal', v_original.id,
    v_original.party_type, v_original.party_id, v_original.party_name,
    'إلغاء مصروف', 'active'::public.financial_tx_status,
    v_original.id, BTRIM(p_reason), v_operation_id
  ) RETURNING id INTO v_reversal_id;

  IF v_expense.payable_id IS NOT NULL THEN
    INSERT INTO public.obligation_movements(
      payable_id, mill_id, season_id, operation_id, movement_type, amount,
      payment_method, reason, created_by
    ) VALUES (
      v_payable.id, v_payable.mill_id, v_payable.season_id, v_operation_id,
      'cancelled', -v_payable.original_amount, 'credit', BTRIM(p_reason), v_actor
    );
    UPDATE public.payables
    SET paid_amount = 0, remaining_amount = 0, status = 'cancelled', updated_at = now()
    WHERE id = v_payable.id;
  END IF;

  UPDATE public.expenses
  SET voided_at = now(), voided_by = v_actor, void_reason = BTRIM(p_reason)
  WHERE id = v_expense.id;

  IF v_original.operation_id IS NOT NULL THEN
    UPDATE public.business_operations
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
        cancellation_reason = BTRIM(p_reason)
    WHERE id = v_original.operation_id AND status = 'active';
  END IF;

  PERFORM private.complete_business_command(
    p_idempotency_key, 'cancel_expense',
    jsonb_build_object('success', true, 'expense_id', v_expense.id,
                       'reversal_financial_transaction_id', v_reversal_id),
    v_operation_id
  );
  RETURN jsonb_build_object('success', true, 'expense_id', v_expense.id,
                            'reversal_financial_transaction_id', v_reversal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_worker_command(
  p_season_id uuid, p_worker_id uuid, p_amount numeric, p_notes text, p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill_id uuid;
  v_previous jsonb;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  SELECT mill_id INTO v_mill_id
  FROM public.workers
  WHERE id = p_worker_id AND season_id = p_season_id;
  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKER_NOT_FOUND';
  END IF;
  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKER_PAYMENT_FORBIDDEN';
  END IF;
  v_previous := public.claim_financial_command(p_idempotency_key, 'worker_payment');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  PERFORM public.pay_worker_and_settle(v_actor, p_season_id, p_worker_id, p_amount, p_notes);
  v_result := jsonb_build_object('success', true);
  PERFORM public.complete_financial_command(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_worker_payment_command(
  p_payment_id uuid, p_reason text, p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid:=auth.uid(); p public.worker_payments%ROWTYPE; w public.workers%ROWTYPE;
  v_original_financial public.financial_transactions%ROWTYPE; v_previous jsonb; v_op uuid; v_financial uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REVERSAL_REASON_REQUIRED'; END IF;
  SELECT * INTO p FROM public.worker_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(p.mill_id,ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_FORBIDDEN';
  END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'reverse_worker_payment',p.mill_id,p.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF p.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_ALREADY_REVERSED'; END IF;
  SELECT * INTO w FROM public.workers WHERE id=p.worker_id FOR UPDATE;
  IF NOT FOUND OR w.total_paid<p.amount THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_RECONCILIATION_REQUIRED'; END IF;
  SELECT * INTO v_original_financial FROM public.financial_transactions WHERE reference_type='worker_payment' AND reference_id=p.id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_LEDGER_NOT_FOUND'; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id) VALUES(p.mill_id,p.season_id,'worker_payment_reversal','worker_payment',p.id,v_actor,v_original_financial.operation_id) RETURNING id INTO v_op;
  UPDATE public.worker_payments SET status='reversed',reversed_at=now(),reversed_by=v_actor,reversal_reason=BTRIM(p_reason) WHERE id=p.id;
  UPDATE public.workers SET total_paid=total_paid-p.amount,updated_at=now() WHERE id=w.id;
  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,reversal_of,reversal_reason,operation_id)
  VALUES(v_actor,p.mill_id,p.season_id,'worker_payment'::public.financial_tx_type,'عكس أجور عمال',p.amount,'in'::public.financial_direction,'cash'::public.financial_payment_method,'worker_payment_reversal',p.id,'worker',p.worker_id,w.name,'عكس دفعة العامل: '||w.name,'active'::public.financial_tx_status,v_original_financial.id,BTRIM(p_reason),v_op) RETURNING id INTO v_financial;
  PERFORM private.complete_business_command(p_idempotency_key,'reverse_worker_payment',jsonb_build_object('success',true,'financial_transaction_id',v_financial,'worker_payment_id',p.id),v_op);
  RETURN jsonb_build_object('success',true,'financial_transaction_id',v_financial,'worker_payment_id',p.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_work_record_command(
  p_work_record_id uuid, p_reason text, p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid:=auth.uid(); r public.work_records%ROWTYPE; w public.workers%ROWTYPE; v_previous jsonb; v_op uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
  SELECT * INTO r FROM public.work_records WHERE id=p_work_record_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(r.mill_id,ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_FORBIDDEN';
  END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'cancel_work_record',r.mill_id,r.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF r.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_ALREADY_CANCELLED'; END IF;
  SELECT * INTO w FROM public.workers WHERE id=r.worker_id FOR UPDATE;
  IF w.total_earned-r.amount<w.total_paid THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_CANCELLATION_EXCEEDS_UNPAID'; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by) VALUES(r.mill_id,r.season_id,'work_record_cancellation','work_record',r.id,v_actor) RETURNING id INTO v_op;
  UPDATE public.work_records SET status='cancelled',cancelled_at=now(),cancelled_by=v_actor,cancellation_reason=BTRIM(p_reason) WHERE id=r.id;
  UPDATE public.workers SET total_earned=total_earned-r.amount,updated_at=now() WHERE id=w.id;
  PERFORM private.complete_business_command(p_idempotency_key,'cancel_work_record',jsonb_build_object('success',true,'work_record_id',r.id),v_op);
  RETURN jsonb_build_object('success',true,'work_record_id',r.id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_expense_lifecycle_command(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_worker_command(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_worker_payment_command(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_work_record_command(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_expense_lifecycle_command(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_worker_command(uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_worker_payment_command(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_work_record_command(uuid, text, uuid) TO authenticated;
