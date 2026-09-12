-- Phase 2: product movements are the only stock-changing path; oil has a
-- separate immutable movement ledger with explicit ownership.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_current_stock_nonnegative;
ALTER TABLE public.products
  ADD CONSTRAINT products_current_stock_nonnegative CHECK (current_stock >= 0) NOT VALID;

ALTER TABLE public.product_stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS product_stock_movements_mill_idempotency_unique
  ON public.product_stock_movements (mill_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_stock_movements_product_created_idx
  ON public.product_stock_movements (product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_product_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_stock integer;
BEGIN
  IF NEW.quantity = 0 THEN RAISE EXCEPTION 'Stock movement quantity cannot be zero'; END IF;
  SELECT current_stock INTO v_stock FROM public.products
   WHERE id=NEW.product_id AND mill_id=NEW.mill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product does not belong to this mill'; END IF;
  IF v_stock + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for this movement';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_product_stock_movement ON public.product_stock_movements;
CREATE TRIGGER trg_enforce_product_stock_movement
  BEFORE INSERT ON public.product_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_stock_movement();

CREATE OR REPLACE FUNCTION public.adjust_product_stock_command(
  p_season_id uuid, p_product_id uuid, p_quantity integer, p_notes text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_caller uuid := auth.uid(); v_mill_id uuid; v_previous jsonb; v_stock integer;
BEGIN
  IF v_caller IS NULL OR p_quantity IS NULL OR p_quantity=0 THEN RAISE EXCEPTION 'Authentication and a non-zero quantity are required'; END IF;
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id=p_season_id;
  IF v_mill_id IS NULL OR NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner']) THEN RAISE EXCEPTION 'Only the mill owner may adjust product stock'; END IF;
  v_previous := public.claim_financial_command(p_idempotency_key, 'product_stock_adjustment');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  SELECT current_stock INTO v_stock FROM public.products WHERE id=p_product_id AND mill_id=v_mill_id FOR UPDATE;
  IF NOT FOUND OR v_stock + p_quantity < 0 THEN RAISE EXCEPTION 'Insufficient stock for this adjustment'; END IF;
  INSERT INTO public.product_stock_movements (mill_id,season_id,product_id,quantity,type,reference_type,notes,created_by,idempotency_key)
  VALUES (v_mill_id,p_season_id,p_product_id,p_quantity,CASE WHEN p_quantity>0 THEN 'adjustment_in' ELSE 'adjustment_out' END,'manual_adjustment',p_notes,v_caller,p_idempotency_key);
  UPDATE public.products SET current_stock=current_stock+p_quantity, updated_at=now() WHERE id=p_product_id;
  PERFORM public.complete_financial_command(p_idempotency_key, jsonb_build_object('success',true,'product_id',p_product_id,'current_stock',v_stock+p_quantity));
  RETURN jsonb_build_object('success',true,'product_id',p_product_id,'current_stock',v_stock+p_quantity);
END; $$;

CREATE TABLE IF NOT EXISTS public.oil_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  ownership text NOT NULL CHECK (ownership IN ('mill','customer')),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric NOT NULL CHECK (amount > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  party_name text,
  notes text,
  reference_type text,
  reference_id uuid,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oil_movements_mill_idempotency_unique UNIQUE (mill_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS oil_movements_mill_season_created_idx ON public.oil_movements (mill_id, season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS oil_movements_ownership_idx ON public.oil_movements (mill_id, season_id, ownership, direction);
ALTER TABLE public.oil_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oil_movements_tenant_read" ON public.oil_movements FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR mill_id = public.get_current_mill_id());
REVOKE ALL ON public.oil_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.oil_movements TO authenticated;

CREATE OR REPLACE FUNCTION public.record_oil_movement_command(
  p_season_id uuid, p_ownership text, p_direction text, p_amount numeric,
  p_unit_price numeric DEFAULT 0, p_party_name text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_caller uuid := auth.uid(); v_mill_id uuid; v_previous jsonb; v_inventory public.inventory%ROWTYPE;
  v_session_id uuid; v_movement_id uuid; v_legacy_id uuid; v_total numeric;
BEGIN
  IF v_caller IS NULL OR p_amount IS NULL OR p_amount<=0 OR coalesce(p_unit_price,0)<0 THEN RAISE EXCEPTION 'Invalid oil movement'; END IF;
  IF p_ownership NOT IN ('mill','customer') OR p_direction NOT IN ('in','out') THEN RAISE EXCEPTION 'Invalid ownership or direction'; END IF;
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id=p_season_id;
  IF v_mill_id IS NULL OR NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION 'Not authorized for this mill'; END IF;
  v_previous := public.claim_financial_command(p_idempotency_key, 'oil_movement');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_total := p_amount * coalesce(p_unit_price,0);
  IF p_ownership='mill' THEN
    SELECT * INTO v_inventory FROM public.inventory WHERE mill_id=v_mill_id AND season_id=p_season_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Season inventory is missing'; END IF;
    IF p_direction='out' AND v_inventory.total_oil < p_amount THEN RAISE EXCEPTION 'Insufficient mill-owned oil'; END IF;
    IF p_direction='in' AND v_total>0 AND v_inventory.total_cash < v_total THEN RAISE EXCEPTION 'Insufficient cash for oil purchase'; END IF;
    IF v_total>0 THEN
      SELECT id INTO v_session_id FROM public.cash_sessions WHERE mill_id=v_mill_id AND status='open' LIMIT 1;
      IF v_session_id IS NULL THEN RAISE EXCEPTION 'An open cash session is required for a cash oil trade'; END IF;
    END IF;
    INSERT INTO public.oil_transactions (user_id,mill_id,season_id,type,amount,price,total_price,party_name,notes,cash_session_id)
      VALUES (v_caller,v_mill_id,p_season_id,CASE WHEN p_direction='in' THEN 'buy' ELSE 'sell' END,p_amount,coalesce(p_unit_price,0),v_total,p_party_name,p_notes,v_session_id) RETURNING id INTO v_legacy_id;
    UPDATE public.inventory SET total_oil=total_oil + CASE WHEN p_direction='in' THEN p_amount ELSE -p_amount END,
      total_cash=total_cash + CASE WHEN p_direction='in' THEN -v_total ELSE v_total END, updated_at=now()
      WHERE mill_id=v_mill_id AND season_id=p_season_id;
    IF v_total>0 THEN
      INSERT INTO public.financial_transactions (mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_name,description,status,created_by,cash_session_id)
      VALUES (v_mill_id,p_season_id,CASE WHEN p_direction='in' THEN 'expense'::public.financial_tx_type ELSE 'income'::public.financial_tx_type END,
        CASE WHEN p_direction='in' THEN 'oil_purchase' ELSE 'oil_sale' END,v_total,CASE WHEN p_direction='in' THEN 'out'::public.financial_direction ELSE 'in'::public.financial_direction END,
        'cash'::public.financial_payment_method,'oil_movement',v_legacy_id,p_party_name,coalesce(p_notes,'Oil movement'),'active'::public.financial_tx_status,v_caller,v_session_id);
    END IF;
  END IF;
  INSERT INTO public.oil_movements (mill_id,season_id,ownership,direction,amount,unit_price,party_name,notes,reference_type,reference_id,cash_session_id,created_by,idempotency_key)
    VALUES (v_mill_id,p_season_id,p_ownership,p_direction,p_amount,coalesce(p_unit_price,0),p_party_name,p_notes,
      CASE WHEN v_legacy_id IS NULL THEN 'customer_oil' ELSE 'oil_transaction' END,v_legacy_id,v_session_id,v_caller,p_idempotency_key) RETURNING id INTO v_movement_id;
  PERFORM public.complete_financial_command(p_idempotency_key,jsonb_build_object('success',true,'oil_movement_id',v_movement_id));
  RETURN jsonb_build_object('success',true,'oil_movement_id',v_movement_id);
END; $$;

REVOKE INSERT, UPDATE, DELETE ON public.product_stock_movements FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_product_stock_command(uuid,uuid,integer,text,uuid), public.record_oil_movement_command(uuid,text,text,numeric,numeric,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock_command(uuid,uuid,integer,text,uuid), public.record_oil_movement_command(uuid,text,text,numeric,numeric,text,text,uuid) TO authenticated, service_role;
