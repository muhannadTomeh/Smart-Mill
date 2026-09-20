-- The source document keeps its payment method so the trade history is not
-- inferred from a separate ledger query.
ALTER TABLE public.oil_transactions
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';

ALTER TABLE public.oil_transactions
  DROP CONSTRAINT IF EXISTS oil_transactions_payment_method_check;
ALTER TABLE public.oil_transactions
  ADD CONSTRAINT oil_transactions_payment_method_check
  CHECK (payment_method IN ('cash', 'credit'));

-- Existing documents predate the source-document field.  Their ledger event
-- is authoritative for this display-only backfill.
UPDATE public.oil_transactions t
SET payment_method = 'credit'
FROM public.financial_transactions f
WHERE f.reference_type = 'oil_transaction'
  AND f.reference_id = t.id
  AND f.reversal_of IS NULL
  AND f.payment_method = 'credit'::public.financial_payment_method;

CREATE OR REPLACE FUNCTION public.record_oil_trade_command(
  p_season_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_price numeric,
  p_payment_method text DEFAULT 'cash',
  p_party_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_total numeric;
  v_previous jsonb;
  v_operation uuid;
  v_trade uuid;
  v_payable uuid;
  v_financial uuid;
  v_oil uuid;
  v_current_oil numeric;
  v_creditor text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id = p_season_id;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner', 'mill_employee']) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_FORBIDDEN'; END IF;
  IF p_movement_type NOT IN ('IN', 'OUT') OR p_quantity IS NULL OR p_quantity <= 0 OR p_unit_price IS NULL OR p_unit_price < 0 OR p_payment_method NOT IN ('cash', 'credit') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_TRADE_INVALID'; END IF;
  IF p_movement_type = 'OUT' AND p_payment_method <> 'cash' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_SALE_CREDIT_UNSUPPORTED'; END IF;
  IF p_movement_type = 'IN' AND p_payment_method = 'credit' AND nullif(btrim(p_party_name), '') IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OIL_PURCHASE_CREDITOR_REQUIRED'; END IF;
  IF p_movement_type = 'OUT' THEN
    SELECT coalesce(current_balance, oil_balance, 0) INTO v_current_oil FROM public.mill_oil_balance WHERE mill_id = v_mill AND season_id = p_season_id;
    IF coalesce(v_current_oil, 0) < p_quantity THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_OIL_STOCK'; END IF;
  END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'oil_trade', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_total := p_quantity * p_unit_price;
  v_creditor := nullif(btrim(p_party_name), '');
  INSERT INTO public.oil_transactions(user_id, mill_id, season_id, type, amount, price, total_price, payment_method, party_name, notes)
  VALUES (v_actor, v_mill, p_season_id, CASE WHEN p_movement_type = 'IN' THEN 'buy' ELSE 'sell' END, p_quantity, p_unit_price, v_total, p_payment_method, v_creditor, nullif(btrim(p_notes), ''))
  RETURNING id INTO v_trade;
  INSERT INTO public.business_operations(mill_id, season_id, operation_type, source_type, source_id, created_by)
  VALUES (v_mill, p_season_id, 'oil_trade', 'oil_transaction', v_trade, v_actor) RETURNING id INTO v_operation;
  IF p_movement_type = 'IN' AND p_payment_method = 'credit' THEN
    INSERT INTO public.payables(mill_id, season_id, type, creditor_name, original_amount, paid_amount, remaining_amount, source_type, source_id, status, notes, created_by)
    VALUES (v_mill, p_season_id, 'due_to_supplier', v_creditor, v_total, 0, v_total, 'purchase', v_trade, 'unpaid', nullif(btrim(p_notes), ''), v_actor)
    RETURNING id INTO v_payable;
    UPDATE public.oil_transactions SET payable_id = v_payable WHERE id = v_trade;
  END IF;
  INSERT INTO public.oil_movements(mill_id, season_id, ownership, direction, movement_type, source_type, quantity, amount, unit_price, party_name, notes, reference_type, reference_id, created_by, idempotency_key)
  VALUES (v_mill, p_season_id, 'mill', lower(p_movement_type), p_movement_type, CASE WHEN p_movement_type = 'IN' THEN 'oil_purchase' ELSE 'oil_sale' END, p_quantity, p_quantity, p_unit_price, v_creditor, nullif(btrim(p_notes), ''), 'oil_transaction', v_trade, v_actor, p_idempotency_key)
  RETURNING id INTO v_oil;
  INSERT INTO public.financial_transactions(created_by, mill_id, season_id, type, category, amount, direction, payment_method, reference_type, reference_id, party_type, party_name, description, status, operation_id, idempotency_key)
  VALUES (v_actor, v_mill, p_season_id, (CASE WHEN p_movement_type = 'IN' THEN 'expense' ELSE 'income' END)::public.financial_tx_type, CASE WHEN p_movement_type = 'IN' THEN 'oil_purchase' ELSE 'oil_sale' END, v_total, (CASE WHEN p_payment_method = 'cash' AND p_movement_type = 'IN' THEN 'out' WHEN p_payment_method = 'cash' THEN 'in' ELSE 'none' END)::public.financial_direction, (CASE WHEN p_payment_method = 'cash' THEN 'cash' ELSE 'credit' END)::public.financial_payment_method, 'oil_transaction', v_trade, CASE WHEN p_movement_type = 'IN' THEN 'supplier' ELSE 'customer' END, v_creditor, CASE WHEN p_movement_type = 'IN' THEN 'شراء زيت' ELSE 'بيع زيت' END || ' (' || p_quantity || ' كغم)' || CASE WHEN nullif(btrim(p_notes), '') IS NOT NULL THEN ' — ' || btrim(p_notes) ELSE '' END, 'active'::public.financial_tx_status, v_operation, p_idempotency_key)
  RETURNING id INTO v_financial;
  PERFORM private.complete_business_command(p_idempotency_key, 'oil_trade', jsonb_build_object('success', true, 'oil_transaction_id', v_trade, 'oil_movement_id', v_oil, 'financial_transaction_id', v_financial, 'payable_id', v_payable, 'payment_method', p_payment_method), v_operation);
  RETURN jsonb_build_object('success', true, 'oil_transaction_id', v_trade, 'oil_movement_id', v_oil, 'financial_transaction_id', v_financial, 'payable_id', v_payable, 'payment_method', p_payment_method);
END;
$$;

REVOKE ALL ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) TO authenticated;
