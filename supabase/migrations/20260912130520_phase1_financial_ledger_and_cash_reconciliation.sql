-- Phase 1: canonical financial events, idempotent commands, and cash reconciliation.
-- Additive: historical rows remain readable; new financial events are append-only.

CREATE TABLE IF NOT EXISTS public.financial_command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key uuid NOT NULL,
  operation text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT financial_command_receipts_actor_key_unique UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE public.financial_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_command_receipts FROM PUBLIC, anon, authenticated;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.financial_transactions(id),
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_amount_positive;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_amount_positive CHECK (amount > 0) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_mill_idempotency_unique
  ON public.financial_transactions (mill_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_one_reversal_per_event
  ON public.financial_transactions (reversal_of)
  WHERE reversal_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_transactions_cash_reconciliation_idx
  ON public.financial_transactions (cash_session_id, created_at)
  WHERE payment_method = 'cash'::public.financial_payment_method
    AND status = 'active'::public.financial_tx_status;

CREATE OR REPLACE FUNCTION public.prevent_financial_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Financial events are append-only; create a reversal instead';
  END IF;

  IF ROW(NEW.mill_id, NEW.season_id, NEW.type, NEW.amount, NEW.direction,
         NEW.payment_method, NEW.reference_type, NEW.reference_id,
         NEW.cash_session_id, NEW.reversal_of)
     IS DISTINCT FROM
     ROW(OLD.mill_id, OLD.season_id, OLD.type, OLD.amount, OLD.direction,
         OLD.payment_method, OLD.reference_type, OLD.reference_id,
         OLD.cash_session_id, OLD.reversal_of) THEN
    RAISE EXCEPTION 'Financial event facts are immutable; create a reversal instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_financial_event_mutation ON public.financial_transactions;
CREATE TRIGGER trg_prevent_financial_event_mutation
  BEFORE UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_event_mutation();

CREATE OR REPLACE FUNCTION public.claim_financial_command(
  p_idempotency_key uuid,
  p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR p_idempotency_key IS NULL OR p_operation IS NULL OR btrim(p_operation) = '' THEN
    RAISE EXCEPTION 'Authentication and an idempotency key are required';
  END IF;
  INSERT INTO public.financial_command_receipts (actor_user_id, idempotency_key, operation)
  VALUES (v_actor, p_idempotency_key, p_operation)
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;
  IF FOUND THEN
    RETURN NULL;
  END IF;
  SELECT result INTO v_result
  FROM public.financial_command_receipts
  WHERE actor_user_id = v_actor AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'The matching financial command did not complete; retry with a new key';
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_financial_command(
  p_idempotency_key uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.financial_command_receipts
     SET result = p_result, completed_at = now()
   WHERE actor_user_id = auth.uid() AND idempotency_key = p_idempotency_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Financial command receipt was not claimed'; END IF;
END;
$$;

-- Idempotent entry points preserve existing command implementation while making
-- browser retries safe. Legacy signatures are revoked below.
CREATE OR REPLACE FUNCTION public.create_invoice_command(
  p_season_id uuid, p_customer_name text, p_oil_produced numeric,
  p_container_count integer, p_container_type text, p_payment_type text,
  p_oil_amount numeric, p_cash_amount numeric, p_total_display text,
  p_customer_id uuid, p_queue_id uuid, p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_invoice_id uuid;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'invoice');
  IF v_previous IS NOT NULL THEN RETURN (v_previous->>'invoice_id')::uuid; END IF;
  v_invoice_id := public.create_invoice_and_settle(p_season_id, p_customer_name, p_oil_produced, p_container_count, p_container_type, p_payment_type, p_oil_amount, p_cash_amount, p_total_display, p_customer_id, p_queue_id);
  PERFORM public.complete_financial_command(p_idempotency_key, jsonb_build_object('invoice_id', v_invoice_id));
  RETURN v_invoice_id;
END; $$;

CREATE OR REPLACE FUNCTION public.record_expense_command(
  p_season_id uuid, p_category text, p_amount numeric, p_description text,
  p_payment_method text, p_partner_id uuid, p_supplier_id uuid,
  p_partner_name text, p_creditor_name text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'expense');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_result := public.record_expense_v2(p_season_id, p_category, p_amount, p_description, p_payment_method, p_partner_id, p_supplier_id, p_partner_name, p_creditor_name);
  PERFORM public.complete_financial_command(p_idempotency_key, v_result); RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.record_oil_transaction_command(
  p_season_id uuid, p_type text, p_amount numeric, p_price numeric,
  p_party_name text, p_notes text, p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_id uuid;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'oil_transaction');
  IF v_previous IS NOT NULL THEN RETURN (v_previous->>'oil_transaction_id')::uuid; END IF;
  v_id := public.record_oil_transaction_atomic(p_season_id, p_type, p_amount, p_price, p_party_name, p_notes);
  PERFORM public.complete_financial_command(p_idempotency_key, jsonb_build_object('oil_transaction_id', v_id)); RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pay_worker_command(
  p_season_id uuid, p_worker_id uuid, p_amount numeric, p_notes text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'worker_payment');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  PERFORM public.pay_worker_and_settle(auth.uid(), p_season_id, p_worker_id, p_amount, p_notes);
  v_result := jsonb_build_object('success', true);
  PERFORM public.complete_financial_command(p_idempotency_key, v_result); RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.settle_payable_command(
  p_payable_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'payable_settlement');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_result := public.settle_payable_atomic(p_payable_id, p_amount, p_payment_method, p_notes);
  PERFORM public.complete_financial_command(p_idempotency_key, v_result); RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.record_partner_transaction_command(
  p_season_id uuid, p_partner_id uuid, p_type text, p_amount numeric, p_notes text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'partner_transaction');
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_result := public.record_partner_transaction_atomic(p_season_id, p_partner_id, p_type, p_amount, p_notes);
  PERFORM public.complete_financial_command(p_idempotency_key, v_result); RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.record_customer_payment_command(
  p_season_id uuid, p_customer_id uuid, p_amount numeric, p_notes text, p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_previous jsonb; v_id uuid;
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'customer_collection');
  IF v_previous IS NOT NULL THEN RETURN (v_previous->>'customer_payment_id')::uuid; END IF;
  v_id := public.record_customer_payment_atomic(p_season_id, p_customer_id, p_amount, p_notes);
  PERFORM public.complete_financial_command(p_idempotency_key, jsonb_build_object('customer_payment_id', v_id)); RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id uuid, p_actual_balance numeric, p_closing_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_caller uuid := auth.uid(); v_session public.cash_sessions%ROWTYPE;
  v_in numeric := 0; v_out numeric := 0; v_expected numeric; v_difference numeric;
BEGIN
  IF v_caller IS NULL OR p_actual_balance < 0 THEN RAISE EXCEPTION 'Invalid authenticated closing request'; END IF;
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'open' THEN RAISE EXCEPTION 'Cash session is not open'; END IF;
  IF NOT public.is_platform_admin(v_caller) AND NOT public.has_active_mill_role(v_session.mill_id, ARRAY['mill_owner','mill_employee']) THEN
    RAISE EXCEPTION 'Not authorized to close this cash session';
  END IF;
  SELECT COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE 0 END),0),
         COALESCE(sum(CASE WHEN direction = 'out' THEN amount ELSE 0 END),0)
    INTO v_in, v_out FROM public.financial_transactions
   WHERE cash_session_id = v_session.id AND status = 'active'::public.financial_tx_status
     AND payment_method = 'cash'::public.financial_payment_method;
  v_expected := v_session.opening_balance + v_in - v_out;
  v_difference := p_actual_balance - v_expected;
  IF v_difference <> 0 AND coalesce(btrim(p_closing_note), '') = '' THEN
    RAISE EXCEPTION 'A closing note is required when there is a variance';
  END IF;
  UPDATE public.cash_sessions SET status='closed', closed_at=now(), closed_by=v_caller,
    expected_balance=v_expected, actual_balance=p_actual_balance, difference=v_difference,
    closing_note=nullif(btrim(p_closing_note),''), total_cash_in=v_in, total_cash_out=v_out WHERE id=v_session.id;
  RETURN jsonb_build_object('success',true,'session_id',v_session.id,'expected_balance',v_expected,'actual_balance',p_actual_balance,'difference',v_difference,'cash_in',v_in,'cash_out',v_out);
END; $$;

CREATE OR REPLACE FUNCTION public.void_financial_transaction(p_transaction_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_caller uuid := auth.uid(); v_original public.financial_transactions%ROWTYPE; v_reversal_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_original FROM public.financial_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND OR v_original.status <> 'active' THEN RAISE EXCEPTION 'Financial event cannot be reversed'; END IF;
  IF NOT public.is_platform_admin(v_caller) AND NOT public.has_active_mill_role(v_original.mill_id, ARRAY['mill_owner']) THEN RAISE EXCEPTION 'Only the mill owner may reverse a financial event'; END IF;
  INSERT INTO public.financial_transactions (mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,created_by,cash_session_id,reversal_of,reversal_reason)
  VALUES (v_original.mill_id,v_original.season_id,'adjustment',coalesce(v_original.category,'reversal'),v_original.amount,
          CASE v_original.direction WHEN 'in' THEN 'out'::public.financial_direction WHEN 'out' THEN 'in'::public.financial_direction ELSE 'none'::public.financial_direction END,
          v_original.payment_method,'financial_reversal',v_original.id,v_original.party_type,v_original.party_id,v_original.party_name,
          'Reversal of financial event ' || v_original.id::text,'active',v_caller,v_original.cash_session_id,v_original.id,nullif(btrim(p_reason),''))
  RETURNING id INTO v_reversal_id;
  IF v_original.payment_method='cash'::public.financial_payment_method THEN
    UPDATE public.inventory SET total_cash = coalesce(total_cash,0) + CASE v_original.direction WHEN 'in' THEN -v_original.amount WHEN 'out' THEN v_original.amount ELSE 0 END, updated_at=now()
    WHERE season_id=v_original.season_id AND mill_id=v_original.mill_id;
  END IF;
  RETURN jsonb_build_object('success',true,'transaction_id',p_transaction_id,'reversal_id',v_reversal_id);
END; $$;

CREATE OR REPLACE FUNCTION public.void_expense_and_reverse(p_expense_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_caller uuid := auth.uid(); v_expense public.expenses%ROWTYPE; v_financial_id uuid; v_reversal jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_expense FROM public.expenses WHERE id=p_expense_id FOR UPDATE;
  IF NOT FOUND OR v_expense.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Expense cannot be reversed'; END IF;
  IF v_expense.payable_id IS NOT NULL THEN RAISE EXCEPTION 'A payable-backed expense must be reversed through its payable workflow'; END IF;
  IF NOT public.is_platform_admin(v_caller) AND NOT public.has_active_mill_role(v_expense.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION 'Only the mill owner may reverse an expense';
  END IF;
  SELECT id INTO v_financial_id FROM public.financial_transactions
   WHERE reference_type='expense' AND reference_id=v_expense.id AND status='active'::public.financial_tx_status
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_financial_id IS NULL THEN RAISE EXCEPTION 'No active financial event exists for this expense'; END IF;
  v_reversal := public.void_financial_transaction(v_financial_id, p_reason);
  UPDATE public.expenses SET voided_at=now(), voided_by=v_caller, void_reason=nullif(btrim(p_reason),'') WHERE id=v_expense.id;
  RETURN v_reversal || jsonb_build_object('expense_id', v_expense.id);
END; $$;

-- Financial events are written only by the reviewed command/RPC path.
REVOKE INSERT, UPDATE, DELETE ON public.financial_transactions FROM anon, authenticated;
GRANT SELECT ON public.financial_transactions TO authenticated;

REVOKE ALL ON FUNCTION public.claim_financial_command(uuid,text), public.complete_financial_command(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_invoice_and_settle(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid), public.record_expense_v2(uuid,text,numeric,text,text,uuid,uuid,text,text), public.record_oil_transaction_atomic(uuid,text,numeric,numeric,text,text), public.pay_worker_and_settle(uuid,uuid,uuid,numeric,text), public.settle_payable_atomic(uuid,numeric,text,text), public.record_partner_transaction_atomic(uuid,uuid,text,numeric,text), public.record_customer_payment_atomic(uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,uuid), public.record_expense_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid), public.record_oil_transaction_command(uuid,text,numeric,numeric,text,text,uuid), public.pay_worker_command(uuid,uuid,numeric,text,uuid), public.settle_payable_command(uuid,numeric,text,text,uuid), public.record_partner_transaction_command(uuid,uuid,text,numeric,text,uuid), public.record_customer_payment_command(uuid,uuid,numeric,text,uuid), public.close_cash_session(uuid,numeric,text), public.void_financial_transaction(uuid,text), public.void_expense_and_reverse(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.prevent_financial_event_mutation() FROM PUBLIC, anon, authenticated;
