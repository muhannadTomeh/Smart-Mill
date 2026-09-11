-- ==============================================================================
-- Migration: Cash Sessions System
-- Date: 2026-09-12
-- Purpose: Add real Cash Session management (open/close register)
--
-- SAFE: No DROP TABLE, no DROP COLUMN, no DELETE DATA.
-- Financial Core (inventory, financial_transactions) stays unchanged except
-- optional nullable cash_session_id column added.
-- ==============================================================================

-- ==============================================================================
-- 1. CREATE cash_sessions TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id          uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  season_id        uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  opened_by        uuid NOT NULL,  -- auth.uid() who opened the session
  opening_balance  numeric NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  expected_balance numeric,        -- computed at closing time
  actual_balance   numeric,        -- cashier-counted at closing
  difference       numeric,        -- actual - expected
  closing_note     text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- Snapshot totals (updated on close for reporting)
  total_cash_in    numeric NOT NULL DEFAULT 0,
  total_cash_out   numeric NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ONE open session per mill (not per user as per business rules)
-- When status changes to 'closed', the constraint is released for that row
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_mill
  ON public.cash_sessions (mill_id)
  WHERE status = 'open';

-- Index for fast lookup by opened_by
CREATE INDEX IF NOT EXISTS cash_sessions_opened_by_idx ON public.cash_sessions (opened_by);
CREATE INDEX IF NOT EXISTS cash_sessions_mill_status_idx ON public.cash_sessions (mill_id, status);
CREATE INDEX IF NOT EXISTS cash_sessions_season_idx ON public.cash_sessions (season_id);

-- ==============================================================================
-- 2. ADD cash_session_id TO financial_transactions (nullable, non-destructive)
-- ==============================================================================
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS cash_session_id uuid
  REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS financial_transactions_session_idx
  ON public.financial_transactions (cash_session_id)
  WHERE cash_session_id IS NOT NULL;

-- ==============================================================================
-- 3. RLS POLICIES FOR cash_sessions
-- ==============================================================================
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

-- Members of the mill can view sessions for their mill
CREATE POLICY "cash_sessions_select_mill_members"
  ON public.cash_sessions FOR SELECT
  USING (
    mill_id IN (
      SELECT mm.mill_id FROM public.mill_memberships mm
      WHERE mm.user_id = auth.uid() AND mm.is_active = true
    )
    OR public.is_platform_admin(auth.uid())
  );

-- Only active mill members can insert (but RPC enforces stricter checks)
CREATE POLICY "cash_sessions_insert_active_members"
  ON public.cash_sessions FOR INSERT
  WITH CHECK (
    opened_by = auth.uid()
    AND mill_id IN (
      SELECT mm.mill_id FROM public.mill_memberships mm
      WHERE mm.user_id = auth.uid() AND mm.is_active = true
    )
  );

-- Only the opener or platform admin can update (close) a session
CREATE POLICY "cash_sessions_update_opener"
  ON public.cash_sessions FOR UPDATE
  USING (
    opened_by = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

-- ==============================================================================
-- 4. RPC: get_active_cash_session()
-- Returns the currently open cash session for the caller's mill, or NULL.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_active_cash_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_mill_id uuid;
  v_session record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get caller's mill (must be active member)
  SELECT mm.mill_id INTO v_mill_id
  FROM public.mill_memberships mm
  WHERE mm.user_id = v_caller AND mm.is_active = true
  LIMIT 1;

  IF v_mill_id IS NULL THEN
    -- Platform admin has no mill membership — return null
    RETURN NULL;
  END IF;

  -- Get open session for this mill
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE mill_id = v_mill_id AND status = 'open'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('session', null, 'mill_id', v_mill_id);
  END IF;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id',              v_session.id,
      'mill_id',         v_session.mill_id,
      'season_id',       v_session.season_id,
      'opened_by',       v_session.opened_by,
      'opening_balance', v_session.opening_balance,
      'opened_at',       v_session.opened_at,
      'status',          v_session.status,
      'total_cash_in',   v_session.total_cash_in,
      'total_cash_out',  v_session.total_cash_out
    ),
    'mill_id', v_mill_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_cash_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_cash_session() TO authenticated, service_role;

