-- Explicit lifecycle definitions for the two active payable/expense paths.
-- They keep the historical nullable session field but never query or require an
-- open session for cash recognition or settlement.
CREATE OR REPLACE FUNCTION public.record_expense_lifecycle_command(
  p_season_id uuid,p_category text,p_amount numeric,p_description text,p_payment_method text,
  p_partner_id uuid,p_supplier_id uuid,p_partner_name text,p_creditor_name text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_mill uuid; v_previous jsonb; v_expense uuid; v_payable uuid;
 v_operation uuid; v_financial uuid; v_name text; v_partner uuid:=p_partner_id;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
 IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SEASON_NOT_FOUND'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'record_expense',v_mill,p_season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR coalesce(btrim(p_category),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='EXPENSE_INPUT_INVALID'; END IF;
 IF p_payment_method NOT IN ('cash','credit','partner') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYMENT_METHOD_INVALID'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='EXPENSE_CREATE_FORBIDDEN'; END IF;
 IF p_payment_method='credit' THEN
   SELECT name INTO v_name FROM public.suppliers WHERE id=p_supplier_id AND mill_id=v_mill;
   v_name:=coalesce(nullif(btrim(v_name),''),nullif(btrim(p_creditor_name),''),nullif(btrim(p_description),''),'دائن مصروف');
 ELSIF p_payment_method='partner' THEN
   IF v_partner IS NULL THEN
     v_name:=nullif(btrim(p_partner_name),''); IF v_name IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_REQUIRED'; END IF;
     SELECT id INTO v_partner FROM public.partners WHERE mill_id=v_mill AND lower(trim(name))=lower(v_name) LIMIT 1;
     IF v_partner IS NULL THEN INSERT INTO public.partners(mill_id,name,active,created_at) VALUES(v_mill,v_name,true,now()) RETURNING id INTO v_partner; END IF;
   ELSE
     SELECT name INTO v_name FROM public.partners WHERE id=v_partner AND mill_id=v_mill;
     IF v_name IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_NOT_FOUND'; END IF;
   END IF;
 END IF;
 IF p_payment_method IN ('credit','partner') THEN
   INSERT INTO public.payables(mill_id,season_id,type,partner_id,supplier_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,status,notes,created_by)
   VALUES(v_mill,p_season_id,CASE WHEN p_payment_method='partner' THEN 'due_to_partner' ELSE 'due_to_supplier' END,v_partner,p_supplier_id,v_name,p_amount,0,p_amount,'expense','unpaid',p_description,v_actor) RETURNING id INTO v_payable;
 END IF;
 INSERT INTO public.expenses(user_id,season_id,mill_id,category,amount,description,payment_method,partner_id,supplier_id,payable_id,cash_session_id)
 VALUES(v_actor,p_season_id,v_mill,btrim(p_category),p_amount,nullif(btrim(p_description),''),p_payment_method,v_partner,p_supplier_id,v_payable,NULL) RETURNING id INTO v_expense;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by)
 VALUES(v_mill,p_season_id,'expense','expense',v_expense,v_actor) RETURNING id INTO v_operation;
 IF v_payable IS NOT NULL THEN
   UPDATE public.payables SET source_id=v_expense WHERE id=v_payable;
   INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,reason,created_by)
   VALUES(v_payable,v_mill,p_season_id,v_operation,'opened',p_amount,p_description,v_actor);
 END IF;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,party_type,party_id,party_name,operation_id)
 VALUES(v_actor,v_mill,p_season_id,'expense',p_amount,CASE WHEN p_payment_method='cash' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,
 CASE WHEN p_payment_method='cash' THEN 'cash'::financial_payment_method ELSE 'credit'::financial_payment_method END,v_expense,'expense',p_description,btrim(p_category),'active',NULL,
 CASE WHEN p_payment_method='partner' THEN 'partner' WHEN p_payment_method='credit' THEN 'supplier' ELSE NULL END,coalesce(v_partner,p_supplier_id),v_name,v_operation) RETURNING id INTO v_financial;
 IF p_payment_method='cash' THEN UPDATE public.inventory SET total_cash=total_cash-p_amount,updated_at=now() WHERE mill_id=v_mill AND season_id=p_season_id; END IF;
 PERFORM private.complete_business_command(p_idempotency_key,'record_expense',jsonb_build_object('success',true,'expense_id',v_expense,'payable_id',v_payable,'operation_id',v_operation,'financial_transaction_id',v_financial),v_operation);
 RETURN jsonb_build_object('success',true,'expense_id',v_expense,'payable_id',v_payable,'operation_id',v_operation,'financial_transaction_id',v_financial);
END; $$;

CREATE OR REPLACE FUNCTION public.settle_payable_lifecycle_command(p_payable_id uuid,p_amount numeric,p_payment_method text,p_notes text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_p public.payables%ROWTYPE; v_previous jsonb; v_movement uuid:=gen_random_uuid(); v_operation uuid; v_financial uuid; v_remaining numeric;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_p FROM public.payables WHERE id=p_payable_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYABLE_NOT_FOUND'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'settle_payable',v_p.mill_id,v_p.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>v_p.remaining_amount THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SETTLEMENT_AMOUNT_INVALID'; END IF;
 IF p_payment_method NOT IN ('cash','other') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYMENT_METHOD_INVALID'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_p.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYABLE_SETTLEMENT_FORBIDDEN'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by) VALUES(v_p.mill_id,v_p.season_id,'payable_settlement','obligation_movement',v_movement,v_actor) RETURNING id INTO v_operation;
 IF p_payment_method='cash' THEN
   v_financial:=gen_random_uuid();
   INSERT INTO public.financial_transactions(id,created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,party_type,party_id,party_name,operation_id)
   VALUES(v_financial,v_actor,v_p.mill_id,v_p.season_id,CASE WHEN v_p.type='due_to_partner' THEN 'owner_withdrawal' ELSE 'supplier_payment' END,p_amount,'out','cash',v_p.id,'payable_settlement','سداد التزام: '||v_p.creditor_name,'debt_settlement','active',NULL,CASE WHEN v_p.type='due_to_partner' THEN 'partner' ELSE 'supplier' END,coalesce(v_p.partner_id,v_p.supplier_id),v_p.creditor_name,v_operation);
   UPDATE public.inventory SET total_cash=total_cash-p_amount,updated_at=now() WHERE mill_id=v_p.mill_id AND season_id=v_p.season_id;
 END IF;
 INSERT INTO public.obligation_movements(id,payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,cash_session_id,financial_transaction_id,reason,created_by)
 VALUES(v_movement,v_p.id,v_p.mill_id,v_p.season_id,v_operation,'settlement',-p_amount,p_payment_method,NULL,v_financial,p_notes,v_actor);
 v_remaining:=v_p.remaining_amount-p_amount; UPDATE public.payables SET paid_amount=paid_amount+p_amount,remaining_amount=v_remaining,status=CASE WHEN v_remaining<=0.001 THEN 'paid' ELSE 'partially_paid' END,updated_at=now() WHERE id=v_p.id;
 PERFORM private.complete_business_command(p_idempotency_key,'settle_payable',jsonb_build_object('success',true,'payable_id',v_p.id,'movement_id',v_movement,'operation_id',v_operation,'financial_transaction_id',v_financial,'remaining',v_remaining),v_operation);
 RETURN jsonb_build_object('success',true,'payable_id',v_p.id,'movement_id',v_movement,'operation_id',v_operation,'financial_transaction_id',v_financial,'remaining',v_remaining);
END; $$;
