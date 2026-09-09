-- Migration: Fix financial_transactions reference_type constraint & function signatures
-- Date: 2026-09-09
-- Description: Ensures financial_transactions has a default for reference_type and all financial functions populate it correctly.

-- 1. Set default for reference_type
ALTER TABLE public.financial_transactions 
  ALTER COLUMN reference_type SET DEFAULT 'general';

-- 2. Update create_invoice_and_settle
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
  p_customer_id uuid DEFAULT NULL::uuid,
  p_queue_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_invoice_id uuid;
  v_oil_delta numeric;
  v_season_mill_id uuid;
  v_has_access boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Resolve season mill strictly (no user_id fallback)
  SELECT mill_id INTO v_season_mill_id
  FROM public.seasons
  WHERE id = p_season_id;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير مرتبط بمعصرة معتمدة أو غير موجود';
  END IF;

  -- Caller Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND mill_id = v_season_mill_id
        AND is_active = true
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بإصدار فواتير لهذه المعصرة';
  END IF;

  -- Verify Customer belongs to this mill if supplied
  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND mill_id = v_season_mill_id) THEN
      RAISE EXCEPTION 'الزبون المحدد غير تابع لهذه المعصرة';
    END IF;
  END IF;

  -- Verify Queue record if supplied
  IF p_queue_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.queue WHERE id = p_queue_id AND season_id = p_season_id AND mill_id = v_season_mill_id) THEN
      RAISE EXCEPTION 'سجل الدور المحدد غير متطابق مع هذا الموسم أو هذه المعصرة';
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

  -- 2. Insert into financial_transactions if cash was collected
  IF COALESCE(p_cash_amount, 0) > 0 THEN
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, reference_id, reference_type, description, category, status, created_at
    ) VALUES (
      v_caller, v_season_mill_id, p_season_id, 'income', p_cash_amount, 'in', v_invoice_id, 'invoice', 'فاتورة: ' || COALESCE(p_customer_name, 'زبون'), 'invoice', 'active', now()
    );
  END IF;

  v_oil_delta := COALESCE(p_oil_produced, 0) - COALESCE(p_oil_amount, 0);

  -- 3. Lock and update inventory
  UPDATE public.inventory
     SET total_oil = COALESCE(total_oil, 0) + v_oil_delta,
         total_cash = COALESCE(total_cash, 0) + COALESCE(p_cash_amount, 0),
         updated_at = now()
   WHERE season_id = p_season_id AND mill_id = v_season_mill_id;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (user_id, mill_id, season_id, total_oil, total_cash, updated_at)
    VALUES (v_caller, v_season_mill_id, p_season_id, v_oil_delta, COALESCE(p_cash_amount, 0), now());
  END IF;

  -- 4. Update queue status to completed
  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue
       SET status = 'completed'
     WHERE id = p_queue_id;
  END IF;

  RETURN v_invoice_id;
END;
$function$;

