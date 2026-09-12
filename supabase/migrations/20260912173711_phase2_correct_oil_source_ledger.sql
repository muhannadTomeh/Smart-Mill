-- Canonical oil model: every balance-changing oil row is mill inventory and
-- records how it entered or left. `ownership` remains only for old-row compatibility.
ALTER TABLE public.oil_movements
  ADD COLUMN IF NOT EXISTS movement_type text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS quantity numeric;
UPDATE public.oil_movements
SET movement_type = coalesce(movement_type, upper(direction)),
    source_type = coalesce(source_type, CASE WHEN direction='in' THEN 'oil_purchase' ELSE 'oil_sale' END),
    quantity = coalesce(quantity, amount),
    ownership = 'mill';
ALTER TABLE public.oil_movements
  ALTER COLUMN movement_type SET NOT NULL,
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.oil_movements
  DROP CONSTRAINT IF EXISTS oil_movements_movement_type_check,
  ADD CONSTRAINT oil_movements_movement_type_check CHECK (movement_type IN ('IN','OUT')),
  DROP CONSTRAINT IF EXISTS oil_movements_source_type_check,
  ADD CONSTRAINT oil_movements_source_type_check CHECK (source_type IN ('milling_settlement','oil_purchase','oil_sale','opening_balance','adjustment')),
  DROP CONSTRAINT IF EXISTS oil_movements_quantity_positive_check,
  ADD CONSTRAINT oil_movements_quantity_positive_check CHECK (quantity > 0);
CREATE INDEX IF NOT EXISTS oil_movements_source_report_idx ON public.oil_movements (mill_id,season_id,source_type,movement_type,created_at DESC);

CREATE OR REPLACE VIEW public.mill_oil_balance
WITH (security_invoker = true) AS
SELECT mill_id, season_id,
  coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END),0) AS current_balance,
  coalesce(sum(quantity) FILTER (WHERE source_type='milling_settlement' AND movement_type='IN'),0) AS milling_settlements,
  coalesce(sum(quantity) FILTER (WHERE source_type='oil_purchase' AND movement_type='IN'),0) AS oil_purchased,
  coalesce(sum(quantity) FILTER (WHERE source_type='oil_sale' AND movement_type='OUT'),0) AS oil_sold,
  coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END) FILTER (WHERE source_type IN ('opening_balance','adjustment')),0) AS opening_and_adjustments
FROM public.oil_movements GROUP BY mill_id,season_id;
GRANT SELECT ON public.mill_oil_balance TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_command(
  p_season_id uuid, p_customer_name text, p_oil_produced numeric,
  p_container_count integer, p_container_type text, p_payment_type text,
  p_oil_amount numeric, p_cash_amount numeric, p_total_display text,
  p_customer_id uuid, p_queue_id uuid, p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_invoice_id uuid; v_mill_id uuid;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'invoice');
  IF v_previous IS NOT NULL THEN RETURN (v_previous->>'invoice_id')::uuid; END IF;
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id=p_season_id;
  v_invoice_id := public.create_invoice_and_settle(p_season_id,p_customer_name,p_oil_produced,p_container_count,p_container_type,p_payment_type,p_oil_amount,p_cash_amount,p_total_display,p_customer_id,p_queue_id);
  -- Legacy routine added produced-minus-fee. Canonical inventory receives only the oil settlement fee.
  UPDATE public.inventory SET total_oil=total_oil + (2*coalesce(p_oil_amount,0)-coalesce(p_oil_produced,0)), updated_at=now()
    WHERE mill_id=v_mill_id AND season_id=p_season_id;
  IF coalesce(p_oil_amount,0)>0 THEN
    INSERT INTO public.oil_movements (mill_id,season_id,ownership,direction,movement_type,source_type,quantity,amount,unit_price,party_name,reference_type,reference_id,created_by,idempotency_key)
    VALUES (v_mill_id,p_season_id,'mill','in','IN','milling_settlement',p_oil_amount,p_oil_amount,0,p_customer_name,'invoice',v_invoice_id,auth.uid(),p_idempotency_key);
  END IF;
  PERFORM public.complete_financial_command(p_idempotency_key,jsonb_build_object('invoice_id',v_invoice_id));
  RETURN v_invoice_id;
END; $$;

