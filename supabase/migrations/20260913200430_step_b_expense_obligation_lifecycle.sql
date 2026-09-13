-- Step B: expenses and obligations use source-aware, idempotent commands.
-- Legacy payables remain a read-compatible projection during the transition.

CREATE TABLE public.obligation_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id uuid NOT NULL REFERENCES public.payables(id) ON DELETE RESTRICT,
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('opened','settlement','settlement_reversal','cancelled')),
  amount numeric NOT NULL CHECK (amount <> 0),
  payment_method text,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  reversal_of uuid REFERENCES public.obligation_movements(id) ON DELETE RESTRICT,
  reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((movement_type <> 'settlement_reversal') OR reversal_of IS NOT NULL)
);
CREATE INDEX obligation_movements_payable_created_idx ON public.obligation_movements(payable_id, created_at);
CREATE INDEX obligation_movements_tenant_created_idx ON public.obligation_movements(mill_id, season_id, created_at DESC);
CREATE UNIQUE INDEX obligation_movements_one_reversal_idx ON public.obligation_movements(reversal_of) WHERE reversal_of IS NOT NULL;
ALTER TABLE public.obligation_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY obligation_movements_read_tenant ON public.obligation_movements FOR SELECT TO authenticated
USING (public.is_platform_admin((SELECT auth.uid())) OR public.check_user_mill_access(mill_id));
REVOKE ALL ON TABLE public.obligation_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.obligation_movements TO authenticated;
GRANT ALL ON TABLE public.obligation_movements TO service_role;

CREATE OR REPLACE FUNCTION private.reject_obligation_movement_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OBLIGATION_HISTORY_IMMUTABLE'; END; $$;
CREATE TRIGGER trg_protect_obligation_movements BEFORE UPDATE OR DELETE ON public.obligation_movements
FOR EACH ROW EXECUTE FUNCTION private.reject_obligation_movement_mutation();

CREATE OR REPLACE VIEW public.payable_settlement_history
WITH (security_invoker = true) AS
SELECT om.id, om.payable_id, om.mill_id, om.season_id, om.amount, om.payment_method,
       om.cash_session_id, om.created_at, om.reason, om.reversal_of,
       om.movement_type, om.operation_id,
       (om.reversal_of IS NOT NULL OR EXISTS (SELECT 1 FROM public.obligation_movements r WHERE r.reversal_of=om.id)) AS reversed
FROM public.obligation_movements om
WHERE om.movement_type IN ('settlement','settlement_reversal');
REVOKE ALL ON public.payable_settlement_history FROM PUBLIC, anon;
GRANT SELECT ON public.payable_settlement_history TO authenticated;

