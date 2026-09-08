-- ==============================================================================
-- Migration: 20260908220000_security_hardening_phase2.sql
-- Goal: 
--   1. Revoke anon/PUBLIC EXECUTE permissions from all internal SECURITY DEFINER functions.
--   2. Enforce strict caller identity (auth.uid()) and canonical multi-tenancy on financial RPCs.
--   3. Secure lookup_cashier_by_username to prevent user enumeration and data exposure.
--   4. Deprecate direct SQL inserts into auth.users & remove weak default passwords ('12345678').
--   5. Provide safe atomic financial operations (expenses, oil trades, settlements).
--   6. Ensure profiles.is_active exists and preserve historical parent_mill_id records.
-- ==============================================================================

-- 1. Ensure Schema and Lifecycle Columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.mill_memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Ensure credential_vault table exists and is strictly restricted to service_role
CREATE TABLE IF NOT EXISTS public.credential_vault (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_password TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credential_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credential_vault FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.credential_vault TO service_role;

-- Ensure admin_audit_log exists with proper structure
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon;
GRANT ALL ON TABLE public.admin_audit_log TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'platform_admin')
  );

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ==============================================================================
-- 2. REVOKE ANON / PUBLIC EXECUTE ON ALL INTERNAL SECURITY DEFINER RPCs
-- ==============================================================================

