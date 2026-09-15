-- has_active_mill_role intentionally permits Platform Admin. Opening balances do not.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_cash_opening_balance_command(
  p_season_id uuid, p_amount numeric, p_notes text, p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_mill uuid; v_previous jsonb; v_operation uuid; v_financial uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SEASON_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE mill_id=v_mill AND user_id=v_actor AND role='mill_owner' AND is_active=true
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_BALANCE_FORBIDDEN'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_BALANCE_INVALID'; END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'cash_opening_balance', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_transactions
    WHERE mill_id=v_mill AND season_id=p_season_id AND reference_type='cash_opening_balance' AND status='active'
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DUPLICATE_OPENING_BALANCE'; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by)
  VALUES(v_mill,p_season_id,'cash_opening_balance','cash_opening_balance',v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,description,status,operation_id,idempotency_key)
  VALUES(v_actor,v_mill,p_season_id,'adjustment','opening_balance',p_amount,'in','cash','cash_opening_balance',COALESCE(NULLIF(BTRIM(p_notes),''),'الرصيد النقدي الافتتاحي'),'active',v_operation,p_idempotency_key)
  RETURNING id INTO v_financial;
  PERFORM private.complete_business_command(p_idempotency_key,'cash_opening_balance',jsonb_build_object('success',true,'financial_transaction_id',v_financial),v_operation);
  RETURN jsonb_build_object('success',true,'financial_transaction_id',v_financial);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_oil_opening_balance_command(
  p_season_id uuid, p_amount numeric, p_notes text, p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_mill uuid; v_previous jsonb; v_operation uuid; v_movement uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SEASON_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE mill_id=v_mill AND user_id=v_actor AND role='mill_owner' AND is_active=true
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_BALANCE_FORBIDDEN'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_BALANCE_INVALID'; END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'oil_opening_balance', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF EXISTS (
    SELECT 1 FROM public.oil_movements
    WHERE mill_id=v_mill AND season_id=p_season_id AND source_type='opening_balance'
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DUPLICATE_OPENING_BALANCE'; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by)
  VALUES(v_mill,p_season_id,'oil_opening_balance','oil_opening_balance',v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.oil_movements(mill_id,season_id,ownership,direction,movement_type,source_type,amount,quantity,unit_price,notes,reference_type,reference_id,created_by,idempotency_key)
  VALUES(v_mill,p_season_id,'mill','in','IN','opening_balance',p_amount,p_amount,0,COALESCE(NULLIF(BTRIM(p_notes),''),'الرصيد الافتتاحي للزيت'),'oil_opening_balance',v_operation,v_actor,p_idempotency_key)
  RETURNING id INTO v_movement;
  PERFORM private.complete_business_command(p_idempotency_key,'oil_opening_balance',jsonb_build_object('success',true,'oil_movement_id',v_movement),v_operation);
  RETURN jsonb_build_object('success',true,'oil_movement_id',v_movement);
END;
$$;

REVOKE ALL ON FUNCTION public.record_cash_opening_balance_command(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_opening_balance_command(uuid, numeric, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_oil_opening_balance_command(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_oil_opening_balance_command(uuid, numeric, text, uuid) TO authenticated;

COMMIT;
