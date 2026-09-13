-- Step A: canonical transaction lifecycle foundation.
--
-- This migration is intentionally additive. Existing module commands keep working,
-- while all financial effects gain an operation envelope and all new commands can
-- use one generalized idempotency receipt. Business-specific cancellation rules are
-- implemented in later steps.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Canonical role authorization (no identity-specific UUID bypasses)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _uid
        AND ur.role::text = 'platform_admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id IS NOT NULL
    AND _role IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND (
          ur.role::text = _role
          OR (_role = 'admin' AND ur.role::text = 'platform_admin')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.check_user_mill_access(p_mill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.mill_memberships mm
      WHERE mm.user_id = auth.uid()
        AND mm.mill_id = p_mill_id
        AND mm.is_active = true
    );
$$;

-- Several compatibility functions were created before role-backed authorization.
-- Remove the known UUID shortcut without changing their business behavior yet.
DO $$
DECLARE
  v_function record;
  v_definition text;
  v_admin_uuid text;
BEGIN
  FOR v_admin_uuid IN
    SELECT ur.user_id::text
    FROM public.user_roles ur
    WHERE ur.role::text = 'platform_admin'
  LOOP
    FOR v_function IN
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'private')
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) ILIKE '%' || v_admin_uuid || '%'
    LOOP
      v_definition := pg_get_functiondef(v_function.oid);
      v_definition := replace(
        v_definition,
        'v_caller = ''' || v_admin_uuid || '''::uuid OR public.is_platform_admin(v_caller)',
        'public.is_platform_admin(v_caller)'
      );
      v_definition := regexp_replace(
        v_definition,
        'caller_uid\s*=\s*''' || v_admin_uuid || '''(::uuid)?\s+OR\s+',
        '',
        'gi'
      );
      v_definition := regexp_replace(
        v_definition,
        '\s+AND\s+u\.id\s*<>\s*''' || v_admin_uuid || '''::uuid',
        '',
        'gi'
      );
      EXECUTE v_definition;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~* '''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}''(::uuid)?'
      AND (
        pg_get_functiondef(p.oid) ILIKE '%platform_admin%'
        OR p.proname IN (
          'admin_set_user_pin', 'check_user_mill_access', 'create_invoice_and_settle',
          'has_role', 'is_platform_admin', 'lookup_cashier_by_username',
          'record_expense_atomic', 'record_oil_trade_atomic',
          'record_oil_transaction_atomic', 'register_worker_session'
        )
      )
  ) THEN
    RAISE EXCEPTION 'LEGACY_PLATFORM_ADMIN_UUID_REMAINS';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_user_mill_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_user_mill_access(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Operation envelope, dependency graph and immutable audit history
-- ---------------------------------------------------------------------------

CREATE TABLE public.business_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  operation_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancellation_reason text,
  reverses_operation_id uuid REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  CONSTRAINT business_operations_operation_type_nonempty
    CHECK (btrim(operation_type) <> ''),
  CONSTRAINT business_operations_source_type_nonempty
    CHECK (btrim(source_type) <> ''),
  CONSTRAINT business_operations_status_valid
    CHECK (status IN ('active', 'cancelled')),
  CONSTRAINT business_operations_not_self_reversing
    CHECK (reverses_operation_id IS NULL OR reverses_operation_id <> id),
  CONSTRAINT business_operations_cancellation_consistent
    CHECK (
      (status = 'active' AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
      OR
      (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')
    )
);

CREATE UNIQUE INDEX business_operations_source_unique
  ON public.business_operations (mill_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX business_operations_tenant_created_idx
  ON public.business_operations (mill_id, season_id, created_at DESC);
CREATE INDEX business_operations_reverses_idx
  ON public.business_operations (reverses_operation_id)
  WHERE reverses_operation_id IS NOT NULL;

CREATE TABLE public.business_operation_dependencies (
  parent_operation_id uuid NOT NULL REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  child_operation_id uuid NOT NULL REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  dependency_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_operation_id, child_operation_id, dependency_type),
  CONSTRAINT business_operation_dependencies_not_self
    CHECK (parent_operation_id <> child_operation_id),
  CONSTRAINT business_operation_dependencies_type_nonempty
    CHECK (btrim(dependency_type) <> '')
);

CREATE INDEX business_operation_dependencies_child_idx
  ON public.business_operation_dependencies (child_operation_id);

CREATE TABLE public.business_operation_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_operation_audit_event_type_nonempty
    CHECK (btrim(event_type) <> '')
);

CREATE INDEX business_operation_audit_operation_idx
  ON public.business_operation_audit_events (operation_id, created_at);

ALTER TABLE public.business_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_operation_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_operation_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_operations_select_tenant
ON public.business_operations
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.mill_memberships membership
    WHERE membership.mill_id = business_operations.mill_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.is_active = true
  )
);

