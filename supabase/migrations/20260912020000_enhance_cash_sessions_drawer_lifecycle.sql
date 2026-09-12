-- ==============================================================================
-- Migration: Enhance Cash Sessions Drawer Lifecycle & Strict Session Binding
-- Date: 2026-09-12
--
-- Features:
-- 1. Add cash_session_id to operational tables (invoices, expenses, oil_transactions, worker_payments, customer_payments)
-- 2. Add closed_by to cash_sessions
-- 3. Replace enforce triggers with enforce_and_stamp_cash_session() on all cash-affecting tables
-- 4. Automatically lock closed sessions from any updates (historical record immutability)
-- 5. Update close_cash_session RPC:
--    - Compute inflows/outflows strictly by cash_session_id
--    - Require closing note if difference != 0
--    - Record closed_by
-- 6. Update get_active_cash_session RPC to return opener details
-- ==============================================================================

-- 1. ADD COLUMNS (Safe, nullable, non-destructive)
ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS closed_by uuid;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_cash_session_idx ON public.invoices(cash_session_id) WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_cash_session_idx ON public.expenses(cash_session_id) WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.oil_transactions
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS oil_transactions_cash_session_idx ON public.oil_transactions(cash_session_id) WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.worker_payments
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS worker_payments_cash_session_idx ON public.worker_payments(cash_session_id) WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS customer_payments_cash_session_idx ON public.customer_payments(cash_session_id) WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS financial_transactions_cash_session_idx ON public.financial_transactions(cash_session_id) WHERE cash_session_id IS NOT NULL;


-- 2. UPDATE RLS ON cash_sessions: Allow all mill members to update/close an open session
DROP POLICY IF EXISTS "cash_sessions_update_opener" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_update_mill_members" ON public.cash_sessions;

CREATE POLICY "cash_sessions_update_mill_members"
  ON public.cash_sessions FOR UPDATE
  USING (
    mill_id IN (
      SELECT mm.mill_id FROM public.mill_memberships mm
      WHERE mm.user_id = auth.uid() AND mm.is_active = true
    )
    OR public.is_platform_admin(auth.uid())
  );


-- 3. TRIGGER FUNCTION: Enforce and Stamp Cash Session
-- Blocks operational cash transactions when session is closed.
-- Automatically stamps cash_session_id from the verified active session.
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
  -- Resolve mill_id from record
  v_mill_id := NEW.mill_id;

  -- Fallback lookup if not present on record
  IF v_mill_id IS NULL AND v_caller IS NOT NULL THEN
    SELECT mm.mill_id INTO v_mill_id
    FROM public.mill_memberships mm
    WHERE mm.user_id = v_caller AND mm.is_active = true
    LIMIT 1;
  END IF;

  -- Platform Admin exemption
  IF public.is_platform_admin(v_caller) THEN
    IF v_mill_id IS NOT NULL THEN
      SELECT * INTO v_active_session
      FROM public.cash_sessions
      WHERE mill_id = v_mill_id AND status = 'open'
      LIMIT 1;
      IF FOUND THEN
        NEW.cash_session_id := v_active_session.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Filter non-cash operations so they are NOT blocked
  IF TG_TABLE_NAME = 'invoices' THEN
    IF COALESCE(NEW.cash_amount, 0) <= 0 THEN
      RETURN NEW; -- Non-cash invoice (oil payment or deferred), allow without session
    END IF;
  ELSIF TG_TABLE_NAME = 'oil_transactions' THEN
    IF COALESCE(NEW.total_price, 0) <= 0 THEN
      RETURN NEW; -- Zero-cash oil transaction, allow
    END IF;
  ELSIF TG_TABLE_NAME = 'worker_payments' THEN
    IF COALESCE(NEW.amount, 0) <= 0 THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'customer_payments' THEN
    IF COALESCE(NEW.payment_method, 'cash') != 'cash' OR COALESCE(NEW.amount, 0) <= 0 THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'financial_transactions' THEN
    IF COALESCE(NEW.payment_method, 'cash') != 'cash' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_mill_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for active open session for this mill
  SELECT * INTO v_active_session
  FROM public.cash_sessions
  WHERE mill_id = v_mill_id AND status = 'open'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل إجراء أي عملية نقدية.';
  END IF;

  -- Stamp the verified session_id (cannot be faked by frontend)
  NEW.cash_session_id := v_active_session.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_and_stamp_cash_session() FROM PUBLIC;


-- 4. ATTACH TRIGGERS TO ALL CASH-AFFECTING TABLES
-- Invoices
DROP TRIGGER IF EXISTS trg_enforce_cash_session_invoices ON public.invoices;
DROP TRIGGER IF EXISTS trg_enforce_and_stamp_invoices ON public.invoices;
CREATE TRIGGER trg_enforce_and_stamp_invoices
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_stamp_cash_session();

-- Expenses
DROP TRIGGER IF EXISTS trg_enforce_cash_session_expenses ON public.expenses;
DROP TRIGGER IF EXISTS trg_enforce_and_stamp_expenses ON public.expenses;
CREATE TRIGGER trg_enforce_and_stamp_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_stamp_cash_session();

