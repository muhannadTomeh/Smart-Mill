-- Migration: 20260912040000_unify_product_purchase_and_harden_business_rpcs.sql
-- Goal: 
--   1. Fix record_product_purchase_atomic: drop obsolete/conflicting overloads, support free-typed partner name, update sale price, link payable cleanly.
--   2. Clean up record_expense_v2 duplicate overloads.
--   3. Harden check_user_mill_access and authorization across all business RPCs.
--   4. Ensure robust drawer checks and permissions.

-- 1. DROP OBSOLETE OVERLOADS TO ELIMINATE POSTGREST RESOLUTION ERRORS
DROP FUNCTION IF EXISTS public.record_product_purchase_atomic(uuid, uuid, integer, numeric, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.record_product_purchase_atomic(uuid, uuid, numeric, numeric, text, uuid, uuid, numeric, text);
DROP FUNCTION IF EXISTS public.record_product_purchase_atomic(uuid, uuid, numeric, numeric, text, uuid, uuid, text, numeric, text);

DROP FUNCTION IF EXISTS public.record_expense_v2(uuid, text, numeric, text, text, uuid, uuid);

-- 2. HARDEN TENANT ACCESS CHECK FUNCTION
CREATE OR REPLACE FUNCTION public.check_user_mill_access(p_mill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT (
    auth.uid() = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mill_memberships
      WHERE user_id = auth.uid() AND mill_id = p_mill_id AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.mills
      WHERE id = p_mill_id AND owner_user_id = auth.uid()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_user_mill_access(uuid) TO authenticated, service_role;

-- 3. UNIFIED ATOMIC RPC: record_product_purchase_atomic
CREATE OR REPLACE FUNCTION public.record_product_purchase_atomic(
  p_season_id      uuid,
  p_product_id     uuid,
  p_quantity       numeric,
  p_unit_price     numeric,
  p_payment_method text,
  p_supplier_id    uuid DEFAULT NULL,
  p_partner_id     uuid DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_sale_price     numeric DEFAULT NULL,
  p_partner_name   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_mill_id        uuid;
  v_total_price    numeric;
  v_purchase_id    uuid;
  v_payable_id     uuid := NULL;
  v_session_id     uuid := NULL;
  v_cash_balance   numeric;
  v_product_name   text;
  v_supplier_name  text;
  v_partner_name   text;
  v_resolved_partner_id uuid := p_partner_id;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'يجب أن تكون الكمية أكبر من صفر';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'سعر الشراء غير صالح';
  END IF;

  IF p_payment_method NOT IN ('cash', 'credit', 'partner') THEN
    RAISE EXCEPTION 'طريقة تمويل الشراء غير صالحة';
  END IF;

  v_total_price := p_quantity * p_unit_price;

  -- Resolve mill from season
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id = p_season_id;
  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم غير موجود';
  END IF;

  -- Verify mill access
  IF NOT public.check_user_mill_access(v_mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء مشتريات لهذه المعصرة';
  END IF;

  -- Verify product belongs to mill
  SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id AND mill_id = v_mill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود في هذه المعصرة';
  END IF;

  -- 1. Cash funding
  IF p_payment_method = 'cash' THEN
    SELECT id INTO v_session_id FROM public.cash_sessions WHERE mill_id = v_mill_id AND status = 'open' LIMIT 1;
    IF v_session_id IS NULL AND NOT public.is_platform_admin(v_caller) THEN
      RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل الشراء النقدي.';
    END IF;

    SELECT total_cash INTO v_cash_balance FROM public.inventory WHERE season_id = p_season_id AND mill_id = v_mill_id FOR UPDATE;
    IF v_cash_balance IS NULL OR v_cash_balance < v_total_price THEN
      RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لإتمام عملية الشراء (المتوفر: % شيكل)', COALESCE(v_cash_balance, 0);
    END IF;

    UPDATE public.inventory SET total_cash = total_cash - v_total_price, updated_at = now() WHERE season_id = p_season_id AND mill_id = v_mill_id;

  -- 2. Credit (Due to supplier)
  ELSIF p_payment_method = 'credit' THEN
    IF p_supplier_id IS NOT NULL THEN
      SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = p_supplier_id AND mill_id = v_mill_id;
    END IF;

    INSERT INTO public.payables (
      mill_id, season_id, type, supplier_id, creditor_name, original_amount, paid_amount, remaining_amount, source_type, status, notes, created_by, created_at
    ) VALUES (
      v_mill_id, p_season_id, 'due_to_supplier', p_supplier_id, COALESCE(v_supplier_name, 'مورد بضائع ومواد'), v_total_price, 0, v_total_price, 'purchase', 'unpaid', p_notes, v_caller, now()
    ) RETURNING id INTO v_payable_id;

  -- 3. Partner funding (Free-text partner support)
  ELSIF p_payment_method = 'partner' THEN
    IF v_resolved_partner_id IS NOT NULL THEN
      SELECT name INTO v_partner_name FROM public.partners WHERE id = v_resolved_partner_id AND mill_id = v_mill_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'الشريك المحدد غير موجود';
      END IF;
    ELSIF p_partner_name IS NOT NULL AND trim(p_partner_name) <> '' THEN
      v_partner_name := trim(p_partner_name);
      -- Look up existing partner by name (case-insensitive)
      SELECT id INTO v_resolved_partner_id FROM public.partners WHERE mill_id = v_mill_id AND lower(trim(name)) = lower(v_partner_name) LIMIT 1;
      IF v_resolved_partner_id IS NULL THEN
        INSERT INTO public.partners (mill_id, name, active, created_at)
        VALUES (v_mill_id, v_partner_name, true, now())
        RETURNING id INTO v_resolved_partner_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'يرجى تدوين أو اختيار اسم الشريك الذي دفع قيمة المشتريات';
    END IF;

    -- Create Payable Due to Partner
    INSERT INTO public.payables (
      mill_id, season_id, type, partner_id, creditor_name, original_amount, paid_amount, remaining_amount, source_type, status, notes, created_by, created_at
    ) VALUES (
      v_mill_id, p_season_id, 'due_to_partner', v_resolved_partner_id, v_partner_name, v_total_price, 0, v_total_price, 'purchase', 'unpaid', 'شراء مواد مدفوع من الشريك: ' || v_partner_name, v_caller, now()
    ) RETURNING id INTO v_payable_id;
  END IF;

  -- Insert purchase record
  INSERT INTO public.product_purchases (
    mill_id, season_id, product_id, supplier_id, quantity, unit_price, total_price, payment_method, partner_id, cash_session_id, notes, created_by, created_at
  ) VALUES (
    v_mill_id, p_season_id, p_product_id, p_supplier_id, p_quantity::integer, p_unit_price, v_total_price, p_payment_method, v_resolved_partner_id, v_session_id, p_notes, v_caller, now()
  ) RETURNING id INTO v_purchase_id;

  -- Update payable source_id if payable was created
  IF v_payable_id IS NOT NULL THEN
    UPDATE public.payables SET source_id = v_purchase_id WHERE id = v_payable_id;
  END IF;

  -- Update stock movement (+quantity)
  INSERT INTO public.product_stock_movements (
    mill_id, season_id, product_id, quantity, type, reference_type, reference_id, notes, created_by, created_at
  ) VALUES (
    v_mill_id, p_season_id, p_product_id, p_quantity::integer, 'purchase', 'product_purchases', v_purchase_id, p_notes, v_caller, now()
  );

  -- Update products.current_stock & prices
  UPDATE public.products
  SET current_stock = current_stock + p_quantity::integer,
      default_purchase_price = CASE WHEN p_unit_price > 0 THEN p_unit_price ELSE default_purchase_price END,
      default_sale_price = CASE WHEN p_sale_price IS NOT NULL AND p_sale_price > 0 THEN p_sale_price ELSE default_sale_price END,
      updated_at = now()
  WHERE id = p_product_id;

  -- Record Financial Transaction
  INSERT INTO public.financial_transactions (
    created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, party_type, party_id, party_name, description, category, status, cash_session_id, created_at
  ) VALUES (
    v_caller, v_mill_id, p_season_id, 'stock_purchase'::financial_tx_type, v_total_price, 
    CASE WHEN p_payment_method = 'cash' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,
    CASE WHEN p_payment_method = 'cash' THEN 'cash'::financial_payment_method ELSE 'credit'::financial_payment_method END,
    v_purchase_id, 'product_purchase', 
    CASE WHEN p_payment_method = 'partner' THEN 'partner' ELSE 'supplier' END,
    COALESCE(v_resolved_partner_id, p_supplier_id),
    COALESCE(v_partner_name, v_supplier_name),
    'شراء بضاعة: ' || v_product_name || ' (كمية: ' || p_quantity || ')',
    'stock_purchase', 'active'::financial_tx_status, v_session_id, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'payable_id', v_payable_id,
    'total_price', v_total_price,
    'quantity', p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_product_purchase_atomic(uuid, uuid, numeric, numeric, text, uuid, uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_purchase_atomic(uuid, uuid, numeric, numeric, text, uuid, uuid, text, numeric, text) TO authenticated, service_role;

-- 4. HARDEN pay_worker_and_settle mill access check
CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(
  p_user_id uuid,
  p_season_id uuid,
  p_worker_id uuid,
  p_amount numeric,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_season_mill_id UUID;
  v_total_earned NUMERIC;
  v_total_paid NUMERIC;
  v_cash_balance NUMERIC;
  v_payment_id UUID;
  v_session_id UUID;
  v_worker_name TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'يجب أن يكون المبلغ أكبر من صفر';
  END IF;

  -- Resolve mill_id from the season strictly
  SELECT mill_id INTO v_season_mill_id
  FROM public.seasons
  WHERE id = p_season_id;

  IF v_season_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير مرتبط بمعصرة معتمدة أو غير موجود';
  END IF;

  -- Caller Authorization check via unified helper
  IF NOT public.check_user_mill_access(v_season_mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل دفعات عمال لهذه المعصرة';
  END IF;

  -- Verify active cash session
  SELECT id INTO v_session_id
  FROM public.cash_sessions
  WHERE mill_id = v_season_mill_id AND status = 'open'
  LIMIT 1;

  IF v_session_id IS NULL AND NOT public.is_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل صرف أي دفعة نقدية.';
  END IF;

  -- Lock worker row and verify tenant
  SELECT name, total_earned, total_paid INTO v_worker_name, v_total_earned, v_total_paid
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
    user_id, season_id, mill_id, worker_id, amount, notes, cash_session_id, created_at
  ) VALUES (
    v_caller, p_season_id, v_season_mill_id, p_worker_id, p_amount, p_notes, v_session_id, now()
  ) RETURNING id INTO v_payment_id;

  -- 2. Insert into financial_transactions atomically
  INSERT INTO public.financial_transactions (
    created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, party_type, party_id, party_name, description, category, status, cash_session_id, created_at
  ) VALUES (
    v_caller, v_season_mill_id, p_season_id, 'worker_payment'::financial_tx_type, p_amount, 'out'::financial_direction, 'cash'::financial_payment_method, v_payment_id, 'worker_payment', 'worker', p_worker_id, v_worker_name, COALESCE(p_notes, 'دفعة أجور للعامل: ' || v_worker_name), 'worker_payment', 'active'::financial_tx_status, v_session_id, now()
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

GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- 5. HARDEN record_customer_payment_atomic mill access check
CREATE OR REPLACE FUNCTION public.record_customer_payment_atomic(
  p_season_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_season_mill_id UUID;
  v_payment_id UUID;
  v_session_id UUID;
  v_customer_name TEXT;
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

  -- Authorization check via unified helper
  IF NOT public.check_user_mill_access(v_season_mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل دفعات زبائن لهذه المعصرة';
  END IF;

  -- Verify customer belongs to this mill
  SELECT name INTO v_customer_name FROM public.customers WHERE id = p_customer_id AND mill_id = v_season_mill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الزبون المحدد غير تابع لهذه المعصرة';
  END IF;

  -- Verify active cash session
  SELECT id INTO v_session_id
  FROM public.cash_sessions
  WHERE mill_id = v_season_mill_id AND status = 'open'
  LIMIT 1;

  IF v_session_id IS NULL AND NOT public.is_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل تسجيل أي دفعة نقدية.';
  END IF;

  -- 1. Insert customer payment
  INSERT INTO public.customer_payments (
    mill_id, season_id, customer_id, amount, payment_method, notes, created_by, cash_session_id, created_at
  ) VALUES (
    v_season_mill_id, p_season_id, p_customer_id, p_amount, 'cash', p_notes, v_caller, v_session_id, now()
  ) RETURNING id INTO v_payment_id;

  -- 2. Insert into financial_transactions atomically
  INSERT INTO public.financial_transactions (
    created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, party_type, party_id, party_name, description, category, status, cash_session_id, created_at
  ) VALUES (
    v_caller, v_season_mill_id, p_season_id, 'customer_payment'::financial_tx_type, p_amount, 'in'::financial_direction, 'cash'::financial_payment_method, v_payment_id, 'customer_payment', 'customer', p_customer_id, v_customer_name, COALESCE(p_notes, 'سداد حساب للزبون: ' || v_customer_name), 'customer_payment', 'active'::financial_tx_status, v_session_id, now()
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

GRANT EXECUTE ON FUNCTION public.record_customer_payment_atomic(uuid, uuid, numeric, text) TO authenticated, service_role;

-- 6. ENSURE GRANTS FOR ALL CORE BUSINESS RPCS
GRANT EXECUTE ON FUNCTION public.record_expense_v2(uuid, text, numeric, text, text, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_payable_atomic(uuid, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_partner_transaction_atomic(uuid, uuid, text, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_oil_transaction_atomic(uuid, text, numeric, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_worker_session(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_cash_session() TO authenticated, service_role;