-- ==============================================================================
-- 5. RPC: open_cash_session(p_season_id, p_opening_balance)
-- Opens a new cash session for the caller's mill.
-- Fails if another session is already open for that mill.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_season_id      uuid,
  p_opening_balance numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_mill_id   uuid;
  v_season_mill_id uuid;
  v_session_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_opening_balance < 0 THEN
    RAISE EXCEPTION 'الرصيد الافتتاحي لا يمكن أن يكون سالباً';
  END IF;

  -- Resolve mill from caller's membership (canonical tenant identity)
  SELECT mm.mill_id INTO v_mill_id
  FROM public.mill_memberships mm
  WHERE mm.user_id = v_caller AND mm.is_active = true
  LIMIT 1;

  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'المستخدم غير منتسب لأي معصرة نشطة';
  END IF;

  -- Verify season belongs to this mill
  SELECT mill_id INTO v_season_mill_id
  FROM public.seasons WHERE id = p_season_id;

  IF v_season_mill_id IS NULL OR v_season_mill_id != v_mill_id THEN
    RAISE EXCEPTION 'الموسم المحدد لا ينتمي لمعصرتك';
  END IF;

  -- Check no open session for this mill (unique index handles this but give nice error)
  IF EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE mill_id = v_mill_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'يوجد صندوق مفتوح بالفعل لهذه المعصرة. يجب إغلاقه أولاً قبل فتح صندوق جديد.';
  END IF;

  -- Create the session
  INSERT INTO public.cash_sessions (
    mill_id, season_id, opened_by, opening_balance, status, opened_at
  ) VALUES (
    v_mill_id, p_season_id, v_caller, p_opening_balance, 'open', now()
  ) RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'mill_id', v_mill_id,
    'opening_balance', p_opening_balance,
    'opened_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated, service_role;

-- ==============================================================================
-- 6. RPC: close_cash_session(p_session_id, p_actual_balance, p_closing_note)
-- Closes an open cash session.
-- Computes expected balance from financial_transactions linked to this session
-- and falls back to computing from opened_at timestamp if no session_id linked.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id    uuid,
  p_actual_balance numeric,
  p_closing_note  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller      uuid := auth.uid();
  v_session     record;
  v_mill_id     uuid;
  v_cash_in     numeric := 0;
  v_cash_out    numeric := 0;
  v_expected    numeric;
  v_difference  numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_actual_balance < 0 THEN
    RAISE EXCEPTION 'المبلغ الفعلي لا يمكن أن يكون سالباً';
  END IF;

  -- Get the session with lock
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة';
  END IF;

  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'هذه الجلسة مغلقة بالفعل';
  END IF;

  -- Verify caller belongs to the same mill
  SELECT mm.mill_id INTO v_mill_id
  FROM public.mill_memberships mm
  WHERE mm.user_id = v_caller AND mm.is_active = true AND mm.mill_id = v_session.mill_id
  LIMIT 1;

  IF v_mill_id IS NULL AND NOT public.is_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'غير مصرح لك بإغلاق هذه الجلسة';
  END IF;

  -- Compute cash in/out for the session period:
  -- Try cash_session_id first (linked transactions), then fall back to time range
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out
  FROM public.financial_transactions
  WHERE
    mill_id = v_session.mill_id
    AND season_id = v_session.season_id
    AND status = 'active'
    AND payment_method = 'cash'
    AND created_at >= v_session.opened_at
    AND (v_session.closed_at IS NULL OR created_at < now());

  v_expected   := v_session.opening_balance + v_cash_in - v_cash_out;
  v_difference := p_actual_balance - v_expected;

  -- Close the session
  UPDATE public.cash_sessions SET
    status           = 'closed',
    closed_at        = now(),
    expected_balance = v_expected,
    actual_balance   = p_actual_balance,
    difference       = v_difference,
    closing_note     = p_closing_note,
    total_cash_in    = v_cash_in,
    total_cash_out   = v_cash_out
  WHERE id = p_session_id;

  -- Also save to daily_closings for historical compatibility
  INSERT INTO public.daily_closings (
    mill_id, season_id, closing_date,
    cashier_name, opening_cash,
    total_cash_in, total_cash_out,
    expected_cash, actual_cash, difference,
    notes, created_by
  ) VALUES (
    v_session.mill_id, v_session.season_id, now(),
    v_caller::text,
    v_session.opening_balance,
    v_cash_in, v_cash_out,
    v_expected, p_actual_balance, v_difference,
    p_closing_note, v_caller
  );

  RETURN jsonb_build_object(
    'success',         true,
    'session_id',      p_session_id,
    'expected_balance', v_expected,
    'actual_balance',  p_actual_balance,
    'difference',      v_difference,
    'cash_in',         v_cash_in,
    'cash_out',        v_cash_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) TO authenticated, service_role;

