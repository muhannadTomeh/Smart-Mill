-- Restore the active lifecycle commands after removal of their obsolete
-- cash-session implementations. Every cash effect is a ledger event only.

CREATE OR REPLACE FUNCTION public.record_expense_v2(p_season_id uuid,p_category text,p_amount numeric,p_description text,p_payment_method text,p_partner_id uuid,p_supplier_id uuid,p_partner_name text,p_creditor_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a uuid:=auth.uid(); m uuid; op uuid; e uuid; p uuid; f uuid; creditor text;
BEGIN
 SELECT mill_id INTO m FROM public.seasons WHERE id=p_season_id;
 IF a IS NULL OR m IS NULL OR NOT public.has_active_mill_role(m,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='EXPENSE_FORBIDDEN'; END IF;
 IF p_amount<=0 OR p_payment_method NOT IN ('cash','credit','partner') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='EXPENSE_INVALID'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(m,p_season_id,'expense','expense',a) RETURNING id INTO op;
 IF p_payment_method='credit' THEN
   SELECT coalesce(s.name,p_creditor_name,'دائن') INTO creditor FROM public.suppliers s WHERE s.id=p_supplier_id AND s.mill_id=m;
   INSERT INTO public.payables(mill_id,season_id,type,supplier_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,status,notes,created_by) VALUES(m,p_season_id,'due_to_supplier',p_supplier_id,creditor,p_amount,0,p_amount,'expense','unpaid',p_description,a) RETURNING id INTO p;
 ELSIF p_payment_method='partner' THEN
   SELECT coalesce(x.name,p_partner_name,'شريك') INTO creditor FROM public.partners x WHERE x.id=p_partner_id AND x.mill_id=m;
   INSERT INTO public.payables(mill_id,season_id,type,partner_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,status,notes,created_by) VALUES(m,p_season_id,'due_to_partner',p_partner_id,creditor,p_amount,0,p_amount,'expense','unpaid',p_description,a) RETURNING id INTO p;
 END IF;
 INSERT INTO public.expenses(user_id,mill_id,season_id,category,amount,description,payment_method,partner_id,supplier_id,payable_id) VALUES(a,m,p_season_id,p_category,p_amount,p_description,p_payment_method,p_partner_id,p_supplier_id,p) RETURNING id INTO e;
 UPDATE public.business_operations SET source_id=e WHERE id=op;
 UPDATE public.payables SET source_id=e WHERE id=p;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id) VALUES(a,m,p_season_id,'expense','expense',p_amount,CASE WHEN p_payment_method='cash' THEN 'out' ELSE 'none' END,CASE WHEN p_payment_method='cash' THEN 'cash' ELSE 'credit' END,'expense',e,CASE WHEN p_payment_method='partner' THEN 'partner' WHEN p_payment_method='credit' THEN 'supplier' ELSE NULL END,coalesce(p_partner_id,p_supplier_id),creditor,p_description,'active',op) RETURNING id INTO f;
 RETURN jsonb_build_object('success',true,'expense_id',e,'payable_id',p,'financial_transaction_id',f);
END $$;

CREATE OR REPLACE FUNCTION public.settle_payable_atomic(p_payable_id uuid,p_amount numeric,p_payment_method text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a uuid:=auth.uid(); x public.payables%ROWTYPE; op uuid; f uuid;
BEGIN
 SELECT * INTO x FROM public.payables WHERE id=p_payable_id FOR UPDATE;
 IF NOT FOUND OR a IS NULL OR NOT public.has_active_mill_role(x.mill_id,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYABLE_SETTLEMENT_FORBIDDEN'; END IF;
 IF p_amount<=0 OR p_amount>x.remaining_amount OR p_payment_method NOT IN ('cash','other') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYABLE_SETTLEMENT_INVALID'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(x.mill_id,x.season_id,'payable_settlement','payable_settlement',a) RETURNING id INTO op;
 UPDATE public.payables SET paid_amount=paid_amount+p_amount,remaining_amount=remaining_amount-p_amount,status=CASE WHEN remaining_amount-p_amount=0 THEN 'paid' ELSE 'partially_paid' END,updated_at=now() WHERE id=x.id;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id) VALUES(a,x.mill_id,x.season_id,'supplier_payment','payable_settlement',p_amount,CASE WHEN p_payment_method='cash' THEN 'out' ELSE 'none' END,CASE WHEN p_payment_method='cash' THEN 'cash' ELSE 'credit' END,'payable',x.id,CASE WHEN x.partner_id IS NULL THEN 'supplier' ELSE 'partner' END,coalesce(x.partner_id,x.supplier_id),x.creditor_name,p_notes,'active',op) RETURNING id INTO f;
 RETURN jsonb_build_object('success',true,'financial_transaction_id',f);
END $$;

CREATE OR REPLACE FUNCTION public.record_customer_payment_atomic(p_season_id uuid,p_customer_id uuid,p_amount numeric,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a uuid:=auth.uid(); m uuid; id uuid; op uuid;
BEGIN
 SELECT mill_id INTO m FROM public.seasons WHERE id=p_season_id;
 IF a IS NULL OR m IS NULL OR NOT public.has_active_mill_role(m,ARRAY['mill_owner','mill_employee']) OR p_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CUSTOMER_PAYMENT_INVALID'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(m,p_season_id,'customer_payment','customer_payment',a) RETURNING id INTO op;
 INSERT INTO public.customer_payments(mill_id,season_id,customer_id,amount,payment_method,notes,created_by) VALUES(m,p_season_id,p_customer_id,p_amount,'cash',p_notes,a) RETURNING id INTO id;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,description,status,operation_id) VALUES(a,m,p_season_id,'customer_payment','customer_collection',p_amount,'in','cash','customer_payment',id,'customer',p_customer_id,p_notes,'active',op);
 RETURN id;
END $$;

CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(p_user_id uuid,p_season_id uuid,p_worker_id uuid,p_amount numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m uuid; op uuid; pay uuid;
BEGIN
 SELECT mill_id INTO m FROM public.seasons WHERE id=p_season_id;
 IF m IS NULL OR p_amount<=0 OR NOT public.has_active_mill_role(m,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_FORBIDDEN'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(m,p_season_id,'worker_payment','worker_payment',auth.uid()) RETURNING id INTO op;
 INSERT INTO public.worker_payments(user_id,mill_id,season_id,worker_id,amount,notes) VALUES(p_user_id,m,p_season_id,p_worker_id,p_amount,p_notes) RETURNING id INTO pay;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,description,status,operation_id) VALUES(auth.uid(),m,p_season_id,'worker_payment','worker_payment',p_amount,'out','cash','worker_payment',pay,p_notes,'active',op);
END $$;

CREATE OR REPLACE FUNCTION public.record_partner_transaction_atomic(p_season_id uuid,p_partner_id uuid,p_type text,p_amount numeric,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a uuid:=auth.uid(); m uuid; op uuid; f uuid; partner_name text;
BEGIN
 SELECT s.mill_id,p.name INTO m,partner_name FROM public.seasons s JOIN public.partners p ON p.id=p_partner_id AND p.mill_id=s.mill_id WHERE s.id=p_season_id;
 IF a IS NULL OR m IS NULL OR p_amount<=0 OR p_type NOT IN ('deposit','withdrawal') OR NOT public.has_active_mill_role(m,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_TRANSACTION_FORBIDDEN'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(m,p_season_id,'partner_transaction','partner_transaction',a) RETURNING id INTO op;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,party_type,party_id,party_name,description,status,operation_id) VALUES(a,m,p_season_id,CASE WHEN p_type='deposit' THEN 'owner_deposit' ELSE 'owner_withdrawal' END,'partner_transaction',p_amount,CASE WHEN p_type='deposit' THEN 'in' ELSE 'out' END,'cash','partner_transaction','partner',p_partner_id,partner_name,p_notes,'active',op) RETURNING id INTO f;
 RETURN jsonb_build_object('success',true,'financial_transaction_id',f);
END $$;

REVOKE ALL ON FUNCTION public.record_expense_v2(uuid,text,numeric,text,text,uuid,uuid,text,text),public.settle_payable_atomic(uuid,numeric,text,text),public.record_customer_payment_atomic(uuid,uuid,numeric,text),public.pay_worker_and_settle(uuid,uuid,uuid,numeric,text),public.record_partner_transaction_atomic(uuid,uuid,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_expense_v2(uuid,text,numeric,text,text,uuid,uuid,text,text),public.settle_payable_atomic(uuid,numeric,text,text),public.record_customer_payment_atomic(uuid,uuid,numeric,text),public.pay_worker_and_settle(uuid,uuid,uuid,numeric,text),public.record_partner_transaction_atomic(uuid,uuid,text,numeric,text) TO authenticated;
