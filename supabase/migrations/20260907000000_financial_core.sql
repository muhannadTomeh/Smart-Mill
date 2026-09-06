-- ============================================================
-- MIGRATION: 20260907000000_financial_core.sql
-- SMART OLIVE MILL: UNIFIED FINANCIAL CORE ARCHITECTURE
-- ============================================================

-- 1. Helper function to resolve tenant mill ownership cleanly
CREATE OR REPLACE FUNCTION public.get_user_mill_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_mill_id uuid;
  v_membership_mill_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Check parent_mill_id in profiles
  SELECT parent_mill_id INTO v_parent_mill_id
  FROM public.profiles
  WHERE user_id = _user_id;

  IF v_parent_mill_id IS NOT NULL THEN
    RETURN v_parent_mill_id;
  END IF;

  -- 2. Check mill_memberships if exists
  BEGIN
    SELECT m.owner_user_id INTO v_membership_mill_id
    FROM public.mill_memberships mm
    JOIN public.mills m ON mm.mill_id = m.id
    WHERE mm.user_id = _user_id AND mm.role = 'mill_employee'
    LIMIT 1;

    IF v_membership_mill_id IS NOT NULL THEN
      RETURN v_membership_mill_id;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- Table does not exist, ignore
  END;

  -- 3. Default: the user is the mill owner
  RETURN _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_mill_id(uuid) TO authenticated, service_role, anon;