-- Oil Transactions
DROP TRIGGER IF EXISTS trg_enforce_cash_session_oil_transactions ON public.oil_transactions;
DROP TRIGGER IF EXISTS trg_enforce_and_stamp_oil_transactions ON public.oil_transactions;
CREATE TRIGGER trg_enforce_and_stamp_oil_transactions
  BEFORE INSERT ON public.oil_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_stamp_cash_session();

-- Worker Payments
DROP TRIGGER IF EXISTS trg_enforce_cash_session_worker_payments ON public.worker_payments;
DROP TRIGGER IF EXISTS trg_enforce_and_stamp_worker_payments ON public.worker_payments;
CREATE TRIGGER trg_enforce_and_stamp_worker_payments
  BEFORE INSERT ON public.worker_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_stamp_cash_session();

-- Customer Payments
DROP TRIGGER IF EXISTS trg_enforce_and_stamp_customer_payments ON public.customer_payments;
CREATE TRIGGER trg_enforce_and_stamp_customer_payments
  BEFORE INSERT ON public.customer_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_stamp_cash_session();

-- Financial Transactions
DROP TRIGGER IF EXISTS trg_enforce_and_stamp_financial_transactions ON public.financial_transactions;
CREATE TRIGGER trg_enforce_and_stamp_financial_transactions
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_and_stamp_cash_session();


-- 5. TRIGGER: Lock closed sessions from any updates (Immutability)
CREATE OR REPLACE FUNCTION public.prevent_closed_session_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'لا يمكن تعديل جلسة كاش مغلقة؛ الجلسة أصبحت سجلاً تاريخياً مقفلاً.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_closed_session_modification ON public.cash_sessions;
CREATE TRIGGER trg_prevent_closed_session_modification
  BEFORE UPDATE ON public.cash_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_closed_session_modification();


-- 6. RPC: get_active_cash_session()
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
  v_opener_name text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get caller's mill
  SELECT mm.mill_id INTO v_mill_id
  FROM public.mill_memberships mm
  WHERE mm.user_id = v_caller AND mm.is_active = true
  LIMIT 1;

  IF v_mill_id IS NULL THEN
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

  -- Get opener display name
  SELECT COALESCE(p.display_name, u.email, 'مسؤول الصندوق') INTO v_opener_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_session.opened_by;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id',              v_session.id,
      'mill_id',         v_session.mill_id,
      'season_id',       v_session.season_id,
      'opened_by',       v_session.opened_by,
      'opener_name',     v_opener_name,
      'opening_balance', v_session.opening_balance,
      'opened_at',       v_session.opened_at,
      'status',          v_session.status
    ),
    'mill_id', v_mill_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_cash_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_cash_session() TO authenticated, service_role;


