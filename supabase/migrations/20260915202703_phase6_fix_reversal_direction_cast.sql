-- Recreate the two lifecycle commands with explicit enum casts accepted by
-- PostgreSQL when the opposite direction is computed from a CASE expression.
CREATE OR REPLACE FUNCTION public.cancel_product_purchase_command(p_purchase_id uuid,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a uuid:=auth.uid(); p public.product_purchases%ROWTYPE; payable public.payables%ROWTYPE; fin public.financial_transactions%ROWTYPE; previous jsonb; op uuid; original_op uuid; reverse_fin uuid; reverse_stock uuid; stock integer;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 SELECT * INTO p FROM public.product_purchases WHERE id=p_purchase_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_NOT_FOUND'; END IF;
 IF NOT public.is_platform_admin(a) AND NOT public.has_active_mill_role(p.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_CANCEL_FORBIDDEN'; END IF;
 IF p.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_ALREADY_CANCELLED'; END IF;
 previous:=private.claim_business_command(p_idempotency_key,'cancel_product_purchase',p.mill_id,p.season_id); IF previous IS NOT NULL THEN RETURN previous; END IF;
 SELECT current_stock INTO stock FROM public.products WHERE id=p.product_id AND mill_id=p.mill_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_NOT_FOUND'; END IF; IF stock<p.quantity THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INSUFFICIENT_STOCK_FOR_CANCELLATION'; END IF;
 SELECT * INTO payable FROM public.payables WHERE source_type IN ('product_purchase','purchase') AND source_id=p.id FOR UPDATE; IF FOUND AND payable.paid_amount>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='DEPENDENT_SETTLEMENT_EXISTS'; END IF;
 SELECT * INTO fin FROM public.financial_transactions WHERE reference_type='product_purchase' AND reference_id=p.id AND reversal_of IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_LEDGER_EVENT_NOT_FOUND'; END IF; IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE reversal_of=fin.id) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_ALREADY_CANCELLED'; END IF;
 original_op:=fin.operation_id;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id) VALUES(p.mill_id,p.season_id,'product_purchase_cancellation','product_purchase',p.id,a,original_op) RETURNING id INTO op;
 INSERT INTO public.product_stock_movements(mill_id,season_id,product_id,quantity,type,reference_type,reference_id,notes,created_by,idempotency_key) VALUES(p.mill_id,p.season_id,p.product_id,-p.quantity,'adjustment','product_purchase_cancellation',p.id,'إلغاء شراء بضاعة: '||btrim(p_reason),a,p_idempotency_key) RETURNING id INTO reverse_stock;
 UPDATE public.products SET current_stock=current_stock-p.quantity,updated_at=now() WHERE id=p.product_id;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id,idempotency_key,reversal_of,reversal_reason) VALUES(a,p.mill_id,p.season_id,'adjustment','product_purchase_cancellation',fin.amount,(CASE fin.direction WHEN 'in'::public.financial_direction THEN 'out' WHEN 'out'::public.financial_direction THEN 'in' ELSE 'none' END)::public.financial_direction,fin.payment_method,'product_purchase_cancellation',p.id,fin.party_type,fin.party_id,fin.party_name,'إلغاء شراء بضاعة: '||btrim(p_reason),'active',op,p_idempotency_key,fin.id,btrim(p_reason)) RETURNING id INTO reverse_fin;
 IF payable.id IS NOT NULL THEN UPDATE public.payables SET paid_amount=0,remaining_amount=0,status='cancelled',updated_at=now() WHERE id=payable.id; END IF;
 UPDATE public.business_operations SET status='cancelled',cancelled_by=a,cancelled_at=now(),cancellation_reason=btrim(p_reason) WHERE id=original_op;
 UPDATE public.product_purchases SET status='cancelled',cancelled_by=a,cancelled_at=now(),cancellation_reason=btrim(p_reason),cancellation_operation_id=op WHERE id=p.id;
 PERFORM private.complete_business_command(p_idempotency_key,'cancel_product_purchase',jsonb_build_object('success',true,'purchase_id',p.id,'stock_reversal_id',reverse_stock,'financial_reversal_id',reverse_fin,'payable_id',payable.id),op);
 RETURN jsonb_build_object('success',true,'purchase_id',p.id,'stock_reversal_id',reverse_stock,'financial_reversal_id',reverse_fin,'payable_id',payable.id);
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_partner_transaction_command(p_financial_transaction_id uuid,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a uuid:=auth.uid(); f public.financial_transactions%ROWTYPE; previous jsonb; op uuid; reverse_fin uuid;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF; IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 SELECT * INTO f FROM public.financial_transactions WHERE id=p_financial_transaction_id FOR UPDATE; IF NOT FOUND OR f.reference_type<>'partner_transaction' OR f.reversal_of IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_TRANSACTION_NOT_REVERSIBLE'; END IF; IF NOT public.is_platform_admin(a) AND NOT public.has_active_mill_role(f.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_TRANSACTION_REVERSE_FORBIDDEN'; END IF; IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE reversal_of=f.id) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_TRANSACTION_ALREADY_REVERSED'; END IF;
 previous:=private.claim_business_command(p_idempotency_key,'reverse_partner_transaction',f.mill_id,f.season_id); IF previous IS NOT NULL THEN RETURN previous; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id) VALUES(f.mill_id,f.season_id,'partner_transaction_reversal','financial_transaction',f.id,a,f.operation_id) RETURNING id INTO op;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id,idempotency_key,reversal_of,reversal_reason) VALUES(a,f.mill_id,f.season_id,'adjustment','partner_transaction_reversal',f.amount,(CASE f.direction WHEN 'in'::public.financial_direction THEN 'out' ELSE 'in' END)::public.financial_direction,'cash','partner_transaction_reversal',f.id,f.party_type,f.party_id,f.party_name,'عكس حركة شريك: '||btrim(p_reason),'active',op,p_idempotency_key,f.id,btrim(p_reason)) RETURNING id INTO reverse_fin;
 UPDATE public.business_operations SET status='cancelled',cancelled_by=a,cancelled_at=now(),cancellation_reason=btrim(p_reason) WHERE id=f.operation_id;
 PERFORM private.complete_business_command(p_idempotency_key,'reverse_partner_transaction',jsonb_build_object('success',true,'financial_reversal_id',reverse_fin),op); RETURN jsonb_build_object('success',true,'financial_reversal_id',reverse_fin);
END; $$;

REVOKE ALL ON FUNCTION public.cancel_product_purchase_command(uuid,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reverse_partner_transaction_command(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_product_purchase_command(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_partner_transaction_command(uuid,text,uuid) TO authenticated;