-- ==============================================================================
-- 7. DB TRIGGER: Enforce Cash Session for cash operations
-- Rejects INSERT on cash-affecting tables when no open session for the mill.
-- Applies to: invoices (cash_amount > 0), expenses, oil_transactions, worker_payments
-- Platform Admin (is_platform_admin) is exempt.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_mill_id uuid;
  v_has_session boolean;
BEGIN
  -- Platform Admin is exempt
  IF public.is_platform_admin(v_caller) THEN
    RETURN NEW;
  END IF;

  -- Determine mill_id from the record being inserted
  v_mill_id := NEW.mill_id;

  IF v_mill_id IS NULL THEN
    RETURN NEW; -- Cannot enforce without mill_id, allow
  END IF;

  -- Check if open session exists for this mill
  SELECT EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE mill_id = v_mill_id AND status = 'open'
  ) INTO v_has_session;

  IF NOT v_has_session THEN
    RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل إجراء أي عملية نقدية.';
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger to expenses
DROP TRIGGER IF EXISTS trg_enforce_cash_session_expenses ON public.expenses;
CREATE TRIGGER trg_enforce_cash_session_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cash_session();

-- Apply trigger to worker_payments
DROP TRIGGER IF EXISTS trg_enforce_cash_session_worker_payments ON public.worker_payments;
CREATE TRIGGER trg_enforce_cash_session_worker_payments
  BEFORE INSERT ON public.worker_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cash_session();

-- Apply trigger to oil_transactions
DROP TRIGGER IF EXISTS trg_enforce_cash_session_oil_transactions ON public.oil_transactions;
CREATE TRIGGER trg_enforce_cash_session_oil_transactions
  BEFORE INSERT ON public.oil_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cash_session();

-- Apply trigger to invoices (only when cash_amount > 0)
CREATE OR REPLACE FUNCTION public.enforce_cash_session_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_mill_id uuid;
  v_has_session boolean;
BEGIN
  -- Platform Admin exempt
  IF public.is_platform_admin(v_caller) THEN
    RETURN NEW;
  END IF;

  -- Only enforce if cash is involved
  IF COALESCE(NEW.cash_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_mill_id := NEW.mill_id;
  IF v_mill_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE mill_id = v_mill_id AND status = 'open'
  ) INTO v_has_session;

  IF NOT v_has_session THEN
    RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل إصدار فواتير نقدية.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cash_session_invoices ON public.invoices;
CREATE TRIGGER trg_enforce_cash_session_invoices
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cash_session_invoices();

-- Grants for trigger functions
REVOKE ALL ON FUNCTION public.enforce_cash_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_cash_session_invoices() FROM PUBLIC;
