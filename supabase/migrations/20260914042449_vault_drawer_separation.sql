-- Cash is held in two distinct places:
--   vault  = the mill's general safe, controlled by the owner/admin workspace
--   drawer = an open cashier session, controlled and reconciled independently

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS cash_location text;

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_cash_location_check;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_cash_location_check
  CHECK (cash_location IS NULL OR cash_location IN ('vault', 'drawer'));

UPDATE public.financial_transactions
SET cash_location = CASE WHEN cash_session_id IS NULL THEN 'vault' ELSE 'drawer' END
WHERE payment_method = 'cash' AND cash_location IS NULL;

CREATE TABLE IF NOT EXISTS public.cash_vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mill_id, season_id)
);

CREATE TABLE IF NOT EXISTS public.cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('vault_to_drawer', 'drawer_to_vault')),
  amount numeric NOT NULL CHECK (amount > 0),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_transfers_mill_season_created_idx
  ON public.cash_transfers (mill_id, season_id, created_at DESC);

ALTER TABLE public.cash_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can view cash vaults" ON public.cash_vaults;
CREATE POLICY "members can view cash vaults" ON public.cash_vaults
FOR SELECT TO authenticated
USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS "members can view cash transfers" ON public.cash_transfers;
CREATE POLICY "members can view cash transfers" ON public.cash_transfers
FOR SELECT TO authenticated
USING (public.check_user_mill_access(mill_id));