CREATE OR REPLACE FUNCTION public.record_expense_lifecycle_command(
  p_season_id uuid, p_category text, p_amount numeric, p_description text,
  p_payment_method text, p_partner_id uuid, p_supplier_id uuid,
  p_partner_name text, p_creditor_name text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','extensions' AS $$
DECLARE
 v_actor uuid := auth.uid(); v_mill uuid; v_previous jsonb; v_expense uuid; v_payable uuid;
 v_operation uuid; v_financial uuid; v_session uuid; v_cash numeric; v_name text; v_partner uuid := p_partner_id;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
 IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SEASON_NOT_FOUND'; END IF;
 v_previous := private.claim_business_command(p_idempotency_key,'record_expense',v_mill,p_season_id);
 IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR coalesce(btrim(p_category),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_INPUT_INVALID'; END IF;
 IF p_payment_method NOT IN ('cash','credit','partner') THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PAYMENT_METHOD_INVALID'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner','employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_CREATE_FORBIDDEN'; END IF;
 IF p_payment_method='cash' THEN
   SELECT id INTO v_session FROM public.cash_sessions WHERE mill_id=v_mill AND status='open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
   IF v_session IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CASH_SESSION_REQUIRED'; END IF;
   SELECT total_cash INTO v_cash FROM public.inventory WHERE mill_id=v_mill AND season_id=p_season_id FOR UPDATE;
   IF coalesce(v_cash,0)<p_amount THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INSUFFICIENT_CASH'; END IF;
 END IF;
 IF p_payment_method='credit' THEN
   SELECT name INTO v_name FROM public.suppliers WHERE id=p_supplier_id AND mill_id=v_mill;
   v_name:=coalesce(nullif(btrim(v_name),''),nullif(btrim(p_creditor_name),''),nullif(btrim(p_description),''),'دائن مصروف');
 ELSIF p_payment_method='partner' THEN
   IF v_partner IS NULL THEN
     v_name:=nullif(btrim(p_partner_name),''); IF v_name IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PARTNER_REQUIRED'; END IF;
     SELECT id INTO v_partner FROM public.partners WHERE mill_id=v_mill AND lower(trim(name))=lower(v_name) LIMIT 1;
     IF v_partner IS NULL THEN INSERT INTO public.partners(mill_id,name,active,created_at) VALUES(v_mill,v_name,true,now()) RETURNING id INTO v_partner; END IF;
   ELSE SELECT name INTO v_name FROM public.partners WHERE id=v_partner AND mill_id=v_mill; IF v_name IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PARTNER_NOT_FOUND'; END IF; END IF;
 END IF;
 IF p_payment_method IN ('credit','partner') THEN
   INSERT INTO public.payables(mill_id,season_id,type,partner_id,supplier_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,status,notes,created_by)
   VALUES(v_mill,p_season_id,CASE WHEN p_payment_method='partner' THEN 'due_to_partner' ELSE 'due_to_supplier' END,v_partner,p_supplier_id,v_name,p_amount,0,p_amount,'expense','unpaid',p_description,v_actor) RETURNING id INTO v_payable;
 END IF;
 INSERT INTO public.expenses(user_id,season_id,mill_id,category,amount,description,payment_method,partner_id,supplier_id,payable_id,cash_session_id)
 VALUES(v_actor,p_season_id,v_mill,btrim(p_category),p_amount,nullif(btrim(p_description),''),p_payment_method,v_partner,p_supplier_id,v_payable,v_session) RETURNING id INTO v_expense;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by)
 VALUES(v_mill,p_season_id,'expense','expense',v_expense,v_actor) RETURNING id INTO v_operation;
 IF v_payable IS NOT NULL THEN
   UPDATE public.payables SET source_id=v_expense WHERE id=v_payable;
   INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,reason,created_by)
   VALUES(v_payable,v_mill,p_season_id,v_operation,'opened',p_amount,p_description,v_actor);
 END IF;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,party_type,party_id,party_name)
 VALUES(v_actor,v_mill,p_season_id,'expense',p_amount,CASE WHEN p_payment_method='cash' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,
 CASE WHEN p_payment_method='cash' THEN 'cash'::financial_payment_method ELSE 'credit'::financial_payment_method END,v_expense,'expense',p_description,btrim(p_category),'active'::financial_tx_status,v_session,
 CASE WHEN p_payment_method='partner' THEN 'partner' WHEN p_payment_method='credit' THEN 'supplier' ELSE NULL END,coalesce(v_partner,p_supplier_id),v_name) RETURNING id INTO v_financial;
 IF p_payment_method='cash' THEN UPDATE public.inventory SET total_cash=total_cash-p_amount,updated_at=now() WHERE mill_id=v_mill AND season_id=p_season_id; END IF;
 PERFORM private.complete_business_command(p_idempotency_key,'record_expense',jsonb_build_object('success',true,'expense_id',v_expense,'payable_id',v_payable,'operation_id',v_operation,'financial_transaction_id',v_financial),v_operation);
 RETURN jsonb_build_object('success',true,'expense_id',v_expense,'payable_id',v_payable,'operation_id',v_operation,'financial_transaction_id',v_financial);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_expense_lifecycle_command(p_expense_id uuid,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_expense public.expenses%ROWTYPE; v_previous jsonb; v_operation uuid; v_financial public.financial_transactions%ROWTYPE; v_reverse uuid; v_reverse_op uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_expense FROM public.expenses WHERE id=p_expense_id FOR UPDATE;
 IF NOT FOUND OR v_expense.voided_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_NOT_CANCELLABLE'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'cancel_expense',v_expense.mill_id,v_expense.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_expense.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_CANCEL_FORBIDDEN'; END IF;
 IF v_expense.payable_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.payables p WHERE p.id=v_expense.payable_id AND p.paid_amount>0.001) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST'; END IF;
 SELECT * INTO v_financial FROM public.financial_transactions WHERE reference_type='expense' AND reference_id=v_expense.id AND reversal_of IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='EXPENSE_EFFECT_NOT_FOUND'; END IF;
 SELECT id INTO v_operation FROM public.business_operations WHERE source_type='expense' AND source_id=v_expense.id AND mill_id=v_expense.mill_id FOR UPDATE;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,reversal_of,reversal_reason)
 VALUES(v_actor,v_expense.mill_id,v_expense.season_id,'adjustment',v_financial.amount,CASE v_financial.direction WHEN 'out' THEN 'in'::financial_direction WHEN 'in' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,v_financial.payment_method,v_financial.id,'financial_reversal','إلغاء مصروف: '||p_reason,coalesce(v_financial.category,'reversal'),'active',v_financial.cash_session_id,v_financial.id,p_reason) RETURNING id INTO v_reverse;
 SELECT id INTO v_reverse_op FROM public.business_operations WHERE source_type='financial_reversal' AND source_id=v_financial.id AND mill_id=v_expense.mill_id;
 IF v_reverse_op IS NOT NULL THEN UPDATE public.business_operations SET reverses_operation_id=v_operation WHERE id=v_reverse_op; INSERT INTO public.business_operation_dependencies(parent_operation_id,child_operation_id,dependency_type) VALUES(v_operation,v_reverse_op,'reversal') ON CONFLICT DO NOTHING; END IF;
 IF v_expense.payment_method='cash' THEN UPDATE public.inventory SET total_cash=total_cash+v_expense.amount,updated_at=now() WHERE mill_id=v_expense.mill_id AND season_id=v_expense.season_id; ELSE UPDATE public.payables SET status='cancelled',remaining_amount=0,updated_at=now() WHERE id=v_expense.payable_id; INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,reason,created_by) VALUES(v_expense.payable_id,v_expense.mill_id,v_expense.season_id,v_operation,'cancelled',-v_expense.amount,p_reason,v_actor); END IF;
 UPDATE public.expenses SET voided_at=now(),voided_by=v_actor,void_reason=p_reason WHERE id=v_expense.id;
 UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=p_reason WHERE id=v_operation;
 PERFORM private.complete_business_command(p_idempotency_key,'cancel_expense',jsonb_build_object('success',true,'expense_id',v_expense.id,'reversal_id',v_reverse),v_operation);
 RETURN jsonb_build_object('success',true,'expense_id',v_expense.id,'reversal_id',v_reverse);
