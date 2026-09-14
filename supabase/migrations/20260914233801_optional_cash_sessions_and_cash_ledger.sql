-- Cash sessions remain historical/operational metadata.  A missing open
-- session must never prevent a canonical cash event from being recorded.
CREATE OR REPLACE FUNCTION public.enforce_and_stamp_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Callers may supply a valid historical/open session id.  When they do not,
  -- keep it NULL: cash_session_id is optional metadata, not an authorization
  -- or accounting prerequisite.
  RETURN NEW;
END;
$$;

-- The financial ledger is the cash source of truth.  Reversal events are
-- append-only opposite-direction rows, so active rows naturally net to zero.
CREATE OR REPLACE VIEW public.mill_cash_balance
WITH (security_invoker = true) AS
SELECT
  mill_id,
  season_id,
  coalesce(sum(CASE direction
    WHEN 'in' THEN amount
    WHEN 'out' THEN -amount
    ELSE 0
  END) FILTER (WHERE payment_method = 'cash' AND status = 'active'), 0) AS cash_balance
FROM public.financial_transactions
GROUP BY mill_id, season_id;

GRANT SELECT ON public.mill_cash_balance TO authenticated;

CREATE OR REPLACE VIEW public.mill_cash_reconciliation
WITH (security_invoker = true) AS
SELECT
  balance.mill_id,
  balance.season_id,
  balance.cash_balance AS ledger_cash_balance,
  coalesce(inventory.total_cash, 0) AS inventory_cash_cache,
  coalesce(inventory.total_cash, 0) - balance.cash_balance AS cache_difference
FROM public.mill_cash_balance balance
LEFT JOIN public.inventory inventory
  ON inventory.mill_id = balance.mill_id AND inventory.season_id = balance.season_id;

GRANT SELECT ON public.mill_cash_reconciliation TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_one_opening_cash_balance_per_season
  ON public.financial_transactions (mill_id, season_id)
  WHERE reference_type = 'cash_opening_balance' AND status = 'active';

CREATE OR REPLACE FUNCTION public.record_cash_opening_balance_command(
  p_season_id uuid,
  p_amount numeric,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_previous jsonb;
  v_financial uuid := gen_random_uuid();
  v_operation uuid;
BEGIN
  IF v_actor IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_CASH_AMOUNT_INVALID';
  END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id FOR SHARE;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_CASH_OWNER_REQUIRED';
  END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'cash_opening_balance', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_transactions
    WHERE mill_id=v_mill AND season_id=p_season_id
      AND reference_type='cash_opening_balance' AND status='active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_CASH_ALREADY_RECORDED';
  END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by)
  VALUES(v_mill,p_season_id,'cash_opening_balance','cash_opening_balance',v_financial,v_actor)
  RETURNING id INTO v_operation;
  INSERT INTO public.financial_transactions(
    id,created_by,mill_id,season_id,type,amount,direction,payment_method,
    reference_id,reference_type,description,category,status,cash_session_id,operation_id
  ) VALUES (
    v_financial,v_actor,v_mill,p_season_id,'adjustment',p_amount,'in','cash',
    v_financial,'cash_opening_balance',coalesce(nullif(btrim(p_notes),''),'رصيد نقدي افتتاحي للمعصرة'),
    'opening_balance','active',NULL,v_operation
  );
  -- Transitional compatibility cache; all new reporting reads the view above.
  INSERT INTO public.inventory(user_id,mill_id,season_id,total_oil,total_cash)
  VALUES(v_actor,v_mill,p_season_id,0,p_amount)
  ON CONFLICT (mill_id,season_id) DO UPDATE
    SET total_cash=public.inventory.total_cash + excluded.total_cash, updated_at=now();
  PERFORM private.complete_business_command(
    p_idempotency_key,'cash_opening_balance',
    jsonb_build_object('success',true,'financial_transaction_id',v_financial,'operation_id',v_operation),
    v_operation
  );
  RETURN jsonb_build_object('success',true,'financial_transaction_id',v_financial,'operation_id',v_operation);
END;
$$;

REVOKE ALL ON FUNCTION public.record_cash_opening_balance_command(uuid,numeric,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_opening_balance_command(uuid,numeric,text,uuid) TO authenticated;