CREATE OR REPLACE FUNCTION public.record_oil_trade_command(
  p_season_id uuid, p_movement_type text, p_quantity numeric, p_unit_price numeric,
  p_payment_method text DEFAULT 'cash', p_party_name text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_caller uuid:=auth.uid(); v_mill uuid; v_inventory public.inventory%ROWTYPE; v_session uuid; v_total numeric; v_id uuid; v_previous jsonb; v_payable_id uuid;
BEGIN
  IF v_caller IS NULL OR p_movement_type NOT IN ('IN','OUT') OR p_quantity<=0 OR p_unit_price<0 OR p_payment_method NOT IN ('cash','credit') THEN RAISE EXCEPTION 'Invalid oil trade'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_previous:=public.claim_financial_command(p_idempotency_key,'oil_trade'); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  SELECT * INTO v_inventory FROM public.inventory WHERE mill_id=v_mill AND season_id=p_season_id FOR UPDATE;
  IF NOT FOUND OR (p_movement_type='OUT' AND v_inventory.total_oil<p_quantity) THEN RAISE EXCEPTION 'Insufficient mill oil'; END IF;
  v_total:=p_quantity*p_unit_price;
  IF p_payment_method='cash' AND v_total>0 THEN SELECT id INTO v_session FROM public.cash_sessions WHERE mill_id=v_mill AND status='open' LIMIT 1; IF v_session IS NULL OR (p_movement_type='IN' AND v_inventory.total_cash<v_total) THEN RAISE EXCEPTION 'Open cash session and sufficient cash are required'; END IF; END IF;
  INSERT INTO public.oil_transactions (user_id,mill_id,season_id,type,amount,price,total_price,party_name,notes,cash_session_id)
    VALUES(v_caller,v_mill,p_season_id,CASE WHEN p_movement_type='IN' THEN 'buy' ELSE 'sell' END,p_quantity,p_unit_price,v_total,p_party_name,p_notes,v_session) RETURNING id INTO v_id;
  IF p_payment_method='credit' AND p_movement_type='IN' AND v_total>0 THEN
    INSERT INTO public.payables (mill_id,season_id,type,creditor_name,original_amount,paid_amount,remaining_amount,source_type,source_id,status,notes,created_by)
    VALUES (v_mill,p_season_id,'due_to_supplier',coalesce(nullif(trim(p_party_name),''),'مورد زيت'),v_total,0,v_total,'purchase',v_id,'unpaid',p_notes,v_caller)
    RETURNING id INTO v_payable_id;
  END IF;
  IF v_total>0 THEN
    INSERT INTO public.financial_transactions (mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_name,description,status,created_by,cash_session_id)
    VALUES (v_mill,p_season_id,
      CASE WHEN p_movement_type='IN' THEN 'expense'::public.financial_tx_type ELSE 'income'::public.financial_tx_type END,
      CASE WHEN p_movement_type='IN' THEN 'oil_purchase' ELSE 'oil_sale' END,v_total,
      CASE WHEN p_payment_method='cash' AND p_movement_type='IN' THEN 'out'::public.financial_direction WHEN p_payment_method='cash' THEN 'in'::public.financial_direction ELSE 'none'::public.financial_direction END,
      p_payment_method::public.financial_payment_method,'oil_transaction',v_id,p_party_name,coalesce(p_notes,'Oil trade'),'active'::public.financial_tx_status,v_caller,v_session);
  END IF;
  UPDATE public.inventory SET total_oil=total_oil+CASE WHEN p_movement_type='IN' THEN p_quantity ELSE -p_quantity END,
    total_cash=total_cash+CASE WHEN p_payment_method='cash' AND p_movement_type='IN' THEN -v_total WHEN p_payment_method='cash' THEN v_total ELSE 0 END,updated_at=now() WHERE mill_id=v_mill AND season_id=p_season_id;
  INSERT INTO public.oil_movements (mill_id,season_id,ownership,direction,movement_type,source_type,quantity,amount,unit_price,party_name,notes,reference_type,reference_id,cash_session_id,created_by,idempotency_key)
    VALUES(v_mill,p_season_id,'mill',lower(p_movement_type),p_movement_type,CASE WHEN p_movement_type='IN' THEN 'oil_purchase' ELSE 'oil_sale' END,p_quantity,p_quantity,p_unit_price,p_party_name,p_notes,'oil_transaction',v_id,v_session,v_caller,p_idempotency_key);
  PERFORM public.complete_financial_command(p_idempotency_key,jsonb_build_object('success',true,'oil_movement_id',v_id)); RETURN jsonb_build_object('success',true,'oil_movement_id',v_id);
END; $$;

REVOKE ALL ON FUNCTION public.record_oil_movement_command(uuid,text,text,numeric,numeric,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) TO authenticated, service_role;