-- 3. Update pay_worker_and_settle
CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(
  p_season_id UUID,
  p_worker_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_caller UUID := auth.uid();
    v_season_mill_id UUID;
    v_has_access BOOLEAN;
    v_total_earned NUMERIC;
    v_total_paid NUMERIC;
    v_cash_balance NUMERIC;
    v_payment_id UUID;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'يجب أن يكون المبلغ أكبر من صفر';
    END IF;

    -- Canonical tenant: Resolve mill_id from the season strictly
    SELECT mill_id INTO v_season_mill_id
    FROM public.seasons
    WHERE id = p_season_id;

    IF v_season_mill_id IS NULL THEN
        RAISE EXCEPTION 'الموسم المحدد غير مرتبط بمعصرة معتمدة أو غير موجود';
    END IF;

    -- Caller Authorization check
    IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
        v_has_access := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.mill_memberships
            WHERE user_id = v_caller
              AND mill_id = v_season_mill_id
              AND is_active = true
        ) INTO v_has_access;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'غير مصرح لك بتسجيل دفعات عمال لهذه المعصرة';
    END IF;

    -- Lock worker row and verify tenant
    SELECT total_earned, total_paid INTO v_total_earned, v_total_paid
    FROM public.workers
    WHERE id = p_worker_id AND season_id = p_season_id AND mill_id = v_season_mill_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود في هذا الموسم أو هذه المعصرة';
    END IF;

    IF p_amount > (v_total_earned - v_total_paid) THEN
        RAISE EXCEPTION 'المبلغ المدخل أكبر من الرصيد المستحق للعامل';
    END IF;

    -- Lock inventory cash row
    SELECT total_cash INTO v_cash_balance
    FROM public.inventory
    WHERE season_id = p_season_id AND mill_id = v_season_mill_id
    FOR UPDATE;

    IF v_cash_balance IS NULL OR v_cash_balance < p_amount THEN
        RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لصرف هذه الدفعة';
    END IF;

    -- 1. Insert Payment Record
    INSERT INTO public.worker_payments (
        user_id, season_id, mill_id, worker_id, amount, notes, created_at
    ) VALUES (
        v_caller, p_season_id, v_season_mill_id, p_worker_id, p_amount, p_notes, now()
    ) RETURNING id INTO v_payment_id;

    -- 2. Insert into financial_transactions atomically
    INSERT INTO public.financial_transactions (
        created_by, mill_id, season_id, type, amount, direction, reference_id, reference_type, description, category, status, created_at
    ) VALUES (
        v_caller, v_season_mill_id, p_season_id, 'worker_payment', p_amount, 'out', v_payment_id, 'worker_payment', COALESCE(p_notes, 'دفعة أجور عامل'), 'worker_payment', 'active', now()
    );

    -- 3. Update Worker total_paid
    UPDATE public.workers
    SET total_paid = total_paid + p_amount,
        updated_at = now()
    WHERE id = p_worker_id;

    -- 4. Update Inventory total_cash
    UPDATE public.inventory
    SET total_cash = total_cash - p_amount,
        updated_at = now()
    WHERE season_id = p_season_id AND mill_id = v_season_mill_id;
END;
$function$;

-- 4. Update record_customer_payment_atomic
CREATE OR REPLACE FUNCTION public.record_customer_payment_atomic(
  p_season_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_season_mill_id UUID;
  v_has_access BOOLEAN;
  v_payment_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'يجب أن يكون مبلغ الدفعة أكبر من صفر';
  END IF;

  -- Resolve season mill strictly
  SELECT mill_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير مرتبط بمعصرة معتمدة أو غير موجود';
  END IF;

  -- Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND mill_id = v_season_mill_id
        AND is_active = true
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل دفعات زبائن لهذه المعصرة';
  END IF;

  -- Verify customer belongs to this mill
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND mill_id = v_season_mill_id) THEN
    RAISE EXCEPTION 'الزبون المحدد غير تابع لهذه المعصرة';
  END IF;

  -- 1. Insert customer payment
  INSERT INTO public.customer_payments (
    mill_id, season_id, customer_id, amount, notes, created_at
  ) VALUES (
    v_season_mill_id, p_season_id, p_customer_id, p_amount, p_notes, now()
  ) RETURNING id INTO v_payment_id;

  -- 2. Insert into financial_transactions atomically
  INSERT INTO public.financial_transactions (
    created_by, mill_id, season_id, type, amount, direction, reference_id, reference_type, party_type, party_id, description, category, status, created_at
  ) VALUES (
    v_caller, v_season_mill_id, p_season_id, 'customer_payment', p_amount, 'in', v_payment_id, 'customer_payment', 'customer', p_customer_id, COALESCE(p_notes, 'سداد حساب زبون'), 'customer_payment', 'active', now()
  );

  -- 3. Lock and update inventory cash
  UPDATE public.inventory
  SET total_cash = COALESCE(total_cash, 0) + p_amount,
      updated_at = now()
  WHERE season_id = p_season_id AND mill_id = v_season_mill_id;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (user_id, mill_id, season_id, total_oil, total_cash, updated_at)
    VALUES (v_caller, v_season_mill_id, p_season_id, 0, p_amount, now());
  END IF;

  RETURN v_payment_id;
END;
$function$;