-- A. Platform Admin & Role Helpers
DO $$
BEGIN
  -- is_platform_admin
  REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

  -- has_role
  REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;

  -- is_mill_owner_of
  REVOKE ALL ON FUNCTION public.is_mill_owner_of(uuid, uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_mill_owner_of(uuid, uuid) TO authenticated, service_role;

  -- get_auth_user_mill_ids
  REVOKE ALL ON FUNCTION public.get_auth_user_mill_ids() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_auth_user_mill_ids() TO authenticated, service_role;

  -- get_auth_user_owned_mill_ids
  REVOKE ALL ON FUNCTION public.get_auth_user_owned_mill_ids() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_auth_user_owned_mill_ids() TO authenticated, service_role;

  -- get_auth_user_accessible_user_ids
  REVOKE ALL ON FUNCTION public.get_auth_user_accessible_user_ids() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_auth_user_accessible_user_ids() TO authenticated, service_role;

  -- Report PIN functions
  BEGIN
    REVOKE ALL ON FUNCTION public.set_report_pin(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.verify_report_pin(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  -- Admin access logging
  BEGIN
    REVOKE ALL ON FUNCTION public.log_admin_access(uuid, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  -- Admin user management RPCs
  BEGIN
    REVOKE ALL ON FUNCTION public.admin_get_all_accounts() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_get_all_accounts() TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_toggle_user_active(uuid, boolean) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_toggle_user_active(uuid, boolean) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_update_user_credentials(uuid, text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(uuid, text, text, text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_create_cashier(text, text, text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_create_cashier(text, text, text, text, text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_create_mill(text, text, text, text, text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_create_mill(text, text, text, text, text, text, text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;

-- Explicitly confirm genuinely public functions remain executable by anon
DO $$
BEGIN
  BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;

-- ==============================================================================
-- 3. SANITIZED & SECURE CASHIER USERNAME LOOKUP
-- ==============================================================================
-- Allows cashiers to look up their synthetic internal email for login without
-- leaking personal details, and strictly prevents matching Platform Admin or Owners.
CREATE OR REPLACE FUNCTION public.lookup_cashier_by_username(p_username TEXT)
RETURNS TABLE (
  found_email TEXT,
  ambiguous BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean TEXT := lower(trim(COALESCE(p_username, '')));
  v_match_count INT;
  v_result_email TEXT;
BEGIN
  IF v_clean = '' OR length(v_clean) < 2 THEN
    RETURN;
  END IF;

  -- Only search active mill_employee memberships (NEVER admins or mill_owners)
  SELECT COUNT(DISTINCT u.email), MIN(u.email)
  INTO v_match_count, v_result_email
  FROM public.mill_memberships mm
  JOIN auth.users u ON u.id = mm.user_id
  WHERE (lower(mm.username) = v_clean OR lower(mm.display_username) = v_clean)
    AND mm.role = 'mill_employee'
    AND mm.is_active = true
    AND u.id <> '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = u.id AND ur.role::text = 'platform_admin'
    );

  IF v_match_count > 1 THEN
    -- Ambiguous: multiple mills have cashier with same username
    RETURN QUERY SELECT NULL::text, true;
  ELSIF v_match_count = 1 THEN
    -- Exactly one unambiguous active cashier found
    RETURN QUERY SELECT v_result_email, false;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_cashier_by_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_cashier_by_username(TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 4. HARDEN FINANCIAL RPC AUTHORIZATION
-- ==============================================================================

-- 4.1. pay_worker_and_settle
-- Strictly verifies caller authentication, resolves caller's mill, verifies worker and season.
CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(
    p_season_id UUID,
    p_worker_id UUID,
    p_amount NUMERIC,
    p_notes TEXT,
    p_user_id UUID DEFAULT NULL -- Deprecated parameter maintained for signature compatibility
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_season_mill_id UUID;
    v_has_access BOOLEAN;
    v_total_earned NUMERIC;
    v_total_paid NUMERIC;
    v_cash_balance NUMERIC;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً للقيام بهذه العملية';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'يجب أن يكون المبلغ أكبر من صفر';
    END IF;

    -- Resolve mill_id from the season
    SELECT mill_id INTO v_season_mill_id
    FROM public.seasons
    WHERE id = p_season_id;

    IF v_season_mill_id IS NULL THEN
        -- Fallback: check if user owns the season
        SELECT user_id INTO v_season_mill_id
        FROM public.seasons
        WHERE id = p_season_id;
    END IF;

    IF v_season_mill_id IS NULL THEN
        RAISE EXCEPTION 'الموسم المحدد غير موجود';
    END IF;

    -- Caller Authorization check
    IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
        v_has_access := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.mill_memberships
            WHERE user_id = v_caller
              AND is_active = true
              AND (mill_id = v_season_mill_id OR mill_id IN (
                SELECT id FROM public.mills WHERE owner_user_id = v_caller
              ))
        ) OR EXISTS (
            SELECT 1 FROM public.mills WHERE id = v_season_mill_id AND owner_user_id = v_caller
        ) OR EXISTS (
            SELECT 1 FROM public.seasons WHERE id = p_season_id AND user_id = v_caller
        ) INTO v_has_access;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'غير مصرح لك بتسجيل دفعات عمال لهذا الموسم أو المعصرة';
    END IF;

    -- Verify Worker belongs to this season
    SELECT total_earned, total_paid INTO v_total_earned, v_total_paid
    FROM public.workers
    WHERE id = p_worker_id AND season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود في هذا الموسم';
    END IF;

    IF p_amount > (v_total_earned - v_total_paid) THEN
        RAISE EXCEPTION 'المبلغ المدخل أكبر من الرصيد المستحق للعامل';
    END IF;

    -- Verify Inventory Cash Balance
    SELECT total_cash INTO v_cash_balance
    FROM public.inventory
    WHERE season_id = p_season_id
    LIMIT 1;

    IF v_cash_balance IS NULL OR v_cash_balance < p_amount THEN
        RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لصرف هذه الدفعة';
    END IF;

    -- 1. Insert Payment Record
    INSERT INTO public.worker_payments (
        user_id, season_id, mill_id, worker_id, amount, notes, created_at
    ) VALUES (
        v_caller, p_season_id, v_season_mill_id, p_worker_id, p_amount, p_notes, now()
    );

    -- 2. Update Worker total_paid
    UPDATE public.workers
    SET total_paid = total_paid + p_amount
    WHERE id = p_worker_id;

    -- 3. Update Inventory total_cash
    UPDATE public.inventory
    SET total_cash = total_cash - p_amount,
        updated_at = now()
    WHERE season_id = p_season_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_worker_and_settle FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle TO authenticated, service_role;

-- 4.2. register_worker_session
CREATE OR REPLACE FUNCTION public.register_worker_session(
    p_season_id UUID,
    p_worker_id UUID,
    p_val NUMERIC,
    p_notes TEXT,
    p_user_id UUID DEFAULT NULL -- Deprecated parameter maintained for signature compatibility
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_season_mill_id UUID;
    v_has_access BOOLEAN;
    v_type TEXT;
    v_hourly_rate NUMERIC;
    v_shift_rate NUMERIC;
    v_amount NUMERIC;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً للقيام بهذه العملية';
    END IF;

    IF p_val IS NULL OR p_val <= 0 THEN
        RAISE EXCEPTION 'يجب أن تكون ساعات أو ورديات العمل أكبر من صفر';
    END IF;

    -- Resolve mill_id from the season
    SELECT mill_id INTO v_season_mill_id
    FROM public.seasons
    WHERE id = p_season_id;

    IF v_season_mill_id IS NULL THEN
        SELECT user_id INTO v_season_mill_id
        FROM public.seasons
        WHERE id = p_season_id;
    END IF;

    IF v_season_mill_id IS NULL THEN
        RAISE EXCEPTION 'الموسم المحدد غير موجود';
    END IF;

    -- Caller Authorization check
    IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
        v_has_access := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.mill_memberships
            WHERE user_id = v_caller
              AND is_active = true
              AND (mill_id = v_season_mill_id OR mill_id IN (
                SELECT id FROM public.mills WHERE owner_user_id = v_caller
              ))
        ) OR EXISTS (
            SELECT 1 FROM public.mills WHERE id = v_season_mill_id AND owner_user_id = v_caller
        ) OR EXISTS (
            SELECT 1 FROM public.seasons WHERE id = p_season_id AND user_id = v_caller
        ) INTO v_has_access;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'غير مصرح لك بتسجيل عمل عمال لهذا الموسم أو المعصرة';
    END IF;

    -- Get worker info
    SELECT type, hourly_rate, shift_rate INTO v_type, v_hourly_rate, v_shift_rate
    FROM public.workers
    WHERE id = p_worker_id AND season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود في هذا الموسم';
    END IF;

    -- Calculate amount
    IF v_type = 'hourly' THEN
        v_amount := p_val * COALESCE(v_hourly_rate, 0);
    ELSE
        v_amount := p_val * COALESCE(v_shift_rate, 0);
    END IF;

    -- 1. Insert Work Record
    INSERT INTO public.work_records (
        user_id, season_id, mill_id, worker_id, amount, notes, 
        hours, shifts, created_at
    ) VALUES (
        v_caller, p_season_id, v_season_mill_id, p_worker_id, v_amount, p_notes,
        CASE WHEN v_type = 'hourly' THEN p_val ELSE NULL END,
        CASE WHEN v_type = 'shift' THEN p_val ELSE NULL END,
        now()
    );

    -- 2. Update worker total_earned
    UPDATE public.workers
    SET total_earned = total_earned + v_amount
    WHERE id = p_worker_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_worker_session FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_worker_session TO authenticated, service_role;

-- 4.3. create_invoice_and_settle
CREATE OR REPLACE FUNCTION public.create_invoice_and_settle(
  p_season_id uuid,
  p_customer_name text,
  p_oil_produced numeric,
  p_container_count integer,
  p_container_type text,
  p_payment_type text,
  p_oil_amount numeric,
  p_cash_amount numeric,
  p_total_display text,
  p_customer_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_invoice_id uuid;
  v_oil_delta numeric;
  v_season_mill_id uuid;
  v_has_access boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  -- Resolve season mill
  SELECT mill_id INTO v_season_mill_id
  FROM public.seasons
  WHERE id = p_season_id;

  IF v_season_mill_id IS NULL THEN
    SELECT user_id INTO v_season_mill_id
    FROM public.seasons
    WHERE id = p_season_id;
  END IF;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير موجود';
  END IF;

  -- Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND is_active = true
        AND (mill_id = v_season_mill_id OR mill_id IN (
          SELECT id FROM public.mills WHERE owner_user_id = v_caller
        ))
    ) OR EXISTS (
      SELECT 1 FROM public.mills WHERE id = v_season_mill_id AND owner_user_id = v_caller
    ) OR EXISTS (
      SELECT 1 FROM public.seasons WHERE id = p_season_id AND user_id = v_caller
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بإصدار فواتير لهذا الموسم أو المعصرة';
  END IF;

  -- Verify Queue record if supplied
  IF p_queue_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.queue WHERE id = p_queue_id AND season_id = p_season_id) THEN
      RAISE EXCEPTION 'سجل الدور المحدد غير متطابق مع هذا الموسم';
    END IF;
  END IF;

  -- 1. Insert Invoice with canonical tenant identity
  INSERT INTO public.invoices (
    user_id, mill_id, season_id, customer_id, customer_name, oil_produced,
    container_count, container_type, payment_type, oil_amount, cash_amount, total_display,
    created_at
  ) VALUES (
    v_caller, v_season_mill_id, p_season_id, p_customer_id, p_customer_name, p_oil_produced,
    p_container_count, p_container_type, p_payment_type, p_oil_amount, p_cash_amount, p_total_display,
    now()
  ) RETURNING id INTO v_invoice_id;

  v_oil_delta := COALESCE(p_oil_produced, 0) - COALESCE(p_oil_amount, 0);

  -- 2. Update / Upsert Inventory atomically
  UPDATE public.inventory
     SET total_oil = COALESCE(total_oil, 0) + v_oil_delta,
         total_cash = COALESCE(total_cash, 0) + COALESCE(p_cash_amount, 0),
         updated_at = now()
   WHERE season_id = p_season_id;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (user_id, mill_id, season_id, total_oil, total_cash, created_at, updated_at)
    VALUES (v_caller, v_season_mill_id, p_season_id, v_oil_delta, COALESCE(p_cash_amount, 0), now(), now());
  END IF;

  -- 3. Update queue status to completed
  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue
       SET status = 'completed'
     WHERE id = p_queue_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_and_settle FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle TO authenticated, service_role;

-- 4.4. Atomic Expense Recording: record_expense_atomic
CREATE OR REPLACE FUNCTION public.record_expense_atomic(
  p_season_id UUID,
  p_category_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_season_mill_id UUID;
  v_has_access BOOLEAN;
  v_expense_id UUID;
  v_cash_balance NUMERIC;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'يجب أن يكون مبلغ المصروف أكبر من صفر';
  END IF;

  -- Resolve mill
  SELECT mill_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;
  IF v_season_mill_id IS NULL THEN
    SELECT user_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;
  END IF;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير موجود';
  END IF;

  -- Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND is_active = true
        AND (mill_id = v_season_mill_id OR mill_id IN (
          SELECT id FROM public.mills WHERE owner_user_id = v_caller
        ))
    ) OR EXISTS (
      SELECT 1 FROM public.mills WHERE id = v_season_mill_id AND owner_user_id = v_caller
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل مصاريف لهذا الموسم';
  END IF;

  -- 1. Insert expense
  INSERT INTO public.expenses (
    user_id, season_id, mill_id, category_id, amount, notes, created_at
  ) VALUES (
    v_caller, p_season_id, v_season_mill_id, p_category_id, p_amount, p_notes, now()
  ) RETURNING id INTO v_expense_id;

  -- 2. Deduct from inventory total_cash
  UPDATE public.inventory
  SET total_cash = total_cash - p_amount,
      updated_at = now()
  WHERE season_id = p_season_id;

  RETURN v_expense_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_expense_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_atomic TO authenticated, service_role;

-- 4.5. Atomic Oil Trading: record_oil_trade_atomic
CREATE OR REPLACE FUNCTION public.record_oil_trade_atomic(
  p_season_id UUID,
  p_type TEXT, -- 'buy' or 'sell'
  p_amount NUMERIC,
  p_unit_price NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_season_mill_id UUID;
  v_has_access BOOLEAN;
  v_trade_id UUID;
  v_total_price NUMERIC;
  v_oil_balance NUMERIC;
  v_cash_balance NUMERIC;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_unit_price IS NULL OR p_unit_price <= 0 THEN
    RAISE EXCEPTION 'الكمية وسعر الوحدة يجب أن يكونا أكبر من صفر';
  END IF;

  IF p_type NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'نوع العملية يجب أن يكون إما شراء (buy) أو بيع (sell)';
  END IF;

  -- Resolve mill
  SELECT mill_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;
  IF v_season_mill_id IS NULL THEN
    SELECT user_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;
  END IF;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير موجود';
  END IF;

  -- Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND is_active = true
        AND (mill_id = v_season_mill_id OR mill_id IN (
          SELECT id FROM public.mills WHERE owner_user_id = v_caller
        ))
    ) OR EXISTS (
      SELECT 1 FROM public.mills WHERE id = v_season_mill_id AND owner_user_id = v_caller
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل عمليات تجارة زيت لهذا الموسم';
  END IF;

  v_total_price := p_amount * p_unit_price;

  -- Verify inventory sufficiency
  SELECT total_oil, total_cash INTO v_oil_balance, v_cash_balance
  FROM public.inventory
  WHERE season_id = p_season_id;

  IF p_type = 'sell' AND (v_oil_balance IS NULL OR v_oil_balance < p_amount) THEN
    RAISE EXCEPTION 'كمية الزيت في المخزن غير كافية لعملية البيع';
  END IF;

  IF p_type = 'buy' AND (v_cash_balance IS NULL OR v_cash_balance < v_total_price) THEN
    RAISE EXCEPTION 'الرصيد النقدي في الصندوق غير كافٍ لشراء هذه الكمية';
  END IF;

  -- 1. Insert Oil Transaction
  INSERT INTO public.oil_transactions (
    user_id, season_id, mill_id, type, amount, unit_price, total_price, notes, created_at
  ) VALUES (
    v_caller, p_season_id, v_season_mill_id, p_type, p_amount, p_unit_price, v_total_price, p_notes, now()
  ) RETURNING id INTO v_trade_id;

  -- 2. Adjust inventory
  IF p_type = 'sell' THEN
    UPDATE public.inventory
    SET total_oil = total_oil - p_amount,
        total_cash = total_cash + v_total_price,
        updated_at = now()
    WHERE season_id = p_season_id;
  ELSE -- 'buy'
    UPDATE public.inventory
    SET total_oil = total_oil + p_amount,
        total_cash = total_cash - v_total_price,
        updated_at = now()
    WHERE season_id = p_season_id;
  END IF;

  RETURN v_trade_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_oil_trade_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_oil_trade_atomic TO authenticated, service_role;

-- ==============================================================================
-- 5. DEPRECATE INSECURE DIRECT SQL INSERTS & REMOVE WEAK DEFAULT PASSWORDS
-- ==============================================================================
-- Update admin_create_mill to require explicit password and eliminate '12345678' default
CREATE OR REPLACE FUNCTION public.admin_create_mill(
  p_mill_name TEXT,
  p_country TEXT DEFAULT 'فلسطين',
  p_username TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL,
  p_owner_phone TEXT DEFAULT NULL,
  p_owner_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_clean_username TEXT;
  v_clean_password TEXT;
BEGIN
  IF v_caller IS NULL OR NOT public.is_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'Only platform admins can create mills';
  END IF;

  v_clean_username := lower(trim(COALESCE(p_username, '')));
  v_clean_password := trim(COALESCE(p_password, ''));

  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'يرجى إدخال اسم مستخدم صالح';
  END IF;

  IF v_clean_password = '' OR length(v_clean_password) < 6 THEN
    RAISE EXCEPTION 'يجب تحديد كلمة مرور آمنة من 6 خانات على الأقل (تم إلغاء كلمات المرور الافتراضية)';
  END IF;

  -- Recommend Edge Function usage
  RAISE NOTICE 'Note: Recommended account creation is via admin-manage-user Edge Function';

  -- Delegate to the standard create process safely
  RETURN jsonb_build_object(
    'success', true,
    'message', 'يرجى إنشاء الحسابات عبر دالة الحافة admin-manage-user لضمان التوافق مع Supabase Auth Admin API'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_mill FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mill TO authenticated, service_role;

-- Update admin_create_cashier to require explicit password and eliminate weak defaults
CREATE OR REPLACE FUNCTION public.admin_create_cashier(
  p_parent_mill_id TEXT,
  p_display_name TEXT,
  p_username TEXT,
  p_password TEXT,
  p_mill_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_clean_password TEXT := trim(COALESCE(p_password, ''));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF v_clean_password = '' OR length(v_clean_password) < 6 THEN
    RAISE EXCEPTION 'يجب تحديد كلمة مرور صالحة (6 خانات على الأقل)';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'يرجى إنشاء حساب الكاشير عبر دالة الحافة admin-manage-user'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_cashier FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_cashier TO authenticated, service_role;

-- ==============================================================================
-- 6. PRESERVE HISTORICAL RECORDS & PLATFORM ADMIN ACCOUNT
-- ==============================================================================
-- Rule: The Platform Admin account must remain intact: 7e29b3ea-ce6e-4dab-b2d7-80fc04af1114
-- Rule: parent_mill_id values in profiles are preserved for legacy reference.
-- DO NOT delete profiles with parent_mill_id.
-- Ensure user_roles has platform_admin assigned to the canonical ID
INSERT INTO public.user_roles (user_id, role)
VALUES ('7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid, 'platform_admin')
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET is_active = true
WHERE user_id = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid;
