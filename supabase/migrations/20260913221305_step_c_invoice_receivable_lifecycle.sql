-- Step C: canonical source commands for invoices and customer collections.
-- The established invoice calculation remains intact; this layer adds one
-- idempotent envelope, an append-only receivable ledger and source cancellation.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE TABLE public.invoice_effect_links (
  invoice_id uuid PRIMARY KEY REFERENCES public.invoices(id) ON DELETE RESTRICT,
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  cash_financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  settlement_oil_movement_id uuid REFERENCES public.oil_movements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_effect_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_effect_links_read_tenant ON public.invoice_effect_links FOR SELECT TO authenticated
USING (public.is_platform_admin((SELECT auth.uid())) OR public.check_user_mill_access(mill_id));
REVOKE ALL ON TABLE public.invoice_effect_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.invoice_effect_links TO authenticated;
GRANT ALL ON TABLE public.invoice_effect_links TO service_role;
CREATE OR REPLACE FUNCTION private.reject_invoice_effect_link_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_EFFECT_LINK_IMMUTABLE'; END; $$;
CREATE TRIGGER trg_protect_invoice_effect_links BEFORE UPDATE OR DELETE ON public.invoice_effect_links
FOR EACH ROW EXECUTE FUNCTION private.reject_invoice_effect_link_mutation();

CREATE TABLE public.receivable_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  customer_payment_id uuid REFERENCES public.customer_payments(id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('invoice_charge','collection','collection_reversal','invoice_cancelled','adjustment')),
  amount numeric NOT NULL CHECK (amount <> 0),
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  reversal_of uuid REFERENCES public.receivable_movements(id) ON DELETE RESTRICT,
  reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((movement_type <> 'collection_reversal') OR reversal_of IS NOT NULL)
);
CREATE INDEX receivable_movements_customer_idx ON public.receivable_movements(mill_id,season_id,customer_id,created_at);
CREATE UNIQUE INDEX receivable_movements_reversal_idx ON public.receivable_movements(reversal_of) WHERE reversal_of IS NOT NULL;
ALTER TABLE public.receivable_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY receivable_movements_read_tenant ON public.receivable_movements FOR SELECT TO authenticated
USING (public.is_platform_admin((SELECT auth.uid())) OR public.check_user_mill_access(mill_id));
REVOKE ALL ON TABLE public.receivable_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.receivable_movements TO authenticated;
GRANT ALL ON TABLE public.receivable_movements TO service_role;

CREATE OR REPLACE FUNCTION private.reject_receivable_movement_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RECEIVABLE_HISTORY_IMMUTABLE'; END; $$;
CREATE TRIGGER trg_protect_receivable_movements BEFORE UPDATE OR DELETE ON public.receivable_movements
FOR EACH ROW EXECUTE FUNCTION private.reject_receivable_movement_mutation();

CREATE OR REPLACE VIEW public.customer_receivable_balances WITH (security_invoker=true) AS
SELECT mill_id,season_id,customer_id,
 coalesce(sum(amount),0) AS outstanding_amount