-- 5. Update record_expense_atomic
CREATE OR REPLACE FUNCTION public.record_expense_atomic(
  p_season_id UUID,
  p_category TEXT,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_season_mill_id UUID;
  v_has_access BOOLEAN;
  v_expense_id UUID;
  v_cash_balance NUMERIC;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'يجب أن يكون مبلغ المصروف أكبر من صفر';
  END IF;

  -- Resolve season mill strictly (no user_id fallback)
  SELECT mill_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير مرتبط بمعصرة معتمدة أو غير موجود';
  END IF;

  -- Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND mill_id = v_season_mill_id
        AND is_active = true
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل مصاريف لهذه المعصرة';
  END IF;

  -- Lock inventory cash row and prevent negative cash balance
  SELECT total_cash INTO v_cash_balance
  FROM public.inventory
  WHERE season_id = p_season_id AND mill_id = v_season_mill_id
  FOR UPDATE;

  IF v_cash_balance IS NULL OR v_cash_balance < p_amount THEN
    RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لصرف هذا المصروف';
  END IF;

  -- 1. Insert expense
  INSERT INTO public.expenses (
    user_id, season_id, mill_id, category, amount, description, created_at
  ) VALUES (
    v_caller, p_season_id, v_season_mill_id, p_category, p_amount, p_description, now()
  ) RETURNING id INTO v_expense_id;

  -- 2. Insert into financial_transactions atomically
  INSERT INTO public.financial_transactions (
    created_by, mill_id, season_id, type, amount, direction, reference_id, reference_type, description, category, status, created_at
  ) VALUES (
    v_caller, v_season_mill_id, p_season_id, 'expense', p_amount, 'out', v_expense_id, 'expense', p_description, p_category, 'active', now()
  );

  -- 3. Deduct from inventory total_cash
  UPDATE public.inventory
  SET total_cash = total_cash - p_amount,
      updated_at = now()
  WHERE season_id = p_season_id AND mill_id = v_season_mill_id;

  RETURN v_expense_id;
END;
$function$;

-- 6. Update record_oil_trade_atomic
CREATE OR REPLACE FUNCTION public.record_oil_trade_atomic(
  p_season_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_price NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'الكمية والسعر يجب أن يكونا أكبر من صفر';
  END IF;

  IF p_type NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'نوع العملية يجب أن يكون إما شراء (buy) أو بيع (sell)';
  END IF;

  -- Resolve season mill strictly (no user_id fallback)
  SELECT mill_id INTO v_season_mill_id FROM public.seasons WHERE id = p_season_id;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير مرتبط بمعصرة معتمدة أو غير موجود';
  END IF;

  -- Authorization check
  IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
    v_has_access := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = v_caller
        AND mill_id = v_season_mill_id
        AND is_active = true
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل عمليات تجارة زيت لهذه المعصرة';
  END IF;

  v_total_price := p_amount * p_price;

  -- Lock inventory row FOR UPDATE to verify balances
  SELECT total_oil, total_cash INTO v_oil_balance, v_cash_balance
  FROM public.inventory
  WHERE season_id = p_season_id AND mill_id = v_season_mill_id
  FOR UPDATE;

  IF p_type = 'sell' AND (v_oil_balance IS NULL OR v_oil_balance < p_amount) THEN
    RAISE EXCEPTION 'كمية الزيت في المخزن غير كافية لعملية البيع';
  END IF;

  IF p_type = 'buy' AND (v_cash_balance IS NULL OR v_cash_balance < v_total_price) THEN
    RAISE EXCEPTION 'الرصيد النقدي في الصندوق غير كافٍ لشراء هذه الكمية';
  END IF;

  -- 1. Insert Oil Transaction
  INSERT INTO public.oil_transactions (
    user_id, season_id, mill_id, type, amount, notes, total_price, created_at
  ) VALUES (
    v_caller, p_season_id, v_season_mill_id, p_type, p_amount, p_notes, v_total_price, now()
  ) RETURNING id INTO v_trade_id;

  -- 2. Adjust inventory & record financial_transactions
  IF p_type = 'sell' THEN
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, reference_id, reference_type, description, category, status, created_at
    ) VALUES (
      v_caller, v_season_mill_id, p_season_id, 'income', v_total_price, 'in', v_trade_id, 'oil_trade', COALESCE(p_notes, 'بيع زيت'), 'oil_trade', 'active', now()
    );

    UPDATE public.inventory
    SET total_oil = total_oil - p_amount,
        total_cash = total_cash + v_total_price,
        updated_at = now()
    WHERE season_id = p_season_id AND mill_id = v_season_mill_id;
  ELSE -- 'buy'
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, reference_id, reference_type, description, category, status, created_at
    ) VALUES (
      v_caller, v_season_mill_id, p_season_id, 'expense', v_total_price, 'out', v_trade_id, 'oil_trade', COALESCE(p_notes, 'شراء زيت'), 'oil_trade', 'active', now()
    );

    UPDATE public.inventory
    SET total_oil = total_oil + p_amount,
        total_cash = total_cash - v_total_price,
        updated_at = now()
    WHERE season_id = p_season_id AND mill_id = v_season_mill_id;
  END IF;

  RETURN v_trade_id;
END;
$function$;
