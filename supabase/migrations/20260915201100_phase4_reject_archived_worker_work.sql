CREATE OR REPLACE FUNCTION public.register_worker_session(p_user_id uuid,p_season_id uuid,p_worker_id uuid,p_val numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_caller uuid:=auth.uid(); v_mill uuid; w public.workers%ROWTYPE; v_amount numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF p_val IS NULL OR p_val<=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_VALUE_INVALID'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_FORBIDDEN'; END IF;
  SELECT * INTO w FROM public.workers WHERE id=p_worker_id AND season_id=p_season_id AND mill_id=v_mill FOR UPDATE;
  IF NOT FOUND OR NOT w.active THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_NOT_ACTIVE'; END IF;
  v_amount:=p_val*CASE WHEN w.type='hourly' THEN COALESCE(w.hourly_rate,0) ELSE COALESCE(w.shift_rate,0) END;
  INSERT INTO public.work_records(user_id,season_id,mill_id,worker_id,amount,notes,hours,shifts,status)
  VALUES(v_caller,p_season_id,v_mill,p_worker_id,v_amount,p_notes,CASE WHEN w.type='hourly' THEN p_val ELSE NULL END,CASE WHEN w.type='shift' THEN p_val::integer ELSE NULL END,'active');
  UPDATE public.workers SET total_earned=total_earned+v_amount,updated_at=now() WHERE id=p_worker_id;
END; $$;
