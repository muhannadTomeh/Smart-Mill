-- A deferred invoice never books cash at issue time. Its cash portion is an
-- immutable invoice_charge that must later be collected through Step C.
CREATE OR REPLACE FUNCTION public.create_deferred_invoice_lifecycle_command(
  p_season_id uuid,p_customer_name text,p_oil_produced numeric,p_container_count integer,p_container_type text,
  p_oil_amount numeric,p_receivable_amount numeric,p_total_display text,p_customer_id uuid,p_queue_id uuid,
  p_container_lines jsonb DEFAULT '[]'::jsonb,p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','extensions' AS $$
DECLARE v_actor uuid:=auth.uid(); v_mill uuid; v_previous jsonb; v_inner_key uuid:=gen_random_uuid(); v_result jsonb; v_invoice uuid; v_operation uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
 IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SEASON_NOT_FOUND'; END IF;
 v_previous:=private.claim_business_command(p_idempotency_key,'create_deferred_invoice',v_mill,p_season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
 IF p_customer_id IS NULL OR p_receivable_amount IS NULL OR p_receivable_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='DEFERRED_INVOICE_INPUT_INVALID'; END IF;
 IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_CREATE_FORBIDDEN'; END IF;
 v_result:=public.create_invoice_lifecycle_command(p_season_id,p_customer_name,p_oil_produced,p_container_count,p_container_type,'credit',p_oil_amount,0,p_total_display,p_customer_id,p_queue_id,p_container_lines,v_inner_key);
 v_invoice:=(v_result->>'invoice_id')::uuid; v_operation:=(v_result->>'operation_id')::uuid;
 UPDATE public.invoices SET payment_type='credit',unpaid_amount=p_receivable_amount WHERE id=v_invoice;
 INSERT INTO public.receivable_movements(mill_id,season_id,customer_id,invoice_id,operation_id,movement_type,amount,reason,created_by)
 VALUES(v_mill,p_season_id,p_customer_id,v_invoice,v_operation,'invoice_charge',p_receivable_amount,'ذمة فاتورة آجلة',v_actor);
 PERFORM private.complete_business_command(p_idempotency_key,'create_deferred_invoice',jsonb_build_object('success',true,'invoice_id',v_invoice,'operation_id',v_operation,'receivable_amount',p_receivable_amount),v_operation);
 RETURN jsonb_build_object('success',true,'invoice_id',v_invoice,'operation_id',v_operation,'receivable_amount',p_receivable_amount);
END; $$;
REVOKE ALL ON FUNCTION public.create_deferred_invoice_lifecycle_command(uuid,text,numeric,integer,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_deferred_invoice_lifecycle_command(uuid,text,numeric,integer,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) TO authenticated,service_role;
