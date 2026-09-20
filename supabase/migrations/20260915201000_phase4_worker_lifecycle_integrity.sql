BEGIN;

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.work_records ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.work_records ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.work_records ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.work_records ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.worker_payments DROP CONSTRAINT IF EXISTS worker_payments_status_check;
ALTER TABLE public.worker_payments ADD CONSTRAINT worker_payments_status_check CHECK (status IN ('active','reversed'));
ALTER TABLE public.work_records DROP CONSTRAINT IF EXISTS work_records_status_check;
ALTER TABLE public.work_records ADD CONSTRAINT work_records_status_check CHECK (status IN ('active','cancelled'));

ALTER TABLE public.work_records DROP CONSTRAINT IF EXISTS work_records_worker_id_fkey;
ALTER TABLE public.work_records ADD CONSTRAINT work_records_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE RESTRICT;
ALTER TABLE public.worker_payments DROP CONSTRAINT IF EXISTS worker_payments_worker_id_fkey;
ALTER TABLE public.worker_payments ADD CONSTRAINT worker_payments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE RESTRICT;

REVOKE DELETE ON public.workers FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.workers FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name,type,phone,hourly_rate,shift_rate,active) ON public.workers TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.work_records FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(p_user_id uuid,p_season_id uuid,p_worker_id uuid,p_amount numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE m uuid; op uuid; pay uuid; w public.workers%ROWTYPE; v_desc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO m FROM public.seasons WHERE id=p_season_id;
  IF m IS NULL OR p_amount IS NULL OR p_amount<=0 OR NOT public.has_active_mill_role(m,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WORKER_PAYMENT_FORBIDDEN'; END IF;
  SELECT * INTO w FROM public.workers WHERE id=p_worker_id AND mill_id=m AND season_id=p_season_id FOR UPDATE;
  IF NOT FOUND OR NOT w.active THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WORKER_NOT_ACTIVE'; END IF;
  IF w.total_paid + p_amount > w.total_earned THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WORKER_PAYMENT_EXCEEDS_EARNED'; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(m,p_season_id,'worker_payment','worker_payment',auth.uid()) RETURNING id INTO op;
  INSERT INTO public.worker_payments(user_id,mill_id,season_id,worker_id,amount,notes,status) VALUES(auth.uid(),m,p_season_id,p_worker_id,p_amount,p_notes,'active') RETURNING id INTO pay;
  UPDATE public.workers SET total_paid=total_paid+p_amount,updated_at=now() WHERE id=p_worker_id;
  v_desc := 'أجر العامل: ' || w.name || CASE WHEN NULLIF(BTRIM(p_notes),'') IS NULL THEN '' ELSE ' ('||BTRIM(p_notes)||')' END;
  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id)
  VALUES(auth.uid(),m,p_season_id,'worker_payment'::public.financial_tx_type,'أجور عمال',p_amount,'out'::public.financial_direction,'cash'::public.financial_payment_method,'worker_payment',pay,'worker',p_worker_id,w.name,v_desc,'active'::public.financial_tx_status,op);
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_worker_payment_command(p_payment_id uuid,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_actor uuid:=auth.uid(); p public.worker_payments%ROWTYPE; w public.workers%ROWTYPE; v_original_financial public.financial_transactions%ROWTYPE; v_previous jsonb; v_op uuid; v_financial uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REVERSAL_REASON_REQUIRED'; END IF;
  SELECT * INTO p FROM public.worker_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_NOT_FOUND'; END IF;
  IF NOT public.has_active_mill_role(p.mill_id,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_FORBIDDEN'; END IF;
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
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_work_record_command(p_work_record_id uuid,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_actor uuid:=auth.uid(); r public.work_records%ROWTYPE; w public.workers%ROWTYPE; v_previous jsonb; v_op uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
  SELECT * INTO r FROM public.work_records WHERE id=p_work_record_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_NOT_FOUND'; END IF;
  IF NOT public.has_active_mill_role(r.mill_id,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_FORBIDDEN'; END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'cancel_work_record',r.mill_id,r.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF r.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_ALREADY_CANCELLED'; END IF;
  SELECT * INTO w FROM public.workers WHERE id=r.worker_id FOR UPDATE;
  IF w.total_earned-r.amount<w.total_paid THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORK_RECORD_CANCELLATION_EXCEEDS_UNPAID'; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by) VALUES(r.mill_id,r.season_id,'work_record_cancellation','work_record',r.id,v_actor) RETURNING id INTO v_op;
  UPDATE public.work_records SET status='cancelled',cancelled_at=now(),cancelled_by=v_actor,cancellation_reason=BTRIM(p_reason) WHERE id=r.id;
  UPDATE public.workers SET total_earned=total_earned-r.amount,updated_at=now() WHERE id=w.id;
  PERFORM private.complete_business_command(p_idempotency_key,'cancel_work_record',jsonb_build_object('success',true,'work_record_id',r.id),v_op);
  RETURN jsonb_build_object('success',true,'work_record_id',r.id);
END; $$;

-- Append-only reconciliation for test-era cascade-deletion orphans; no ledger row is deleted.
DO $$ DECLARE f record; v_op uuid;
BEGIN
 FOR f IN SELECT ft.* FROM public.financial_transactions ft LEFT JOIN public.worker_payments wp ON wp.id=ft.reference_id WHERE ft.reference_type='worker_payment' AND ft.status='active' AND wp.id IS NULL AND NOT EXISTS (SELECT 1 FROM public.financial_transactions r WHERE r.reversal_of=ft.id) LOOP
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id) VALUES(f.mill_id,f.season_id,'worker_payment_orphan_reconciliation','financial_transaction',f.id,COALESCE(f.created_by,(SELECT user_id FROM public.user_roles WHERE role='platform_admin' LIMIT 1)),f.operation_id) RETURNING id INTO v_op;
  INSERT INTO public.financial_transactions(mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,created_by,reversal_of,reversal_reason,operation_id)
  VALUES(f.mill_id,f.season_id,f.type,'تسوية دفعة عامل يتيمة',f.amount,CASE WHEN f.direction='out' THEN 'in'::public.financial_direction ELSE 'out'::public.financial_direction END,f.payment_method,'worker_payment_orphan_reconciliation',f.id,f.party_type,f.party_id,f.party_name,'تسوية تلقائية لسجل دفعة عامل حُذف مصدره','active'::public.financial_tx_status,COALESCE(f.created_by,(SELECT user_id FROM public.user_roles WHERE role='platform_admin' LIMIT 1)),f.id,'SOURCE_DELETED_BY_LEGACY_CASCADE',v_op);
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.reverse_worker_payment_command(uuid,text,uuid), public.cancel_work_record_command(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_worker_payment_command(uuid,text,uuid), public.cancel_work_record_command(uuid,text,uuid) TO authenticated;
COMMIT;