CREATE OR REPLACE FUNCTION public.record_vault_deposit_command(
  p_season_id uuid,
  p_amount numeric,
  p_partner_id uuid DEFAULT NULL,
  p_partner_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_vault public.cash_vaults%ROWTYPE;
  v_tx uuid;
  v_operation uuid;
  v_previous jsonb;
BEGIN
  IF v_actor IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_VAULT_DEPOSIT';
  END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id = p_season_id FOR SHARE;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'VAULT_OWNER_REQUIRED';
  END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'record_vault_deposit', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF p_partner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partners WHERE id = p_partner_id AND mill_id = v_mill
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PARTNER_NOT_IN_MILL';
  END IF;

  INSERT INTO public.cash_vaults (mill_id, season_id, balance)
  VALUES (v_mill, p_season_id, 0)
  ON CONFLICT (mill_id, season_id) DO NOTHING;
  SELECT * INTO v_vault FROM public.cash_vaults
  WHERE mill_id = v_mill AND season_id = p_season_id FOR UPDATE;
  UPDATE public.cash_vaults
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = v_vault.id;

  v_tx := gen_random_uuid();
  INSERT INTO public.business_operations(mill_id, season_id, operation_type, source_type, source_id, created_by)
  VALUES(v_mill, p_season_id, 'vault_deposit', 'financial_transaction', v_tx, v_actor)
  RETURNING id INTO v_operation;
  INSERT INTO public.financial_transactions (
    mill_id, season_id, type, amount, direction, payment_method,
    reference_type, description, category, status, created_by,
    party_type, party_id, party_name, cash_location, idempotency_key, id, operation_id
  ) VALUES (
    v_mill, p_season_id, 'owner_deposit', p_amount, 'in', 'cash',
    'cash_vault_deposit', coalesce(nullif(btrim(p_notes), ''), 'إيداع نقدي للخزنة'),
    'cash_vault', 'active', v_actor,
    CASE WHEN p_partner_id IS NULL AND nullif(btrim(coalesce(p_partner_name, '')), '') IS NULL THEN NULL ELSE 'partner' END,
    p_partner_id, nullif(btrim(p_partner_name), ''), 'vault', p_idempotency_key, v_tx, v_operation
  );
  PERFORM private.complete_business_command(
    p_idempotency_key, 'record_vault_deposit',
    jsonb_build_object('success', true, 'financial_transaction_id', v_tx, 'operation_id', v_operation, 'vault_balance', v_vault.balance + p_amount),
    v_operation
  );
  RETURN jsonb_build_object('success', true, 'financial_transaction_id', v_tx, 'operation_id', v_operation, 'vault_balance', v_vault.balance + p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_cash_between_vault_and_drawer_command(
  p_season_id uuid,
  p_direction text,
  p_amount numeric,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_session public.cash_sessions%ROWTYPE;
  v_vault public.cash_vaults%ROWTYPE;
  v_transfer uuid;
  v_operation uuid;
  v_vault_financial uuid;
  v_drawer_financial uuid;
  v_previous jsonb;
BEGIN
  IF v_actor IS NULL OR p_amount IS NULL OR p_amount <= 0
     OR p_direction NOT IN ('vault_to_drawer', 'drawer_to_vault') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CASH_TRANSFER';
  END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id = p_season_id FOR SHARE;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'VAULT_OWNER_REQUIRED';
  END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'transfer_cash_vault_drawer', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  SELECT * INTO v_session FROM public.cash_sessions
  WHERE mill_id = v_mill AND season_id = p_season_id AND status = 'open'
  ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPEN_DRAWER_SESSION_REQUIRED';
  END IF;
  INSERT INTO public.cash_vaults (mill_id, season_id, balance)
  VALUES (v_mill, p_season_id, 0)
  ON CONFLICT (mill_id, season_id) DO NOTHING;
  SELECT * INTO v_vault FROM public.cash_vaults
  WHERE mill_id = v_mill AND season_id = p_season_id FOR UPDATE;

  IF p_direction = 'vault_to_drawer' THEN
    IF v_vault.balance < p_amount THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_VAULT_CASH';
    END IF;
    UPDATE public.cash_vaults SET balance = balance - p_amount, updated_at = now() WHERE id = v_vault.id;
    UPDATE public.cash_sessions
    SET total_cash_in = total_cash_in + p_amount,
        expected_balance = expected_balance + p_amount
    WHERE id = v_session.id;
  ELSE
    IF coalesce(v_session.expected_balance, 0) < p_amount THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_DRAWER_CASH';
    END IF;
    UPDATE public.cash_vaults SET balance = balance + p_amount, updated_at = now() WHERE id = v_vault.id;
    UPDATE public.cash_sessions
    SET total_cash_out = total_cash_out + p_amount,
        expected_balance = expected_balance - p_amount
    WHERE id = v_session.id;
  END IF;
  INSERT INTO public.cash_transfers(mill_id, season_id, cash_session_id, direction, amount, notes, created_by)
  VALUES(v_mill, p_season_id, v_session.id, p_direction, p_amount, nullif(btrim(p_notes), ''), v_actor)
  RETURNING id INTO v_transfer;
  INSERT INTO public.business_operations(mill_id, season_id, operation_type, source_type, source_id, created_by)
  VALUES(v_mill, p_season_id, 'cash_transfer', 'cash_transfer', v_transfer, v_actor)
  RETURNING id INTO v_operation;
  INSERT INTO public.financial_transactions(
    mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type,
    description, category, status, created_by, cash_location, operation_id
  ) VALUES(
    v_mill, p_season_id, 'adjustment', p_amount, 'none', 'cash', v_transfer, 'cash_transfer',
    'تحويل نقدي ' || CASE WHEN p_direction = 'vault_to_drawer' THEN 'من الخزنة إلى الجارور' ELSE 'من الجارور إلى الخزنة' END,
    'cash_transfer', 'active', v_actor, 'vault', v_operation
  ) RETURNING id INTO v_vault_financial;
  INSERT INTO public.financial_transactions(
    mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type,
    description, category, status, created_by, cash_location, cash_session_id, operation_id
  ) VALUES(
    v_mill, p_season_id, 'adjustment', p_amount, 'none', 'cash', v_transfer, 'cash_transfer',
    'تحويل نقدي ' || CASE WHEN p_direction = 'vault_to_drawer' THEN 'إلى الجارور' ELSE 'إلى الخزنة' END,
    'cash_transfer', 'active', v_actor, 'drawer', v_session.id, v_operation
  ) RETURNING id INTO v_drawer_financial;
  PERFORM private.complete_business_command(
    p_idempotency_key, 'transfer_cash_vault_drawer',
    jsonb_build_object('success', true, 'transfer_id', v_transfer, 'operation_id', v_operation, 'cash_session_id', v_session.id, 'vault_financial_transaction_id', v_vault_financial, 'drawer_financial_transaction_id', v_drawer_financial),
    v_operation
  );
  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer, 'operation_id', v_operation, 'cash_session_id', v_session.id, 'vault_financial_transaction_id', v_vault_financial, 'drawer_financial_transaction_id', v_drawer_financial);
END;
$$;

REVOKE ALL ON FUNCTION public.record_vault_deposit_command(uuid,numeric,uuid,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_cash_between_vault_and_drawer_command(uuid,text,numeric,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vault_deposit_command(uuid,numeric,uuid,text,text,uuid), public.transfer_cash_between_vault_and_drawer_command(uuid,text,numeric,text,uuid) TO authenticated;

-- A drawer never receives an arbitrary opening balance. It is opened at zero
-- and funded only by a recorded transfer from the vault.
CREATE OR REPLACE FUNCTION public.open_cash_session(p_season_id uuid, p_opening_balance numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_mill_id uuid;
  v_session_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF coalesce(p_opening_balance, 0) <> 0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DRAWER_MUST_OPEN_AT_ZERO_USE_VAULT_TRANSFER';
  END IF;
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id = p_season_id FOR SHARE;
  IF v_mill_id IS NULL OR NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner','mill_employee']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CASH_SESSION_FORBIDDEN';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE mill_id=v_mill_id AND status='open') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CASH_SESSION_ALREADY_OPEN';
  END IF;
  INSERT INTO public.cash_sessions(mill_id,season_id,opened_by,opening_balance,expected_balance,total_cash_in,total_cash_out,status,opened_at)
  VALUES(v_mill_id,p_season_id,v_caller,0,0,0,0,'open',now()) RETURNING id INTO v_session_id;
  RETURN jsonb_build_object('success',true,'session_id',v_session_id,'mill_id',v_mill_id,'opening_balance',0);
END;
$$;

-- Only drawer cash is subject to the open-drawer trigger. Vault cash is an
-- owner-admin operation and must never be stamped into, or block on, a drawer.
CREATE OR REPLACE FUNCTION public.enforce_and_stamp_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_mill_id uuid;
  v_active_session record;
BEGIN
  v_mill_id := NEW.mill_id;
  IF v_mill_id IS NULL AND v_caller IS NOT NULL THEN
    SELECT mill_id INTO v_mill_id
    FROM public.mill_memberships
    WHERE user_id = v_caller AND is_active = true
    LIMIT 1;
  END IF;
  IF TG_TABLE_NAME = 'financial_transactions' THEN
    IF NEW.cash_location = 'vault'
       OR COALESCE(NEW.payment_method::text, 'cash') <> 'cash' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' AND COALESCE(NEW.cash_amount, 0) <= 0 THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'oil_transactions' AND COALESCE(NEW.total_price, 0) <= 0 THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'worker_payments' AND COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'customer_payments' AND (COALESCE(NEW.payment_method, 'cash') <> 'cash' OR COALESCE(NEW.amount, 0) <= 0) THEN
    RETURN NEW;
  END IF;
  IF public.is_platform_admin(v_caller) THEN
    RETURN NEW;
  END IF;
  IF v_mill_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_active_session
  FROM public.cash_sessions
  WHERE mill_id = v_mill_id AND status = 'open'
  ORDER BY opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPEN_DRAWER_SESSION_REQUIRED';
  END IF;
  NEW.cash_session_id := v_active_session.id;
  RETURN NEW;
END;
$$;
