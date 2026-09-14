-- Vault expenses use their own reversal command.  The legacy command remains
-- drawer-only, so it can never restore vault cash to inventory.total_cash.
CREATE OR REPLACE FUNCTION public.cancel_vault_expense_lifecycle_command(
  p_expense_id uuid, p_reason text, p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_expense public.expenses%ROWTYPE; v_previous jsonb;
  v_operation uuid; v_financial public.financial_transactions%ROWTYPE; v_reverse uuid; v_reverse_op uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT * INTO v_expense FROM public.expenses WHERE id=p_expense_id FOR UPDATE;
  IF NOT FOUND OR v_expense.voided_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_NOT_CANCELLABLE'; END IF;
  SELECT id INTO v_operation FROM public.business_operations
  WHERE source_type='expense' AND source_id=v_expense.id AND mill_id=v_expense.mill_id AND operation_type='vault_expense'
  FOR UPDATE;
  IF v_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='NOT_A_VAULT_EXPENSE'; END IF;
  v_previous := private.claim_business_command(p_idempotency_key,'cancel_vault_expense',v_expense.mill_id,v_expense.season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
  IF NOT public.has_active_mill_role(v_expense.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='VAULT_OWNER_REQUIRED';
  END IF;
  IF v_expense.payable_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.payables p WHERE p.id=v_expense.payable_id AND p.paid_amount>0.001) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST';
  END IF;
  SELECT * INTO v_financial FROM public.financial_transactions
  WHERE reference_type='expense' AND reference_id=v_expense.id AND reversal_of IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_EFFECT_NOT_FOUND'; END IF;
  v_reverse := gen_random_uuid();
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id)
  VALUES(v_expense.mill_id,v_expense.season_id,'vault_expense_reversal','financial_reversal',v_reverse,v_actor,v_operation)
  RETURNING id INTO v_reverse_op;
  INSERT INTO public.financial_transactions(id,created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,cash_location,reversal_of,reversal_reason,operation_id)
  VALUES(v_reverse,v_actor,v_expense.mill_id,v_expense.season_id,'adjustment',v_financial.amount,
    CASE v_financial.direction WHEN 'out' THEN 'in'::financial_direction WHEN 'in' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,
    v_financial.payment_method,v_financial.id,'financial_reversal','إلغاء مصروف خزنة: '||p_reason,
    coalesce(v_financial.category,'reversal'),'active',NULL,
    CASE WHEN v_expense.payment_method='cash' THEN 'vault' ELSE NULL END,v_financial.id,p_reason,v_reverse_op);
  INSERT INTO public.business_operation_dependencies(parent_operation_id,child_operation_id,dependency_type)
  VALUES(v_operation,v_reverse_op,'reversal') ON CONFLICT DO NOTHING;
  IF v_expense.payment_method='cash' THEN
    UPDATE public.cash_vaults SET balance=balance+v_expense.amount,updated_at=now()
    WHERE mill_id=v_expense.mill_id AND season_id=v_expense.season_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='VAULT_NOT_FOUND'; END IF;
  ELSE
    UPDATE public.payables SET status='cancelled',remaining_amount=0,updated_at=now() WHERE id=v_expense.payable_id;
    INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,reason,created_by)
    VALUES(v_expense.payable_id,v_expense.mill_id,v_expense.season_id,v_operation,'cancelled',-v_expense.amount,p_reason,v_actor);
  END IF;
  UPDATE public.expenses SET voided_at=now(),voided_by=v_actor,void_reason=p_reason WHERE id=v_expense.id;
  UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=p_reason WHERE id=v_operation;
  PERFORM private.complete_business_command(p_idempotency_key,'cancel_vault_expense',jsonb_build_object('success',true,'expense_id',v_expense.id,'reversal_id',v_reverse),v_operation);
  RETURN jsonb_build_object('success',true,'expense_id',v_expense.id,'reversal_id',v_reverse);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_vault_expense_lifecycle_command(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_vault_expense_lifecycle_command(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_expense_lifecycle_command(
  p_expense_id uuid, p_reason text, p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_actor uuid:=auth.uid(); v_expense public.expenses%ROWTYPE; v_previous jsonb; v_operation uuid; v_financial public.financial_transactions%ROWTYPE; v_reverse uuid; v_reverse_op uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_expense FROM public.expenses WHERE id=p_expense_id FOR UPDATE;
 IF NOT FOUND OR v_expense.voided_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_NOT_CANCELLABLE'; END IF;
 IF v_expense.cash_location='vault' OR EXISTS(SELECT 1 FROM public.business_operations o WHERE o.source_type='expense' AND o.source_id=v_expense.id AND o.operation_type='vault_expense') THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='VAULT_EXPENSE_USE_VAULT_REVERSAL';
 END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'cancel_expense',v_expense.mill_id,v_expense.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_expense.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_CANCEL_FORBIDDEN'; END IF;
 IF v_expense.payable_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.payables p WHERE p.id=v_expense.payable_id AND p.paid_amount>0.001) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST'; END IF;
 SELECT * INTO v_financial FROM public.financial_transactions WHERE reference_type='expense' AND reference_id=v_expense.id AND reversal_of IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_EFFECT_NOT_FOUND'; END IF;
 SELECT id INTO v_operation FROM public.business_operations WHERE source_type='expense' AND source_id=v_expense.id AND mill_id=v_expense.mill_id FOR UPDATE;
 v_reverse := gen_random_uuid();
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id)
 VALUES(v_expense.mill_id,v_expense.season_id,'expense_reversal','financial_reversal',v_reverse,v_actor,v_operation) RETURNING id INTO v_reverse_op;
 INSERT INTO public.financial_transactions(id,created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,reversal_of,reversal_reason,operation_id)
 VALUES(v_reverse,v_actor,v_expense.mill_id,v_expense.season_id,'adjustment',v_financial.amount,CASE v_financial.direction WHEN 'out' THEN 'in'::financial_direction WHEN 'in' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,v_financial.payment_method,v_financial.id,'financial_reversal','إلغاء مصروف: '||p_reason,coalesce(v_financial.category,'reversal'),'active',v_financial.cash_session_id,v_financial.id,p_reason,v_reverse_op);
 INSERT INTO public.business_operation_dependencies(parent_operation_id,child_operation_id,dependency_type) VALUES(v_operation,v_reverse_op,'reversal') ON CONFLICT DO NOTHING;
 IF v_expense.payment_method='cash' THEN UPDATE public.inventory SET total_cash=total_cash+v_expense.amount,updated_at=now() WHERE mill_id=v_expense.mill_id AND season_id=v_expense.season_id; ELSE UPDATE public.payables SET status='cancelled',remaining_amount=0,updated_at=now() WHERE id=v_expense.payable_id; INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,reason,created_by) VALUES(v_expense.payable_id,v_expense.mill_id,v_expense.season_id,v_operation,'cancelled',-v_expense.amount,p_reason,v_actor); END IF;
 UPDATE public.expenses SET voided_at=now(),voided_by=v_actor,void_reason=p_reason WHERE id=v_expense.id;
 UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=p_reason WHERE id=v_operation;
 PERFORM private.complete_business_command(p_idempotency_key,'cancel_expense',jsonb_build_object('success',true,'expense_id',v_expense.id,'reversal_id',v_reverse),v_operation);
 RETURN jsonb_build_object('success',true,'expense_id',v_expense.id,'reversal_id',v_reverse);
END;
$$;