-- 2. ENUMS FOR FINANCIAL CORE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_tx_type') THEN
    CREATE TYPE public.financial_tx_type AS ENUM (
      'income',             -- إيرادات خدمات عصر أو تنكات
      'expense',            -- مصاريف تشغيلية
      'stock_purchase',     -- شراء مخزون زيت
      'stock_sale',         -- بيع مخزون زيت
      'worker_payment',     -- دفع أجور وسلف عمال
      'customer_debt',      -- تسجيل دين / ذمة على زبون
      'customer_payment',   -- سداد زبون لدين سابق
      'supplier_payment',   -- دفعات للموردين
      'owner_deposit',      -- إيداع نقدي من المالك
      'owner_withdrawal',   -- مسحوبات المالك الشخصية
      'adjustment'          -- تسوية رصيد الصندوق
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_direction') THEN
    CREATE TYPE public.financial_direction AS ENUM ('in', 'out', 'none');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_payment_method') THEN
    CREATE TYPE public.financial_payment_method AS ENUM ('cash', 'oil', 'mixed', 'credit');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_tx_status') THEN
    CREATE TYPE public.financial_tx_status AS ENUM ('active', 'voided');
  END IF;
END $$;


-- 3. TABLE: financial_transactions
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id UUID NOT NULL,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  type public.financial_tx_type NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  direction public.financial_direction NOT NULL,
  payment_method public.financial_payment_method NOT NULL DEFAULT 'cash',
  reference_type TEXT NOT NULL, -- 'invoice', 'expense', 'oil_transaction', 'worker_payment', 'customer_payment', 'daily_closing', 'manual'
  reference_id UUID,
  party_type TEXT,              -- 'customer', 'worker', 'supplier', 'owner', 'other'
  party_id UUID,
  party_name TEXT,
  description TEXT,
  status public.financial_tx_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  void_reason TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fin_tx_mill_season ON public.financial_transactions(mill_id, season_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_created_at ON public.financial_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_fin_tx_ref ON public.financial_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_party ON public.financial_transactions(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_type_status ON public.financial_transactions(type, status);


-- 4. TABLE: daily_closings (Database-first)
CREATE TABLE IF NOT EXISTS public.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id UUID NOT NULL,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  closing_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  cashier_name TEXT NOT NULL,
  opening_cash NUMERIC NOT NULL DEFAULT 0,
  total_cash_in NUMERIC NOT NULL DEFAULT 0,
  total_cash_out NUMERIC NOT NULL DEFAULT 0,
  expected_cash NUMERIC NOT NULL DEFAULT 0,
  actual_cash NUMERIC NOT NULL DEFAULT 0,
  difference NUMERIC NOT NULL DEFAULT 0,
  invoices_cash NUMERIC DEFAULT 0,
  invoices_count INTEGER DEFAULT 0,
  oil_sales_cash NUMERIC DEFAULT 0,
  expenses_cash NUMERIC DEFAULT 0,
  oil_purchases_cash NUMERIC DEFAULT 0,
  worker_payments_cash NUMERIC DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_closings_mill_season ON public.daily_closings(mill_id, season_id);
CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON public.daily_closings(closing_date);


-- 5. TABLE: customer_payments (Debt settlements)
CREATE TABLE IF NOT EXISTS public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id UUID NOT NULL,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_cust ON public.customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_mill_season ON public.customer_payments(mill_id, season_id);


-- 6. ALTER INVOICES TO SUPPORT DEBT / UNPAID BALANCES IF NEEDED
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'unpaid_amount'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN unpaid_amount NUMERIC DEFAULT 0;
  END IF;
END $$;


-- ============================================================
-- 7. ATOMIC RPC FUNCTIONS (The Financial Engine)
-- ============================================================

-- Clean up any existing overloaded function signatures to prevent 42725 ambiguity
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname IN (
        'create_invoice_and_settle', 
        'pay_worker_and_settle', 
        'record_expense_atomic', 
        'record_oil_trade_atomic', 
        'record_customer_payment_atomic', 
        'void_financial_transaction'
      )
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
  END LOOP;
END $$;


-- Function A: Atomic Expense Creation & Cash Deduction
CREATE OR REPLACE FUNCTION public.record_expense_atomic(
  p_season_id UUID,
  p_category TEXT,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mill_id UUID;
  v_expense_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ المصروف يجب أن يكون أكبر من صفر';
  END IF;

  v_mill_id := COALESCE(p_target_user_id, public.get_user_mill_id(auth.uid()));

  -- 1. Insert into expenses
  INSERT INTO public.expenses (
    user_id, season_id, category, amount, description
  ) VALUES (
    v_mill_id, p_season_id, p_category, p_amount, p_description
  )
  RETURNING id INTO v_expense_id;

  -- 2. Insert into financial_transactions
  INSERT INTO public.financial_transactions (
    mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, description, created_by
  ) VALUES (
    v_mill_id, p_season_id, 'expense', p_category, p_amount, 'out', 'cash',
    'expense', v_expense_id, p_description, auth.uid()
  );

  -- 3. Update inventory cash
  INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
  VALUES (v_mill_id, p_season_id, 0, -p_amount)
  ON CONFLICT (user_id, season_id)
  DO UPDATE SET
    total_cash = public.inventory.total_cash - p_amount,
    updated_at = now();

  RETURN v_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_expense_atomic(UUID, TEXT, NUMERIC, TEXT, UUID) TO authenticated, service_role;


-- Function B: Atomic Oil Trade (Buy / Sell)
CREATE OR REPLACE FUNCTION public.record_oil_trade_atomic(
  p_season_id UUID,
  p_type TEXT, -- 'buy' or 'sell'
  p_amount NUMERIC,
  p_price NUMERIC,
  p_party_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mill_id UUID;
  v_total_price NUMERIC;
  v_tx_id UUID;
BEGIN
  IF p_amount <= 0 OR p_price <= 0 THEN
    RAISE EXCEPTION 'الكمية والسعر يجب أن يكونا أكبر من صفر';
  END IF;

  v_mill_id := COALESCE(p_target_user_id, public.get_user_mill_id(auth.uid()));
  v_total_price := p_amount * p_price;

  -- 1. Insert into oil_transactions
  INSERT INTO public.oil_transactions (
    user_id, season_id, type, amount, price, total_price, party_name, notes
  ) VALUES (
    v_mill_id, p_season_id, p_type, p_amount, p_price, v_total_price, p_party_name, p_notes
  )
  RETURNING id INTO v_tx_id;

  -- 2. Insert into financial_transactions and update inventory
  IF p_type = 'buy' THEN
    -- Stock purchase: cash decreases, oil inventory increases
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'stock_purchase', 'oil_inventory', v_total_price, 'out', 'cash',
      'oil_transaction', v_tx_id, 'supplier', p_party_name, p_notes, auth.uid()
    );

    INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
    VALUES (v_mill_id, p_season_id, p_amount, -v_total_price)
    ON CONFLICT (user_id, season_id)
    DO UPDATE SET
      total_oil = public.inventory.total_oil + p_amount,
      total_cash = public.inventory.total_cash - v_total_price,
      updated_at = now();

  ELSE
    -- Stock sale: cash increases, oil inventory decreases
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'stock_sale', 'oil_inventory', v_total_price, 'in', 'cash',
      'oil_transaction', v_tx_id, 'customer', p_party_name, p_notes, auth.uid()
    );

    INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
    VALUES (v_mill_id, p_season_id, -p_amount, v_total_price)
    ON CONFLICT (user_id, season_id)
    DO UPDATE SET
      total_oil = public.inventory.total_oil - p_amount,
      total_cash = public.inventory.total_cash + v_total_price,
      updated_at = now();
  END IF;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_oil_trade_atomic(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID) TO authenticated, service_role;


-- Function C: Enhanced Atomic Invoice & Settlement (Multi-Tenant + Financial Transaction)
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
  p_queue_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_mill_id uuid;
  v_pay_method public.financial_payment_method;
BEGIN
  -- Determine the authoritative mill owner id
  v_mill_id := COALESCE(p_target_user_id, public.get_user_mill_id(auth.uid()));

  -- Map payment method enum
  IF p_payment_type = 'oil' THEN
    v_pay_method := 'oil';
  ELSIF p_payment_type = 'mixed' THEN
    v_pay_method := 'mixed';
  ELSIF p_payment_type = 'credit' THEN
    v_pay_method := 'credit';
  ELSE
    v_pay_method := 'cash';
  END IF;

  -- 1. Insert invoice
  INSERT INTO public.invoices (
    user_id, customer_id, customer_name, oil_produced,
    container_count, container_type, payment_type,
    oil_amount, cash_amount, total_display, season_id
  ) VALUES (
    v_mill_id, p_customer_id, p_customer_name, p_oil_produced,
    p_container_count, p_container_type, p_payment_type,
    p_oil_amount, p_cash_amount, p_total_display, p_season_id
  )
  RETURNING id INTO v_invoice_id;

  -- 2. Record Financial Transaction for Cash Revenue if any cash collected
  IF p_cash_amount > 0 THEN
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_id, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'income', 'pressing_revenue', p_cash_amount, 'in', v_pay_method,
      'invoice', v_invoice_id, 'customer', p_customer_id, p_customer_name, 'فاتورة عصر وزيت #' || v_invoice_id, auth.uid()
    );
  END IF;

  -- 3. Update queue status if provided
  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue
    SET status = 'done'
    WHERE id = p_queue_id AND (user_id = v_mill_id OR user_id = auth.uid());
  END IF;

  -- 4. Update inventory snapshot
  INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
  VALUES (v_mill_id, p_season_id, p_oil_amount, p_cash_amount)
  ON CONFLICT (user_id, season_id)
  DO UPDATE SET
    total_oil = public.inventory.total_oil + p_oil_amount,
    total_cash = public.inventory.total_cash + p_cash_amount,
    updated_at = now();

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(UUID, TEXT, NUMERIC, INTEGER, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, UUID, UUID) TO authenticated, service_role;


-- Function D: Enhanced Worker Payment & Settle with Financial Transaction
CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(
    p_user_id UUID,
    p_season_id UUID,
    p_worker_id UUID,
    p_amount NUMERIC,
    p_notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mill_id UUID;
    v_worker_name TEXT;
    v_payment_id UUID;
BEGIN
    IF p_amount <= 0 THEN
      RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
    END IF;

    v_mill_id := COALESCE(p_user_id, public.get_user_mill_id(auth.uid()));

    SELECT name INTO v_worker_name
    FROM public.workers
    WHERE id = p_worker_id AND (user_id = v_mill_id OR user_id = auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود';
    END IF;

    -- 1. Insert payment record
    INSERT INTO public.worker_payments (user_id, season_id, worker_id, amount, notes)
    VALUES (v_mill_id, p_season_id, p_worker_id, p_amount, p_notes)
    RETURNING id INTO v_payment_id;

    -- 2. Insert into financial_transactions
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_id, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'worker_payment', 'wages', p_amount, 'out', 'cash',
      'worker_payment', v_payment_id, 'worker', p_worker_id, v_worker_name, p_notes, auth.uid()
    );

    -- 3. Update worker total_paid
    UPDATE public.workers
    SET total_paid = total_paid + p_amount
    WHERE id = p_worker_id;

    -- 4. Update inventory total_cash
    INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
    VALUES (v_mill_id, p_season_id, 0, -p_amount)
    ON CONFLICT (user_id, season_id)
    DO UPDATE SET
      total_cash = public.inventory.total_cash - p_amount,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(UUID, UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;


-- Function E: Atomic Customer Payment (Debt Collection)
CREATE OR REPLACE FUNCTION public.record_customer_payment_atomic(
  p_season_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mill_id UUID;
  v_customer_name TEXT;
  v_payment_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ المسدد يجب أن يكون أكبر من صفر';
  END IF;

  v_mill_id := COALESCE(p_target_user_id, public.get_user_mill_id(auth.uid()));

  SELECT name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND (user_id = v_mill_id OR user_id = auth.uid());

  -- 1. Insert customer payment
  INSERT INTO public.customer_payments (
    mill_id, season_id, customer_id, amount, payment_method, notes, created_by
  ) VALUES (
    v_mill_id, p_season_id, p_customer_id, p_amount, 'cash', p_notes, auth.uid()
  )
  RETURNING id INTO v_payment_id;

  -- 2. Insert into financial_transactions
  INSERT INTO public.financial_transactions (
    mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, party_type, party_id, party_name, description, created_by
  ) VALUES (
    v_mill_id, p_season_id, 'customer_payment', 'debt_settlement', p_amount, 'in', 'cash',
    'customer_payment', v_payment_id, 'customer', p_customer_id, v_customer_name, p_notes, auth.uid()
  );

  -- 3. Update inventory cash
  INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
  VALUES (v_mill_id, p_season_id, 0, p_amount)
  ON CONFLICT (user_id, season_id)
  DO UPDATE SET
    total_cash = public.inventory.total_cash + p_amount,
    updated_at = now();

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_customer_payment_atomic(UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;


-- Function F: Safe Voiding of Financial Transactions (Audit Trail)
CREATE OR REPLACE FUNCTION public.void_financial_transaction(
  p_transaction_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
BEGIN
  SELECT * INTO v_tx
  FROM public.financial_transactions
  WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحركة المالية غير موجودة';
  END IF;

  IF v_tx.status = 'voided' THEN
    RAISE EXCEPTION 'هذه الحركة تم إلغاؤها مسبقاً';
  END IF;

  -- 1. Mark as voided
  UPDATE public.financial_transactions
  SET status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = p_reason
  WHERE id = p_transaction_id;

  -- 2. Reverse inventory cash balance if direction was in or out
  IF v_tx.direction = 'in' THEN
    UPDATE public.inventory
    SET total_cash = total_cash - v_tx.amount,
        updated_at = now()
    WHERE user_id = v_tx.mill_id AND season_id = v_tx.season_id;
  ELSIF v_tx.direction = 'out' THEN
    UPDATE public.inventory
    SET total_cash = total_cash + v_tx.amount,
        updated_at = now()
    WHERE user_id = v_tx.mill_id AND season_id = v_tx.season_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_financial_transaction(UUID, TEXT) TO authenticated, service_role;


-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS) FOR NEW FINANCIAL TABLES
-- ============================================================

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

-- financial_transactions policy
DROP POLICY IF EXISTS "Users view own mill financial_transactions" ON public.financial_transactions;
CREATE POLICY "Users view own mill financial_transactions"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (mill_id = public.get_user_mill_id(auth.uid()) OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Users insert own mill financial_transactions" ON public.financial_transactions;
CREATE POLICY "Users insert own mill financial_transactions"
  ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (mill_id = public.get_user_mill_id(auth.uid()) OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Admins manage all financial_transactions" ON public.financial_transactions;
CREATE POLICY "Admins manage all financial_transactions"
  ON public.financial_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- daily_closings policy
DROP POLICY IF EXISTS "Users view own mill daily_closings" ON public.daily_closings;
CREATE POLICY "Users view own mill daily_closings"
  ON public.daily_closings FOR SELECT TO authenticated
  USING (mill_id = public.get_user_mill_id(auth.uid()) OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Users insert own mill daily_closings" ON public.daily_closings;
CREATE POLICY "Users insert own mill daily_closings"
  ON public.daily_closings FOR INSERT TO authenticated
  WITH CHECK (mill_id = public.get_user_mill_id(auth.uid()) OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Admins manage all daily_closings" ON public.daily_closings;
CREATE POLICY "Admins manage all daily_closings"
  ON public.daily_closings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- customer_payments policy
DROP POLICY IF EXISTS "Users view own mill customer_payments" ON public.customer_payments;
CREATE POLICY "Users view own mill customer_payments"
  ON public.customer_payments FOR SELECT TO authenticated
  USING (mill_id = public.get_user_mill_id(auth.uid()) OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Users insert own mill customer_payments" ON public.customer_payments;
CREATE POLICY "Users insert own mill customer_payments"
  ON public.customer_payments FOR INSERT TO authenticated
  WITH CHECK (mill_id = public.get_user_mill_id(auth.uid()) OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Admins manage all customer_payments" ON public.customer_payments;
CREATE POLICY "Admins manage all customer_payments"
  ON public.customer_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_closings TO authenticated;
GRANT ALL ON public.daily_closings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;


-- ============================================================
-- 9. BACKFILL EXISTING DATA INTO financial_transactions
-- ============================================================

-- Backfill Invoices
INSERT INTO public.financial_transactions (
  mill_id, season_id, type, category, amount, direction, payment_method,
  reference_type, reference_id, party_type, party_id, party_name, description, created_at, status
)
SELECT
  i.user_id,
  i.season_id,
  'income'::public.financial_tx_type,
  'pressing_revenue',
  i.cash_amount,
  'in'::public.financial_direction,
  (CASE WHEN i.payment_type = 'mixed' THEN 'mixed' ELSE 'cash' END)::public.financial_payment_method,
  'invoice',
  i.id,
  'customer',
  i.customer_id,
  i.customer_name,
  'فاتورة تاريخية #' || i.id,
  i.created_at,
  'active'::public.financial_tx_status
FROM public.invoices i
WHERE i.cash_amount > 0
  AND i.season_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions ft 
    WHERE ft.reference_type = 'invoice' AND ft.reference_id = i.id
  );

-- Backfill Expenses
INSERT INTO public.financial_transactions (
  mill_id, season_id, type, category, amount, direction, payment_method,
  reference_type, reference_id, description, created_at, status
)
SELECT
  e.user_id,
  e.season_id,
  'expense'::public.financial_tx_type,
  e.category,
  e.amount,
  'out'::public.financial_direction,
  'cash'::public.financial_payment_method,
  'expense',
  e.id,
  e.description,
  e.created_at,
  'active'::public.financial_tx_status
FROM public.expenses e
WHERE e.season_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions ft 
    WHERE ft.reference_type = 'expense' AND ft.reference_id = e.id
  );

-- Backfill Oil Transactions
INSERT INTO public.financial_transactions (
  mill_id, season_id, type, category, amount, direction, payment_method,
  reference_type, reference_id, party_type, party_name, description, created_at, status
)
SELECT
  ot.user_id,
  ot.season_id,
  (CASE WHEN ot.type = 'buy' THEN 'stock_purchase' ELSE 'stock_sale' END)::public.financial_tx_type,
  'oil_inventory',
  ot.total_price,
  (CASE WHEN ot.type = 'buy' THEN 'out' ELSE 'in' END)::public.financial_direction,
  'cash'::public.financial_payment_method,
  'oil_transaction',
  ot.id,
  (CASE WHEN ot.type = 'buy' THEN 'supplier' ELSE 'customer' END),
  ot.party_name,
  ot.notes,
  ot.created_at,
  'active'::public.financial_tx_status
FROM public.oil_transactions ot
WHERE ot.season_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions ft 
    WHERE ft.reference_type = 'oil_transaction' AND ft.reference_id = ot.id
  );

-- Backfill Worker Payments
INSERT INTO public.financial_transactions (
  mill_id, season_id, type, category, amount, direction, payment_method,
  reference_type, reference_id, party_type, party_id, party_name, description, created_at, status
)
SELECT
  wp.user_id,
  wp.season_id,
  'worker_payment'::public.financial_tx_type,
  'wages',
  wp.amount,
  'out'::public.financial_direction,
  'cash'::public.financial_payment_method,
  'worker_payment',
  wp.id,
  'worker',
  wp.worker_id,
  w.name,
  wp.notes,
  wp.created_at,
  'active'::public.financial_tx_status
FROM public.worker_payments wp
LEFT JOIN public.workers w ON wp.worker_id = w.id
WHERE wp.season_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions ft 
    WHERE ft.reference_type = 'worker_payment' AND ft.reference_id = wp.id
  );