END; $$;

CREATE OR REPLACE FUNCTION public.settle_payable_lifecycle_command(p_payable_id uuid,p_amount numeric,p_payment_method text,p_notes text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_p public.payables%ROWTYPE; v_previous jsonb; v_session uuid; v_cash numeric; v_movement uuid:=gen_random_uuid(); v_operation uuid; v_financial uuid; v_remaining numeric;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_p FROM public.payables WHERE id=p_payable_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PAYABLE_NOT_FOUND'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'settle_payable',v_p.mill_id,v_p.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>v_p.remaining_amount THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SETTLEMENT_AMOUNT_INVALID'; END IF;
 IF p_payment_method NOT IN ('cash','other') THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PAYMENT_METHOD_INVALID'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_p.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PAYABLE_SETTLEMENT_FORBIDDEN'; END IF;
 IF p_payment_method='cash' THEN SELECT id INTO v_session FROM public.cash_sessions WHERE mill_id=v_p.mill_id AND status='open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE; IF v_session IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CASH_SESSION_REQUIRED'; END IF; SELECT total_cash INTO v_cash FROM public.inventory WHERE mill_id=v_p.mill_id AND season_id=v_p.season_id FOR UPDATE; IF coalesce(v_cash,0)<p_amount THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INSUFFICIENT_CASH'; END IF; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by) VALUES(v_p.mill_id,v_p.season_id,'payable_settlement','obligation_movement',v_movement,v_actor) RETURNING id INTO v_operation;
 IF p_payment_method='cash' THEN
   v_financial:=gen_random_uuid();
   INSERT INTO public.financial_transactions(id,created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,party_type,party_id,party_name) VALUES(v_financial,v_actor,v_p.mill_id,v_p.season_id,CASE WHEN v_p.type='due_to_partner' THEN 'owner_withdrawal'::financial_tx_type ELSE 'supplier_payment'::financial_tx_type END,p_amount,'out','cash',v_p.id,'payable_settlement','سداد التزام: '||v_p.creditor_name,'debt_settlement','active',v_session,CASE WHEN v_p.type='due_to_partner' THEN 'partner' ELSE 'supplier' END,coalesce(v_p.partner_id,v_p.supplier_id),v_p.creditor_name);
   UPDATE public.inventory SET total_cash=total_cash-p_amount,updated_at=now() WHERE mill_id=v_p.mill_id AND season_id=v_p.season_id;
 END IF;
 INSERT INTO public.obligation_movements(id,payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,cash_session_id,financial_transaction_id,reason,created_by) VALUES(v_movement,v_p.id,v_p.mill_id,v_p.season_id,v_operation,'settlement',-p_amount,p_payment_method,v_session,v_financial,p_notes,v_actor);
 v_remaining:=v_p.remaining_amount-p_amount; UPDATE public.payables SET paid_amount=paid_amount+p_amount,remaining_amount=v_remaining,status=CASE WHEN v_remaining<=0.001 THEN 'paid' ELSE 'partially_paid' END,updated_at=now() WHERE id=v_p.id;
 PERFORM private.complete_business_command(p_idempotency_key,'settle_payable',jsonb_build_object('success',true,'payable_id',v_p.id,'movement_id',v_movement,'operation_id',v_operation,'financial_transaction_id',v_financial,'remaining',v_remaining),v_operation);
 RETURN jsonb_build_object('success',true,'payable_id',v_p.id,'movement_id',v_movement,'operation_id',v_operation,'financial_transaction_id',v_financial,'remaining',v_remaining);
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_payable_settlement_lifecycle_command(p_movement_id uuid,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_m public.obligation_movements%ROWTYPE; v_p public.payables%ROWTYPE; v_previous jsonb; v_reverse uuid:=gen_random_uuid(); v_operation uuid; v_fin public.financial_transactions%ROWTYPE; v_fin_reverse uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_m FROM public.obligation_movements WHERE id=p_movement_id FOR UPDATE; IF NOT FOUND OR v_m.movement_type<>'settlement' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SETTLEMENT_NOT_REVERSIBLE'; END IF;
 SELECT * INTO v_p FROM public.payables WHERE id=v_m.payable_id FOR UPDATE;
 v_previous:=private.claim_business_command(p_idempotency_key,'reverse_payable_settlement',v_m.mill_id,v_m.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.obligation_movements WHERE reversal_of=v_m.id) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SETTLEMENT_ALREADY_REVERSED'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_m.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PAYABLE_SETTLEMENT_REVERSE_FORBIDDEN'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id) VALUES(v_m.mill_id,v_m.season_id,'payable_settlement_reversal','obligation_movement',v_reverse,v_actor,v_m.operation_id) RETURNING id INTO v_operation;
 INSERT INTO public.obligation_movements(id,payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,cash_session_id,reversal_of,reason,created_by) VALUES(v_reverse,v_m.payable_id,v_m.mill_id,v_m.season_id,v_operation,'settlement_reversal',-v_m.amount,v_m.payment_method,v_m.cash_session_id,v_m.id,p_reason,v_actor);
 IF v_m.payment_method='cash' THEN
   SELECT * INTO v_fin FROM public.financial_transactions WHERE id=v_m.financial_transaction_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SETTLEMENT_FINANCIAL_EFFECT_NOT_FOUND'; END IF;
   INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,reversal_of,reversal_reason) VALUES(v_actor,v_fin.mill_id,v_fin.season_id,'adjustment',v_fin.amount,'in',v_fin.payment_method,v_fin.id,'financial_reversal','عكس سداد التزام: '||p_reason,'debt_settlement','active',v_fin.cash_session_id,v_fin.id,p_reason) RETURNING id INTO v_fin_reverse;
   UPDATE public.inventory SET total_cash=total_cash+v_fin.amount,updated_at=now() WHERE mill_id=v_m.mill_id AND season_id=v_m.season_id;
 END IF;
 UPDATE public.payables SET paid_amount=greatest(0,paid_amount+v_m.amount),remaining_amount=least(original_amount,remaining_amount-v_m.amount),status=CASE WHEN remaining_amount-v_m.amount>=original_amount-0.001 THEN 'unpaid' ELSE 'partially_paid' END,updated_at=now() WHERE id=v_p.id;
 PERFORM private.complete_business_command(p_idempotency_key,'reverse_payable_settlement',jsonb_build_object('success',true,'payable_id',v_p.id,'reversal_movement_id',v_reverse,'financial_reversal_id',v_fin_reverse),v_operation);
 RETURN jsonb_build_object('success',true,'payable_id',v_p.id,'reversal_movement_id',v_reverse,'financial_reversal_id',v_fin_reverse);
END; $$;

REVOKE ALL ON FUNCTION public.record_expense_lifecycle_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid), public.cancel_expense_lifecycle_command(uuid,text,uuid), public.settle_payable_lifecycle_command(uuid,numeric,text,text,uuid), public.reverse_payable_settlement_lifecycle_command(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_lifecycle_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid), public.cancel_expense_lifecycle_command(uuid,text,uuid), public.settle_payable_lifecycle_command(uuid,numeric,text,text,uuid), public.reverse_payable_settlement_lifecycle_command(uuid,text,uuid) TO authenticated, service_role;
