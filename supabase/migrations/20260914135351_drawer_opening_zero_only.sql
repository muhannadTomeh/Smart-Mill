CREATE OR REPLACE FUNCTION public.open_cash_session(p_season_id uuid, p_opening_balance numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_mill_id uuid;
  v_session_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF coalesce(p_opening_balance, 0) <> 0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DRAWER_MUST_OPEN_AT_ZERO_USE_VAULT_TRANSFER';
  END IF;
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id = p_season_id FOR SHARE;
  IF v_mill_id IS NULL OR NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner','mill_employee']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CASH_SESSION_FORBIDDEN';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE mill_id=v_mill_id AND status='open') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CASH_SESSION_ALREADY_OPEN';
  END IF;
  INSERT INTO public.cash_sessions(mill_id,season_id,opened_by,opening_balance,expected_balance,total_cash_in,total_cash_out,status,opened_at)
  VALUES(v_mill_id,p_season_id,v_caller,0,0,0,0,'open',now()) RETURNING id INTO v_session_id;
  RETURN jsonb_build_object('success',true,'session_id',v_session_id,'mill_id',v_mill_id,'opening_balance',0);
END;
$$;