-- 7. RPC: close_cash_session(p_session_id, p_actual_balance, p_closing_note)
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id     uuid,
  p_actual_balance numeric,
  p_closing_note   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_session        record;
  v_mill_id        uuid;
  v_invoices_cash  numeric := 0;
  v_invoices_cnt   int := 0;
  v_oil_sales_cash numeric := 0;
  v_cust_pay_cash  numeric := 0;
  v_expenses_cash  numeric := 0;
  v_oil_pur_cash   numeric := 0;
  v_worker_cash    numeric := 0;
  v_standalone_in  numeric := 0;
  v_standalone_out numeric := 0;
  v_cash_in        numeric := 0;
  v_cash_out       numeric := 0;
  v_expected       numeric := 0;
  v_difference     numeric := 0;
  v_closer_name    text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_actual_balance < 0 THEN
    RAISE EXCEPTION 'المبلغ الفعلي لا يمكن أن يكون سالباً';
  END IF;

  -- Lock and retrieve session
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة';
  END IF;

  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'هذه الجلسة مغلقة بالفعل ولا يمكن إعادة إغلاقها';
  END IF;

  -- Verify caller belongs to same mill or platform admin
  SELECT mm.mill_id INTO v_mill_id
  FROM public.mill_memberships mm
  WHERE mm.user_id = v_caller AND mm.is_active = true AND mm.mill_id = v_session.mill_id
  LIMIT 1;

  IF v_mill_id IS NULL AND NOT public.is_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'غير مصرح لك بإغلاق هذه الجلسة';
  END IF;

  -- Ensure any transactions within time range without cash_session_id get linked
  UPDATE public.invoices
  SET cash_session_id = v_session.id
  WHERE mill_id = v_session.mill_id AND season_id = v_session.season_id
    AND cash_session_id IS NULL AND created_at >= v_session.opened_at AND created_at <= now()
    AND COALESCE(cash_amount, 0) > 0;

  UPDATE public.expenses
  SET cash_session_id = v_session.id
  WHERE mill_id = v_session.mill_id AND season_id = v_session.season_id
    AND cash_session_id IS NULL AND created_at >= v_session.opened_at AND created_at <= now();

  UPDATE public.oil_transactions
  SET cash_session_id = v_session.id
  WHERE mill_id = v_session.mill_id AND season_id = v_session.season_id
    AND cash_session_id IS NULL AND created_at >= v_session.opened_at AND created_at <= now()
    AND COALESCE(total_price, 0) > 0;

  UPDATE public.worker_payments
  SET cash_session_id = v_session.id
  WHERE mill_id = v_session.mill_id AND season_id = v_session.season_id
    AND cash_session_id IS NULL AND created_at >= v_session.opened_at AND created_at <= now();

  UPDATE public.customer_payments
  SET cash_session_id = v_session.id
  WHERE mill_id = v_session.mill_id AND season_id = v_session.season_id
    AND cash_session_id IS NULL AND created_at >= v_session.opened_at AND created_at <= now()
    AND COALESCE(payment_method, 'cash') = 'cash';

  UPDATE public.financial_transactions
  SET cash_session_id = v_session.id
  WHERE mill_id = v_session.mill_id AND season_id = v_session.season_id
    AND cash_session_id IS NULL AND created_at >= v_session.opened_at AND created_at <= now()
    AND COALESCE(payment_method, 'cash') = 'cash';

  -- Calculate session inflows strictly by cash_session_id
  SELECT COALESCE(SUM(cash_amount), 0), COUNT(*)
  INTO v_invoices_cash, v_invoices_cnt
  FROM public.invoices
  WHERE cash_session_id = v_session.id;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_oil_sales_cash
  FROM public.oil_transactions
  WHERE cash_session_id = v_session.id AND type = 'sell';

  SELECT COALESCE(SUM(amount), 0)
  INTO v_cust_pay_cash
  FROM public.customer_payments
  WHERE cash_session_id = v_session.id AND payment_method = 'cash';

  -- Calculate session outflows strictly by cash_session_id
  SELECT COALESCE(SUM(amount), 0)
  INTO v_expenses_cash
  FROM public.expenses
  WHERE cash_session_id = v_session.id;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_oil_pur_cash
  FROM public.oil_transactions
  WHERE cash_session_id = v_session.id AND type = 'buy';

  SELECT COALESCE(SUM(amount), 0)
  INTO v_worker_cash
  FROM public.worker_payments
  WHERE cash_session_id = v_session.id;

  -- Standalone financial_transactions
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' AND reference_type NOT IN ('invoice', 'customer_payment', 'oil_sale') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' AND reference_type NOT IN ('expense', 'worker_payment', 'oil_purchase') THEN amount ELSE 0 END), 0)
  INTO v_standalone_in, v_standalone_out
  FROM public.financial_transactions
  WHERE cash_session_id = v_session.id AND status = 'active' AND payment_method = 'cash';

  v_cash_in  := v_invoices_cash + v_oil_sales_cash + v_cust_pay_cash + v_standalone_in;
  v_cash_out := v_expenses_cash + v_oil_pur_cash + v_worker_cash + v_standalone_out;

  v_expected   := v_session.opening_balance + v_cash_in - v_cash_out;
  v_difference := p_actual_balance - v_expected;

  -- RULE 10: If Difference != 0, closing note is mandatory!
  IF v_difference != 0 AND (p_closing_note IS NULL OR trim(p_closing_note) = '') THEN
    RAISE EXCEPTION 'يوجد فرق مقداره % شيكل بين النقد الفعلي والمتوقع. يرجى توضيح سبب الفرق في حقل الملاحظات لإتمام الإغلاق.', v_difference;
  END IF;

  -- Update and close session
  UPDATE public.cash_sessions SET
    status           = 'closed',
    closed_at        = now(),
    closed_by        = v_caller,
    expected_balance = v_expected,
    actual_balance   = p_actual_balance,
    difference       = v_difference,
    closing_note     = p_closing_note,
    total_cash_in    = v_cash_in,
    total_cash_out   = v_cash_out
  WHERE id = p_session_id;

  -- Fetch closer display name
  SELECT COALESCE(p.display_name, u.email, 'مسؤول الصندوق') INTO v_closer_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_caller;

  -- Record into daily_closings for backward compatibility & reporting
  INSERT INTO public.daily_closings (
    mill_id, season_id, closing_date,
    cashier_name, opening_cash,
    total_cash_in, total_cash_out,
    expected_cash, actual_cash, difference,
    invoices_cash, invoices_count,
    oil_sales_cash, expenses_cash,
    oil_purchases_cash, worker_payments_cash,
    notes, created_by
  ) VALUES (
    v_session.mill_id, v_session.season_id, now(),
    v_closer_name,
    v_session.opening_balance,
    v_cash_in, v_cash_out,
    v_expected, p_actual_balance, v_difference,
    v_invoices_cash, v_invoices_cnt,
    v_oil_sales_cash, v_expenses_cash,
    v_oil_pur_cash, v_worker_cash,
    p_closing_note, v_caller
  );

  RETURN jsonb_build_object(
    'success',          true,
    'session_id',       p_session_id,
    'expected_balance', v_expected,
    'actual_balance',   p_actual_balance,
    'difference',       v_difference,
    'cash_in',          v_cash_in,
    'cash_out',         v_cash_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) TO authenticated, service_role;