CREATE POLICY business_operation_dependencies_select_tenant
ON public.business_operation_dependencies
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.business_operations parent_operation
    JOIN public.mill_memberships membership
      ON membership.mill_id = parent_operation.mill_id
    WHERE parent_operation.id = parent_operation_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.is_active = true
  )
);

CREATE POLICY business_operation_audit_select_tenant
ON public.business_operation_audit_events
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.business_operations operation
    JOIN public.mill_memberships membership
      ON membership.mill_id = operation.mill_id
    WHERE operation.id = operation_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.is_active = true
  )
);

REVOKE ALL ON TABLE public.business_operations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_operation_dependencies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_operation_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_operations TO authenticated;
GRANT SELECT ON TABLE public.business_operation_dependencies TO authenticated;
GRANT SELECT ON TABLE public.business_operation_audit_events TO authenticated;
GRANT ALL ON TABLE public.business_operations TO service_role;
GRANT ALL ON TABLE public.business_operation_dependencies TO service_role;
GRANT ALL ON TABLE public.business_operation_audit_events TO service_role;

CREATE OR REPLACE FUNCTION private.protect_business_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_OPERATION_DELETE_FORBIDDEN';
  END IF;

  IF ROW(NEW.id, NEW.mill_id, NEW.season_id, NEW.operation_type,
         NEW.source_type, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.mill_id, OLD.season_id, OLD.operation_type,
         OLD.source_type, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_OPERATION_IMMUTABLE';
  END IF;

  IF NEW.source_id IS DISTINCT FROM OLD.source_id
     AND NOT (OLD.source_id IS NULL AND NEW.source_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_OPERATION_SOURCE_IMMUTABLE';
  END IF;

  IF NEW.reverses_operation_id IS DISTINCT FROM OLD.reverses_operation_id
     AND NOT (OLD.reverses_operation_id IS NULL AND NEW.reverses_operation_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_OPERATION_REVERSAL_LINK_IMMUTABLE';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'active' AND NEW.status = 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_OPERATION_STATUS_INVALID';
  END IF;

  IF NEW.status = OLD.status
     AND ROW(NEW.cancelled_by, NEW.cancelled_at, NEW.cancellation_reason)
         IS DISTINCT FROM
         ROW(OLD.cancelled_by, OLD.cancelled_at, OLD.cancellation_reason) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_OPERATION_CANCELLATION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_business_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.business_operation_audit_events
      (operation_id, event_type, actor_user_id, details, created_at)
    VALUES
      (NEW.id, 'created', NEW.created_by,
       jsonb_build_object('operation_type', NEW.operation_type, 'source_type', NEW.source_type),
       NEW.created_at);
  ELSIF OLD.status = 'active' AND NEW.status = 'cancelled' THEN
    INSERT INTO public.business_operation_audit_events
      (operation_id, event_type, actor_user_id, reason, details, created_at)
    VALUES
      (NEW.id, 'cancelled', NEW.cancelled_by, NEW.cancellation_reason, '{}'::jsonb, NEW.cancelled_at);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.reject_immutable_business_fact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_HISTORY_IMMUTABLE';
END;
$$;

CREATE TRIGGER trg_10_protect_business_operation
BEFORE UPDATE OR DELETE ON public.business_operations
FOR EACH ROW EXECUTE FUNCTION private.protect_business_operation();

CREATE TRIGGER trg_90_audit_business_operation
AFTER INSERT OR UPDATE ON public.business_operations
FOR EACH ROW EXECUTE FUNCTION private.audit_business_operation();

CREATE TRIGGER trg_protect_business_operation_dependencies
BEFORE UPDATE OR DELETE ON public.business_operation_dependencies
FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_business_fact();

CREATE TRIGGER trg_protect_business_operation_audit
BEFORE UPDATE OR DELETE ON public.business_operation_audit_events
FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_business_fact();

-- ---------------------------------------------------------------------------
-- 3. Generalized command idempotency receipts
-- ---------------------------------------------------------------------------

CREATE TABLE public.business_command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  command_name text NOT NULL,
  mill_id uuid REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid REFERENCES public.seasons(id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'claimed',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT business_command_receipts_actor_key_unique
    UNIQUE (actor_user_id, idempotency_key),
  CONSTRAINT business_command_receipts_command_nonempty
    CHECK (btrim(command_name) <> ''),
  CONSTRAINT business_command_receipts_state_valid
    CHECK (state IN ('claimed', 'completed')),
  CONSTRAINT business_command_receipts_completion_consistent
    CHECK (
      (state = 'claimed' AND completed_at IS NULL)
      OR
      (state = 'completed' AND completed_at IS NOT NULL AND result IS NOT NULL)
    )
);

CREATE INDEX business_command_receipts_operation_idx
  ON public.business_command_receipts (operation_id)
  WHERE operation_id IS NOT NULL;

ALTER TABLE public.business_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_command_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_command_receipts TO service_role;

-- Preserve completed retry results from Phase 1. The old table becomes legacy
-- read-only storage and receives no new writes after the bridge functions below.
INSERT INTO public.business_command_receipts (
  id, actor_user_id, idempotency_key, command_name, state,
  result, created_at, completed_at
)
SELECT
  id, actor_user_id, idempotency_key, operation,
  CASE WHEN result IS NULL THEN 'claimed' ELSE 'completed' END,
  result, created_at, completed_at
FROM public.financial_command_receipts
ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.claim_business_command(
  p_idempotency_key uuid,
  p_command_name text,
  p_mill_id uuid DEFAULT NULL,
  p_season_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_receipt public.business_command_receipts%ROWTYPE;
  v_resolved_mill_id uuid := p_mill_id;
  v_season_mill_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  IF p_command_name IS NULL OR btrim(p_command_name) = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COMMAND_NAME_REQUIRED';
  END IF;

  IF p_season_id IS NOT NULL THEN
    SELECT s.mill_id INTO v_season_mill_id
    FROM public.seasons s
    WHERE s.id = p_season_id;

    IF v_season_mill_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEASON_NOT_FOUND';
    END IF;
    IF v_resolved_mill_id IS NOT NULL AND v_resolved_mill_id <> v_season_mill_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TENANT_CONTEXT_MISMATCH';
    END IF;
    v_resolved_mill_id := v_season_mill_id;
  END IF;

  IF v_resolved_mill_id IS NOT NULL
     AND NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_resolved_mill_id, NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  INSERT INTO public.business_command_receipts (
    actor_user_id, idempotency_key, command_name, mill_id, season_id
  ) VALUES (
    v_actor, p_idempotency_key, btrim(p_command_name), v_resolved_mill_id, p_season_id
  )
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_receipt
  FROM public.business_command_receipts
  WHERE actor_user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_receipt.command_name <> btrim(p_command_name)
     OR v_receipt.mill_id IS DISTINCT FROM v_resolved_mill_id
     OR v_receipt.season_id IS DISTINCT FROM p_season_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
  END IF;
  IF v_receipt.state <> 'completed' OR v_receipt.result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COMMAND_INCOMPLETE';
  END IF;

  RETURN v_receipt.result;
END;
$$;

CREATE OR REPLACE FUNCTION private.complete_business_command(
  p_idempotency_key uuid,
  p_command_name text,
  p_result jsonb,
  p_operation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF p_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COMMAND_RESULT_REQUIRED';
  END IF;

  IF p_operation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.business_command_receipts receipt
    JOIN public.business_operations operation ON operation.id = p_operation_id
    WHERE receipt.actor_user_id = auth.uid()
      AND receipt.idempotency_key = p_idempotency_key
      AND receipt.command_name = btrim(p_command_name)
      AND (receipt.mill_id IS NULL OR receipt.mill_id = operation.mill_id)
      AND (receipt.season_id IS NULL OR receipt.season_id = operation.season_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COMMAND_OPERATION_MISMATCH';
  END IF;

  UPDATE public.business_command_receipts
  SET state = 'completed',
      result = p_result,
      operation_id = p_operation_id,
      completed_at = now()
  WHERE actor_user_id = auth.uid()
    AND idempotency_key = p_idempotency_key
    AND command_name = btrim(p_command_name)
    AND state = 'claimed';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COMMAND_RECEIPT_NOT_CLAIMED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.claim_business_command(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.complete_business_command(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Financial effect linkage, backfill and immutable reversal validation
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS operation_id uuid;

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_operation_id_fkey;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES public.business_operations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS financial_transactions_operation_idx
  ON public.financial_transactions (operation_id);

INSERT INTO public.business_operations (
  mill_id, season_id, operation_type, source_type, source_id,
  status, created_by, created_at
)
SELECT
  ft.mill_id,
  ft.season_id,
  CASE
    WHEN ft.reversal_of IS NOT NULL THEN 'financial_reversal'
    ELSE COALESCE(NULLIF(btrim(ft.reference_type), ''), 'legacy_financial')
  END,
  CASE
    WHEN ft.reversal_of IS NOT NULL THEN 'financial_reversal'
    ELSE COALESCE(NULLIF(btrim(ft.reference_type), ''), 'financial_transaction')
  END,
  CASE WHEN ft.reversal_of IS NOT NULL THEN ft.id ELSE COALESCE(ft.reference_id, ft.id) END,
  'active',
  ft.created_by,
  ft.created_at
FROM public.financial_transactions ft
ON CONFLICT (mill_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

UPDATE public.financial_transactions ft
SET operation_id = operation.id
FROM public.business_operations operation
WHERE ft.operation_id IS NULL
  AND operation.mill_id = ft.mill_id
  AND operation.source_type = CASE
    WHEN ft.reversal_of IS NOT NULL THEN 'financial_reversal'
    ELSE COALESCE(NULLIF(btrim(ft.reference_type), ''), 'financial_transaction')
  END
  AND operation.source_id = CASE
    WHEN ft.reversal_of IS NOT NULL THEN ft.id
    ELSE COALESCE(ft.reference_id, ft.id)
  END;

UPDATE public.business_operations reversal_operation
SET reverses_operation_id = original.operation_id
FROM public.financial_transactions reversal
JOIN public.financial_transactions original ON original.id = reversal.reversal_of
WHERE reversal.operation_id = reversal_operation.id
  AND reversal_operation.reverses_operation_id IS NULL;

INSERT INTO public.business_operation_audit_events (
  operation_id, event_type, actor_user_id, details, created_at
)
SELECT
  operation.id,
  'created',
  operation.created_by,
  jsonb_build_object(
    'operation_type', operation.operation_type,
    'source_type', operation.source_type,
    'legacy_backfill', true
  ),
  operation.created_at
FROM public.business_operations operation
WHERE NOT EXISTS (
  SELECT 1
  FROM public.business_operation_audit_events event
  WHERE event.operation_id = operation.id
    AND event.event_type = 'created'
);

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_reversal_not_self;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_reversal_not_self
  CHECK (reversal_of IS NULL OR reversal_of <> id);

ALTER TABLE public.financial_transactions
  VALIDATE CONSTRAINT financial_transactions_amount_positive;
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_amount_check;

CREATE OR REPLACE FUNCTION private.ensure_financial_event_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := COALESCE(NEW.created_by, auth.uid());
  v_operation_id uuid;
  v_original public.financial_transactions%ROWTYPE;
  v_source_type text;
  v_source_id uuid;
  v_expected_direction text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FINANCIAL_EVENT_ACTOR_REQUIRED';
  END IF;

  IF NEW.reversal_of IS NOT NULL THEN
    SELECT * INTO v_original
    FROM public.financial_transactions
    WHERE id = NEW.reversal_of
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVERSAL_ORIGINAL_NOT_FOUND';
    END IF;
    IF v_original.reversal_of IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVERSAL_OF_REVERSAL_FORBIDDEN';
    END IF;
    IF NEW.mill_id <> v_original.mill_id OR NEW.season_id <> v_original.season_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVERSAL_TENANT_MISMATCH';
    END IF;
    v_expected_direction := CASE v_original.direction::text
      WHEN 'in' THEN 'out'
      WHEN 'out' THEN 'in'
      ELSE 'none'
    END;
    IF NEW.amount <> v_original.amount
       OR NEW.payment_method <> v_original.payment_method
       OR NEW.direction::text <> v_expected_direction THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVERSAL_EFFECT_MISMATCH';
    END IF;
    IF NEW.reversal_reason IS NULL OR btrim(NEW.reversal_reason) = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVERSAL_REASON_REQUIRED';
    END IF;

    IF NEW.operation_id IS NULL THEN
      INSERT INTO public.business_operations (
        mill_id, season_id, operation_type, source_type, source_id,
        created_by, reverses_operation_id
      ) VALUES (
        NEW.mill_id, NEW.season_id, 'financial_reversal',
        'financial_reversal', NEW.id, v_actor, v_original.operation_id
      )
      RETURNING id INTO NEW.operation_id;
    END IF;
  ELSIF NEW.operation_id IS NULL THEN
    v_source_type := COALESCE(NULLIF(btrim(NEW.reference_type), ''), 'financial_transaction');
    v_source_id := COALESCE(NEW.reference_id, NEW.id);

    INSERT INTO public.business_operations (
      mill_id, season_id, operation_type, source_type, source_id, created_by
    ) VALUES (
      NEW.mill_id, NEW.season_id, v_source_type, v_source_type, v_source_id, v_actor
    )
    ON CONFLICT (mill_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_operation_id;

    IF v_operation_id IS NULL THEN
      SELECT operation.id INTO v_operation_id
      FROM public.business_operations operation
      WHERE operation.mill_id = NEW.mill_id
        AND operation.source_type = v_source_type
        AND operation.source_id = v_source_id;
    END IF;
    NEW.operation_id := v_operation_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_operations operation
    WHERE operation.id = NEW.operation_id
      AND operation.mill_id = NEW.mill_id
      AND operation.season_id = NEW.season_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FINANCIAL_OPERATION_MISMATCH';
  END IF;

  NEW.created_by := v_actor;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_10_ensure_financial_event_operation ON public.financial_transactions;
CREATE TRIGGER trg_10_ensure_financial_event_operation
BEFORE INSERT ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION private.ensure_financial_event_operation();

REVOKE ALL ON FUNCTION private.ensure_financial_event_operation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.protect_business_operation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.audit_business_operation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reject_immutable_business_fact() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Canonical effective financial read model
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.financial_effective_events
WITH (security_invoker = true)
AS
SELECT
  ft.id,
  ft.operation_id,
  ft.mill_id,
  ft.season_id,
  ft.type,
  ft.category,
  ft.amount,
  ft.direction,
  ft.payment_method,
  ft.reference_type,
  ft.reference_id,
  ft.party_type,
  ft.party_id,
  ft.party_name,
  ft.description,
  ft.status,
  ft.created_by,
  ft.created_at,
  ft.cash_session_id,
  ft.idempotency_key,
  ft.reversal_of,
  ft.reversal_reason,
  operation.operation_type,
  operation.source_type AS operation_source_type,
  operation.status AS operation_status,
  (ft.reversal_of IS NOT NULL) AS is_reversal,
  EXISTS (
    SELECT 1
    FROM public.financial_transactions reversal
    WHERE reversal.reversal_of = ft.id
      AND reversal.status = 'active'::public.financial_tx_status
  ) AS is_reversed,
  CASE
    WHEN ft.status <> 'active'::public.financial_tx_status THEN 'legacy_voided'
    WHEN ft.reversal_of IS NOT NULL THEN 'reversal'
    WHEN EXISTS (
      SELECT 1
      FROM public.financial_transactions reversal
      WHERE reversal.reversal_of = ft.id
        AND reversal.status = 'active'::public.financial_tx_status
    ) THEN 'reversed'
    ELSE 'effective'
  END AS effect_status,
  CASE
    WHEN ft.status <> 'active'::public.financial_tx_status THEN 0::numeric
    WHEN ft.direction = 'in'::public.financial_direction THEN ft.amount
    WHEN ft.direction = 'out'::public.financial_direction THEN -ft.amount
    ELSE 0::numeric
  END AS signed_amount
FROM public.financial_transactions ft
LEFT JOIN public.business_operations operation ON operation.id = ft.operation_id;

REVOKE ALL ON TABLE public.financial_effective_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_effective_events TO authenticated, service_role;

COMMENT ON TABLE public.business_operations IS
  'Canonical envelope for one accepted business command and its linked effects.';
COMMENT ON TABLE public.business_command_receipts IS
  'Canonical idempotency receipt for every business command; never client writable.';
COMMENT ON TABLE public.business_operation_dependencies IS
  'Immutable parent-child operation dependencies used by cancellation eligibility.';
COMMENT ON TABLE public.business_operation_audit_events IS
  'Immutable operation lifecycle audit events without secret or source payloads.';
COMMENT ON COLUMN public.financial_transactions.operation_id IS
  'Canonical operation envelope. Transitional trigger supplies it for legacy commands.';