FROM public.receivable_movements GROUP BY mill_id,season_id,customer_id;
REVOKE ALL ON public.customer_receivable_balances FROM PUBLIC, anon;
GRANT SELECT ON public.customer_receivable_balances TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_lifecycle_command(
 p_season_id uuid,p_customer_name text,p_oil_produced numeric,p_container_count integer,p_container_type text,
 p_payment_type text,p_oil_amount numeric,p_cash_amount numeric,p_total_display text,p_customer_id uuid,
 p_queue_id uuid,p_container_lines jsonb DEFAULT '[]'::jsonb,p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_mill uuid; v_previous jsonb; v_invoice uuid; v_operation uuid; v_cash_effect uuid; v_oil_effect uuid; v_cash_count integer; v_oil_count integer; v_unpaid numeric;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
 IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SEASON_NOT_FOUND'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'create_invoice',v_mill,p_season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_CREATE_FORBIDDEN'; END IF;
 IF jsonb_typeof(coalesce(p_container_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CONTAINER_LINES_INVALID'; END IF;
 IF jsonb_array_length(coalesce(p_container_lines,'[]'::jsonb))>0 THEN
   v_invoice:=public.create_invoice_with_containers_command(p_season_id,p_customer_name,p_oil_produced,p_container_count,p_container_type,p_payment_type,p_oil_amount,p_cash_amount,p_total_display,p_customer_id,p_queue_id,p_container_lines,p_idempotency_key);
 ELSE
   v_invoice:=public.create_invoice_command(p_season_id,p_customer_name,p_oil_produced,p_container_count,p_container_type,p_payment_type,p_oil_amount,p_cash_amount,p_total_display,p_customer_id,p_queue_id,p_idempotency_key);
 END IF;
 SELECT id INTO v_operation FROM public.business_operations WHERE mill_id=v_mill AND source_type='invoice' AND source_id=v_invoice;
 IF v_operation IS NULL THEN
   INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by) VALUES(v_mill,p_season_id,'invoice','invoice',v_invoice,v_actor) RETURNING id INTO v_operation;
 END IF;
 SELECT count(*),(array_agg(id))[1] INTO v_cash_count,v_cash_effect FROM public.financial_transactions WHERE reference_type='invoice' AND reference_id=v_invoice AND reversal_of IS NULL AND status='active';
 IF coalesce(p_cash_amount,0)>0 AND v_cash_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_CASH_EFFECT_LINK_INVALID'; END IF;
 IF coalesce(p_cash_amount,0)=0 AND v_cash_count<>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_UNEXPECTED_CASH_EFFECT'; END IF;
 SELECT count(*),(array_agg(id))[1] INTO v_oil_count,v_oil_effect FROM public.oil_movements WHERE reference_type='invoice' AND reference_id=v_invoice AND source_type='milling_settlement' AND movement_type='IN';
 IF coalesce(p_oil_amount,0)>0 AND v_oil_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_OIL_EFFECT_LINK_INVALID'; END IF;
 IF coalesce(p_oil_amount,0)=0 AND v_oil_count<>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_UNEXPECTED_OIL_EFFECT'; END IF;
 INSERT INTO public.invoice_effect_links(invoice_id,mill_id,season_id,operation_id,cash_financial_transaction_id,settlement_oil_movement_id) VALUES(v_invoice,v_mill,p_season_id,v_operation,v_cash_effect,v_oil_effect);
 SELECT coalesce(unpaid_amount,0) INTO v_unpaid FROM public.invoices WHERE id=v_invoice;
 IF v_unpaid>0 AND p_customer_id IS NOT NULL THEN INSERT INTO public.receivable_movements(mill_id,season_id,customer_id,invoice_id,operation_id,movement_type,amount,created_by) VALUES(v_mill,p_season_id,p_customer_id,v_invoice,v_operation,'invoice_charge',v_unpaid,v_actor); END IF;
 PERFORM private.complete_business_command(p_idempotency_key,'create_invoice',jsonb_build_object('success',true,'invoice_id',v_invoice,'operation_id',v_operation),v_operation);
 RETURN jsonb_build_object('success',true,'invoice_id',v_invoice,'operation_id',v_operation);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_invoice_lifecycle_command(p_invoice_id uuid,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_i public.invoices%ROWTYPE; v_previous jsonb; v_operation uuid; v_link public.invoice_effect_links%ROWTYPE; v_fin public.financial_transactions%ROWTYPE; v_fin_reverse uuid; v_oil public.oil_movements%ROWTYPE; v_stock record; v_reverse_operation uuid; v_receivable_outstanding numeric;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_i FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v_i.voided_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_NOT_CANCELLABLE'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'cancel_invoice',v_i.mill_id,v_i.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_i.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_CANCEL_FORBIDDEN'; END IF;
 IF EXISTS (SELECT 1 FROM public.receivable_movements WHERE invoice_id=v_i.id AND movement_type='collection' AND NOT EXISTS (SELECT 1 FROM public.receivable_movements reversal WHERE reversal.reversal_of=receivable_movements.id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_HAS_COLLECTIONS_REVERSE_COLLECTIONS_FIRST'; END IF;
 SELECT id INTO v_operation FROM public.business_operations WHERE mill_id=v_i.mill_id AND source_type='invoice' AND source_id=v_i.id FOR UPDATE;
 IF v_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_OPERATION_NOT_FOUND'; END IF;
 SELECT * INTO v_link FROM public.invoice_effect_links WHERE invoice_id=v_i.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_EFFECT_LINK_NOT_FOUND'; END IF;
 IF coalesce(v_i.cash_amount,0)>0 THEN
   SELECT * INTO v_fin FROM public.financial_transactions WHERE id=v_link.cash_financial_transaction_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_CASH_EFFECT_NOT_FOUND'; END IF;
   INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,reversal_of,reversal_reason)
   VALUES(v_actor,v_i.mill_id,v_i.season_id,'adjustment',v_fin.amount,'out',v_fin.payment_method,v_fin.id,'financial_reversal','إلغاء فاتورة: '||p_reason,'invoice','active',v_fin.cash_session_id,v_fin.id,p_reason) RETURNING id INTO v_fin_reverse;
   UPDATE public.inventory SET total_cash=total_cash-v_fin.amount,updated_at=now() WHERE mill_id=v_i.mill_id AND season_id=v_i.season_id;
 END IF;
 SELECT * INTO v_oil FROM public.oil_movements WHERE id=v_link.settlement_oil_movement_id FOR UPDATE;
 IF FOUND THEN
   INSERT INTO public.oil_movements(mill_id,season_id,ownership,direction,movement_type,source_type,quantity,amount,unit_price,party_name,notes,reference_type,reference_id,created_by,idempotency_key)
   VALUES(v_i.mill_id,v_i.season_id,'mill','out','OUT','adjustment',v_oil.quantity,v_oil.quantity,0,v_i.customer_name,'إلغاء تسوية فاتورة: '||p_reason,'invoice_reversal',v_i.id,v_actor,p_idempotency_key);
   UPDATE public.inventory SET total_oil=total_oil-v_oil.quantity,updated_at=now() WHERE mill_id=v_i.mill_id AND season_id=v_i.season_id;
 END IF;
 FOR v_stock IN SELECT product_id,quantity FROM public.product_stock_movements WHERE reference_type='invoice' AND reference_id=v_i.id AND quantity<0 LOOP
   INSERT INTO public.product_stock_movements(mill_id,season_id,product_id,quantity,type,reference_type,reference_id,notes,created_by)
   VALUES(v_i.mill_id,v_i.season_id,v_stock.product_id,-v_stock.quantity,'adjustment','invoice_reversal',v_i.id,'إلغاء عبوات فاتورة: '||p_reason,v_actor);
   UPDATE public.products SET current_stock=current_stock-v_stock.quantity,updated_at=now() WHERE id=v_stock.product_id;
 END LOOP;
 IF v_i.customer_id IS NOT NULL THEN
   SELECT coalesce(sum(amount),0) INTO v_receivable_outstanding FROM public.receivable_movements WHERE invoice_id=v_i.id;
   IF v_receivable_outstanding<>0 THEN
     INSERT INTO public.receivable_movements(mill_id,season_id,customer_id,invoice_id,operation_id,movement_type,amount,reason,created_by)
     VALUES(v_i.mill_id,v_i.season_id,v_i.customer_id,v_i.id,v_operation,'invoice_cancelled',-v_receivable_outstanding,p_reason,v_actor);
   END IF;
 END IF;
 UPDATE public.invoices SET voided_at=now(),voided_by=v_actor,void_reason=p_reason WHERE id=v_i.id;
 UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=p_reason WHERE id=v_operation;
 SELECT id INTO v_reverse_operation FROM public.business_operations WHERE source_type='financial_reversal' AND source_id=v_fin.id AND mill_id=v_i.mill_id;
 IF v_reverse_operation IS NOT NULL THEN UPDATE public.business_operations SET reverses_operation_id=v_operation WHERE id=v_reverse_operation; END IF;
 PERFORM private.complete_business_command(p_idempotency_key,'cancel_invoice',jsonb_build_object('success',true,'invoice_id',v_i.id,'cash_reversal_id',v_fin_reverse),v_operation);
 RETURN jsonb_build_object('success',true,'invoice_id',v_i.id,'cash_reversal_id',v_fin_reverse);
END; $$;

CREATE OR REPLACE FUNCTION public.collect_invoice_receivable_lifecycle_command(p_invoice_id uuid,p_amount numeric,p_notes text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_i public.invoices%ROWTYPE; v_previous jsonb; v_outstanding numeric; v_payment uuid; v_financial uuid; v_fin_count integer; v_operation uuid; v_movement uuid:=gen_random_uuid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_i FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v_i.voided_at IS NOT NULL OR v_i.customer_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_RECEIVABLE_NOT_AVAILABLE'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'collect_invoice_receivable',v_i.mill_id,v_i.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_AMOUNT_INVALID'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_i.mill_id,ARRAY['mill_owner','employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_FORBIDDEN'; END IF;
 SELECT coalesce(sum(amount),0) INTO v_outstanding FROM public.receivable_movements WHERE invoice_id=v_i.id;
 IF p_amount>v_outstanding THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_EXCEEDS_RECEIVABLE'; END IF;
 v_payment:=public.record_customer_payment_command(v_i.season_id,v_i.customer_id,p_amount,p_notes,p_idempotency_key);
 SELECT count(*),(array_agg(id))[1] INTO v_fin_count,v_financial FROM public.financial_transactions WHERE reference_type='customer_payment' AND reference_id=v_payment AND reversal_of IS NULL AND status='active';
 IF v_fin_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_FINANCIAL_EFFECT_LINK_INVALID'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by) VALUES(v_i.mill_id,v_i.season_id,'invoice_collection','receivable_movement',v_movement,v_actor) RETURNING id INTO v_operation;
 INSERT INTO public.receivable_movements(id,mill_id,season_id,customer_id,invoice_id,customer_payment_id,operation_id,movement_type,amount,financial_transaction_id,reason,created_by) VALUES(v_movement,v_i.mill_id,v_i.season_id,v_i.customer_id,v_i.id,v_payment,v_operation,'collection',-p_amount,v_financial,p_notes,v_actor);
 PERFORM private.complete_business_command(p_idempotency_key,'collect_invoice_receivable',jsonb_build_object('success',true,'invoice_id',v_i.id,'movement_id',v_movement,'customer_payment_id',v_payment),v_operation);
 RETURN jsonb_build_object('success',true,'invoice_id',v_i.id,'movement_id',v_movement,'customer_payment_id',v_payment);
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_invoice_collection_lifecycle_command(p_movement_id uuid,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_m public.receivable_movements%ROWTYPE; v_previous jsonb; v_invoice public.invoices%ROWTYPE; v_fin public.financial_transactions%ROWTYPE; v_reverse_movement uuid:=gen_random_uuid(); v_operation uuid; v_fin_reverse uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO v_m FROM public.receivable_movements WHERE id=p_movement_id FOR UPDATE;
 IF NOT FOUND OR v_m.movement_type<>'collection' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_NOT_REVERSIBLE'; END IF;
 SELECT * INTO v_invoice FROM public.invoices WHERE id=v_m.invoice_id FOR UPDATE;
 v_previous:=private.claim_business_command(p_idempotency_key,'reverse_invoice_collection',v_m.mill_id,v_m.season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.receivable_movements WHERE reversal_of=v_m.id) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_ALREADY_REVERSED'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_m.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_REVERSE_FORBIDDEN'; END IF;
 SELECT * INTO v_fin FROM public.financial_transactions WHERE id=v_m.financial_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='COLLECTION_FINANCIAL_EFFECT_NOT_FOUND'; END IF;
 INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id) VALUES(v_m.mill_id,v_m.season_id,'invoice_collection_reversal','receivable_movement',v_reverse_movement,v_actor,v_m.operation_id) RETURNING id INTO v_operation;
 INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,cash_session_id,reversal_of,reversal_reason) VALUES(v_actor,v_fin.mill_id,v_fin.season_id,'adjustment',v_fin.amount,'out',v_fin.payment_method,v_fin.id,'financial_reversal','عكس تحصيل فاتورة: '||p_reason,'customer_payment','active',v_fin.cash_session_id,v_fin.id,p_reason) RETURNING id INTO v_fin_reverse;
 INSERT INTO public.receivable_movements(id,mill_id,season_id,customer_id,invoice_id,customer_payment_id,operation_id,movement_type,amount,financial_transaction_id,reversal_of,reason,created_by) VALUES(v_reverse_movement,v_m.mill_id,v_m.season_id,v_m.customer_id,v_m.invoice_id,v_m.customer_payment_id,v_operation,'collection_reversal',-v_m.amount,v_fin_reverse,v_m.id,p_reason,v_actor);
 UPDATE public.inventory SET total_cash=total_cash-v_fin.amount,updated_at=now() WHERE mill_id=v_m.mill_id AND season_id=v_m.season_id;
 PERFORM private.complete_business_command(p_idempotency_key,'reverse_invoice_collection',jsonb_build_object('success',true,'invoice_id',v_invoice.id,'reversal_movement_id',v_reverse_movement,'financial_reversal_id',v_fin_reverse),v_operation);
 RETURN jsonb_build_object('success',true,'invoice_id',v_invoice.id,'reversal_movement_id',v_reverse_movement,'financial_reversal_id',v_fin_reverse);
END; $$;

REVOKE ALL ON FUNCTION public.create_invoice_lifecycle_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid), public.cancel_invoice_lifecycle_command(uuid,text,uuid), public.collect_invoice_receivable_lifecycle_command(uuid,numeric,text,uuid), public.reverse_invoice_collection_lifecycle_command(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_lifecycle_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid), public.cancel_invoice_lifecycle_command(uuid,text,uuid), public.collect_invoice_receivable_lifecycle_command(uuid,numeric,text,uuid), public.reverse_invoice_collection_lifecycle_command(uuid,text,uuid) TO authenticated,service_role;
