-- Migration: 20260912030000_financial_core_and_business_modules.sql
-- Goal: Connect and harden Financial Core with Business Modules (Partners, Suppliers, Payables, Products, Purchases, Stock, Expenses)
-- Non-destructive: Does NOT drop any existing tables, columns, or data.

-- 1. TABLE: suppliers (Real isolated suppliers per mill)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_mill_id ON public.suppliers(mill_id);

-- 2. TABLE: partners (Real partners / shareholders per mill)
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  share_percent numeric DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partners_mill_id ON public.partners(mill_id);

-- 3. TABLE: products (Operational items: plastic containers, metal cans, nylon bags, etc.)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  unit text NOT NULL DEFAULT 'قطعة',
  default_purchase_price numeric NOT NULL DEFAULT 0,
  default_sale_price numeric NOT NULL DEFAULT 0,
  current_stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_mill_id ON public.products(mill_id);

-- 4. TABLE: payables (Amounts due to partners, suppliers, or other creditors)
CREATE TABLE IF NOT EXISTS public.payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('due_to_partner', 'due_to_supplier', 'other')),
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  creditor_name text NOT NULL,
  original_amount numeric NOT NULL CHECK (original_amount > 0),
  paid_amount numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount numeric NOT NULL CHECK (remaining_amount >= 0),
  source_type text NOT NULL CHECK (source_type IN ('expense', 'purchase', 'partner_deposit', 'manual')),
  source_id uuid,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payables_mill_id ON public.payables(mill_id);
CREATE INDEX IF NOT EXISTS idx_payables_status ON public.payables(status);

-- 5. TABLE: product_purchases (Stock purchase records)
CREATE TABLE IF NOT EXISTS public.product_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'credit', 'partner')),
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_purchases_mill ON public.product_purchases(mill_id);

-- 6. TABLE: product_stock_movements (Stock IN / OUT ledger)
CREATE TABLE IF NOT EXISTS public.product_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL, -- positive for IN, negative for OUT
  type text NOT NULL CHECK (type IN ('purchase', 'sale', 'adjustment', 'initial')),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_stock_mov_prod ON public.product_stock_movements(product_id);

-- 7. Add columns to expenses safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'payment_method') THEN
    ALTER TABLE public.expenses ADD COLUMN payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash', 'credit', 'partner'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'partner_id') THEN
    ALTER TABLE public.expenses ADD COLUMN partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'supplier_id') THEN
    ALTER TABLE public.expenses ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'payable_id') THEN
    ALTER TABLE public.expenses ADD COLUMN payable_id uuid REFERENCES public.payables(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 8. Seed initial products from existing container_types (safe compatibility)
INSERT INTO public.products (mill_id, name, default_sale_price, current_stock, active)
SELECT DISTINCT ct.mill_id, ct.name, COALESCE(ct.price, 0), 100, true
FROM public.container_types ct
WHERE ct.mill_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.products p 
    WHERE p.mill_id = ct.mill_id AND p.name = ct.name
  );

-- 9. Enable RLS on new tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock_movements ENABLE ROW LEVEL SECURITY;

-- Helper function for tenant membership check
CREATE OR REPLACE FUNCTION public.check_user_mill_access(p_mill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mill_memberships
    WHERE user_id = auth.uid() AND mill_id = p_mill_id AND is_active = true
  ) OR public.is_platform_admin(auth.uid());
$$;

-- Policies for suppliers
DROP POLICY IF EXISTS suppliers_mill_access ON public.suppliers;
CREATE POLICY suppliers_mill_access ON public.suppliers
  FOR ALL TO authenticated
  USING (public.check_user_mill_access(mill_id))
  WITH CHECK (public.check_user_mill_access(mill_id));

-- Policies for partners
DROP POLICY IF EXISTS partners_mill_access ON public.partners;
CREATE POLICY partners_mill_access ON public.partners
  FOR ALL TO authenticated
  USING (public.check_user_mill_access(mill_id))
  WITH CHECK (public.check_user_mill_access(mill_id));

-- Policies for products
DROP POLICY IF EXISTS products_mill_access ON public.products;
CREATE POLICY products_mill_access ON public.products
  FOR ALL TO authenticated
  USING (public.check_user_mill_access(mill_id))
  WITH CHECK (public.check_user_mill_access(mill_id));

-- Policies for payables
DROP POLICY IF EXISTS payables_mill_access ON public.payables;
CREATE POLICY payables_mill_access ON public.payables
  FOR ALL TO authenticated
  USING (public.check_user_mill_access(mill_id))
  WITH CHECK (public.check_user_mill_access(mill_id));

-- Policies for product_purchases
DROP POLICY IF EXISTS product_purchases_mill_access ON public.product_purchases;
CREATE POLICY product_purchases_mill_access ON public.product_purchases
  FOR ALL TO authenticated
  USING (public.check_user_mill_access(mill_id))
  WITH CHECK (public.check_user_mill_access(mill_id));

-- Policies for product_stock_movements
DROP POLICY IF EXISTS product_stock_movements_mill_access ON public.product_stock_movements;
CREATE POLICY product_stock_movements_mill_access ON public.product_stock_movements
  FOR ALL TO authenticated
  USING (public.check_user_mill_access(mill_id))
  WITH CHECK (public.check_user_mill_access(mill_id));


-- 10. ATOMIC RPC: record_expense_v2
-- Supports 3 payment methods:
--   1. 'cash': checks open cash drawer, stamps cash_session_id, deducts inventory cash.
--   2. 'credit': deferred debt, creates payable record, does NOT touch cash.
--   3. 'partner': paid from partner personal funds, creates payable due to partner, marks expense paid, does NOT touch cash.
CREATE OR REPLACE FUNCTION public.record_expense_v2(
  p_season_id      uuid,
  p_category       text,
  p_amount         numeric,
  p_description    text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_partner_id     uuid DEFAULT NULL,
  p_supplier_id    uuid DEFAULT NULL,
  p_partner_name   text DEFAULT NULL,
  p_creditor_name  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_mill_id        uuid;
  v_expense_id     uuid;
  v_payable_id     uuid := NULL;
  v_session_id     uuid := NULL;
  v_cash_balance   numeric;
  v_partner_name   text;
  v_supplier_name  text;
  v_creditor_name  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'يجب أن يكون مبلغ المصروف أكبر من صفر';
  END IF;

  IF p_payment_method NOT IN ('cash', 'credit', 'partner') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  -- Resolve mill from season
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id = p_season_id;
  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم المحدد غير موجود';
  END IF;

  -- Verify access (Platform Admin OR Owner/Employee)
  IF NOT public.is_platform_admin(v_caller) AND NOT public.check_user_mill_access(v_mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل مصاريف لهذه المعصرة';
  END IF;

  -- Method 1: Cash
  IF p_payment_method = 'cash' THEN
    -- Must have an active open cash session
    SELECT id INTO v_session_id
    FROM public.cash_sessions
    WHERE mill_id = v_mill_id AND status = 'open'
    LIMIT 1;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل تسجيل أي مصروف نقدي.';
    END IF;

    -- Verify inventory cash
    SELECT total_cash INTO v_cash_balance
    FROM public.inventory
    WHERE season_id = p_season_id AND mill_id = v_mill_id
    FOR UPDATE;

    IF v_cash_balance IS NULL OR v_cash_balance < p_amount THEN
      RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لإتمام العملية (الرصيد المتوفر: % شيكل)', COALESCE(v_cash_balance, 0);
    END IF;

    -- Insert expense
    INSERT INTO public.expenses (
      user_id, season_id, mill_id, category, amount, description, payment_method, cash_session_id, created_at
    ) VALUES (
      v_caller, p_season_id, v_mill_id, p_category, p_amount, p_description, 'cash', v_session_id, now()
    ) RETURNING id INTO v_expense_id;

    -- Record financial transaction
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, description, category, status, cash_session_id, created_at
    ) VALUES (
      v_caller, v_mill_id, p_season_id, 'expense', p_amount, 'out'::financial_direction, 'cash'::financial_payment_method, v_expense_id, 'expense', p_description, p_category, 'active'::financial_tx_status, v_session_id, now()
    );

    -- Deduct from inventory total_cash
    UPDATE public.inventory
    SET total_cash = total_cash - p_amount,
        updated_at = now()
    WHERE season_id = p_season_id AND mill_id = v_mill_id;

  -- Method 2: Credit (Deferred debt)
  ELSIF p_payment_method = 'credit' THEN
    IF p_supplier_id IS NOT NULL THEN
      SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = p_supplier_id AND mill_id = v_mill_id;
      v_creditor_name := COALESCE(v_supplier_name, 'مورد معتمد');
    ELSIF p_creditor_name IS NOT NULL AND trim(p_creditor_name) <> '' THEN
      v_creditor_name := trim(p_creditor_name);
    ELSIF p_partner_name IS NOT NULL AND trim(p_partner_name) <> '' THEN
      v_creditor_name := trim(p_partner_name);
    ELSE
      v_creditor_name := COALESCE(p_description, 'دائن مصروف مؤجل');
    END IF;

    -- Create Payable
    INSERT INTO public.payables (
      mill_id, season_id, type, supplier_id, creditor_name, original_amount, paid_amount, remaining_amount, source_type, status, notes, created_by, created_at
    ) VALUES (
      v_mill_id, p_season_id, 'due_to_supplier', p_supplier_id, v_creditor_name, p_amount, 0, p_amount, 'expense', 'unpaid', p_description, v_caller, now()
    ) RETURNING id INTO v_payable_id;

    -- Insert expense linked to payable
    INSERT INTO public.expenses (
      user_id, season_id, mill_id, category, amount, description, payment_method, supplier_id, payable_id, created_at
    ) VALUES (
      v_caller, p_season_id, v_mill_id, p_category, p_amount, p_description, 'credit', p_supplier_id, v_payable_id, now()
    ) RETURNING id INTO v_expense_id;

    UPDATE public.payables SET source_id = v_expense_id WHERE id = v_payable_id;

    -- Record financial transaction (direction none / credit)
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, description, category, status, created_at
    ) VALUES (
      v_caller, v_mill_id, p_season_id, 'expense', p_amount, 'none'::financial_direction, 'credit'::financial_payment_method, v_expense_id, 'expense', COALESCE(p_description, '') || ' [دين مؤجل لصالح: ' || v_creditor_name || ']', p_category, 'active'::financial_tx_status, now()
    );

  -- Method 3: Paid by Partner / Shareholder
  ELSIF p_payment_method = 'partner' THEN
    -- If partner_id is provided, resolve name
    IF p_partner_id IS NOT NULL THEN
      SELECT name INTO v_partner_name FROM public.partners WHERE id = p_partner_id AND mill_id = v_mill_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'الشريك المحدد غير موجود';
      END IF;
    -- If partner_id is not provided, but partner_name is written:
    ELSIF p_partner_name IS NOT NULL AND trim(p_partner_name) <> '' THEN
      v_partner_name := trim(p_partner_name);
      -- Check if partner already exists by name
      SELECT id INTO p_partner_id FROM public.partners WHERE mill_id = v_mill_id AND lower(trim(name)) = lower(v_partner_name) LIMIT 1;
      -- If not found, automatically register this partner
      IF p_partner_id IS NULL THEN
        INSERT INTO public.partners (mill_id, name, active, created_at)
        VALUES (v_mill_id, v_partner_name, true, now())
        RETURNING id INTO p_partner_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'يرجى تدوين أو اختيار اسم الشريك الذي دفع المصروف';
    END IF;

    -- Create Payable Due to Partner
    INSERT INTO public.payables (
      mill_id, season_id, type, partner_id, creditor_name, original_amount, paid_amount, remaining_amount, source_type, status, notes, created_by, created_at
    ) VALUES (
      v_mill_id, p_season_id, 'due_to_partner', p_partner_id, v_partner_name, p_amount, 0, p_amount, 'expense', 'unpaid', 'تم دفعه من المال الشخصي للشريك: ' || v_partner_name, v_caller, now()
    ) RETURNING id INTO v_payable_id;

    -- Insert expense (considered paid immediately, no debt on expense itself)
    INSERT INTO public.expenses (
      user_id, season_id, mill_id, category, amount, description, payment_method, partner_id, payable_id, created_at
    ) VALUES (
      v_caller, p_season_id, v_mill_id, p_category, p_amount, p_description, 'partner', p_partner_id, v_payable_id, now()
    ) RETURNING id INTO v_expense_id;

    UPDATE public.payables SET source_id = v_expense_id WHERE id = v_payable_id;

    -- Record financial transaction
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, party_type, party_id, party_name, description, category, status, created_at
    ) VALUES (
      v_caller, v_mill_id, p_season_id, 'expense', p_amount, 'none'::financial_direction, 'credit'::financial_payment_method, v_expense_id, 'expense', 'partner', p_partner_id, v_partner_name, 'مصروف مدفوع من الشريك: ' || v_partner_name, p_category, 'active'::financial_tx_status, now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', v_expense_id,
    'payable_id', v_payable_id,
    'payment_method', p_payment_method
  );
END;
$$;


-- 11. ATOMIC RPC: record_product_purchase_atomic
CREATE OR REPLACE FUNCTION public.record_product_purchase_atomic(
  p_season_id      uuid,
  p_product_id     uuid,
  p_quantity       integer,
  p_unit_price     numeric,
  p_payment_method text,
  p_supplier_id    uuid DEFAULT NULL,
  p_partner_id     uuid DEFAULT NULL,
  p_notes          text DEFAULT NULL
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

  v_total_price := p_quantity * p_unit_price;

  -- Resolve mill from season
  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id = p_season_id;
  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'الموسم غير موجود';
  END IF;

  -- Verify mill access
  IF NOT public.is_platform_admin(v_caller) AND NOT public.check_user_mill_access(v_mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء مشتريات لهذه المعصرة';
  END IF;

  -- Verify product belongs to mill
  SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id AND mill_id = v_mill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود في هذه المعصرة';
  END IF;

  -- 1. If cash, verify drawer & inventory
  IF p_payment_method = 'cash' THEN
    SELECT id INTO v_session_id FROM public.cash_sessions WHERE mill_id = v_mill_id AND status = 'open' LIMIT 1;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل الشراء النقدي.';
    END IF;

    SELECT total_cash INTO v_cash_balance FROM public.inventory WHERE season_id = p_season_id AND mill_id = v_mill_id FOR UPDATE;
    IF v_cash_balance IS NULL OR v_cash_balance < v_total_price THEN
      RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لإتمام عملية الشراء';
    END IF;

    -- Deduct inventory cash
    UPDATE public.inventory SET total_cash = total_cash - v_total_price, updated_at = now() WHERE season_id = p_season_id AND mill_id = v_mill_id;

  ELSIF p_payment_method = 'credit' THEN
    IF p_supplier_id IS NOT NULL THEN
      SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = p_supplier_id AND mill_id = v_mill_id;
    END IF;

    -- Create Payable due to supplier
    INSERT INTO public.payables (
      mill_id, season_id, type, supplier_id, creditor_name, original_amount, paid_amount, remaining_amount, source_type, status, notes, created_by, created_at
    ) VALUES (
      v_mill_id, p_season_id, 'due_to_supplier', p_supplier_id, COALESCE(v_supplier_name, 'مورد مواد'), v_total_price, 0, v_total_price, 'purchase', 'unpaid', p_notes, v_caller, now()
    ) RETURNING id INTO v_payable_id;

  ELSIF p_payment_method = 'partner' THEN
    IF p_partner_id IS NULL THEN
      RAISE EXCEPTION 'يرجى اختيار الشريك الذي دفع قيمة المشتريات';
    END IF;

    SELECT name INTO v_partner_name FROM public.partners WHERE id = p_partner_id AND mill_id = v_mill_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'الشريك غير موجود';
    END IF;

    -- Create Payable due to partner
    INSERT INTO public.payables (
      mill_id, season_id, type, partner_id, creditor_name, original_amount, paid_amount, remaining_amount, source_type, status, notes, created_by, created_at
    ) VALUES (
      v_mill_id, p_season_id, 'due_to_partner', p_partner_id, v_partner_name, v_total_price, 0, v_total_price, 'purchase', 'unpaid', 'شراء مواد مدفوع من الشريك: ' || v_partner_name, v_caller, now()
    ) RETURNING id INTO v_payable_id;
  END IF;

  -- 2. Insert purchase record
  INSERT INTO public.product_purchases (
    mill_id, season_id, product_id, supplier_id, quantity, unit_price, total_price, payment_method, partner_id, cash_session_id, notes, created_by, created_at
  ) VALUES (
    v_mill_id, p_season_id, p_product_id, p_supplier_id, p_quantity, p_unit_price, v_total_price, p_payment_method, p_partner_id, v_session_id, p_notes, v_caller, now()
  ) RETURNING id INTO v_purchase_id;

  -- 3. Update stock movement (+quantity)
  INSERT INTO public.product_stock_movements (
    mill_id, season_id, product_id, quantity, type, reference_type, reference_id, notes, created_by, created_at
  ) VALUES (
    v_mill_id, p_season_id, p_product_id, p_quantity, 'purchase', 'product_purchases', v_purchase_id, p_notes, v_caller, now()
  );

  -- 4. Update products.current_stock
  UPDATE public.products
  SET current_stock = current_stock + p_quantity,
      default_purchase_price = CASE WHEN p_unit_price > 0 THEN p_unit_price ELSE default_purchase_price END,
      updated_at = now()
  WHERE id = p_product_id;

  -- 5. Record Financial Transaction
  INSERT INTO public.financial_transactions (
    created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, party_type, party_id, description, category, status, cash_session_id, created_at
  ) VALUES (
    v_caller, v_mill_id, p_season_id, 'stock_purchase'::financial_tx_type, v_total_price, 
    CASE WHEN p_payment_method = 'cash' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,
    CASE WHEN p_payment_method = 'cash' THEN 'cash'::financial_payment_method ELSE 'credit'::financial_payment_method END,
    v_purchase_id, 'product_purchase', 
    CASE WHEN p_payment_method = 'partner' THEN 'partner' ELSE 'supplier' END,
    COALESCE(p_partner_id, p_supplier_id),
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


-- 12. ATOMIC RPC: settle_payable_atomic
-- Settles a payable (due to partner or supplier). If paid from cash, deducts cash, stamps cash_session, NO new expense created.
CREATE OR REPLACE FUNCTION public.settle_payable_atomic(
  p_payable_id     uuid,
  p_amount         numeric,
  p_payment_method text DEFAULT 'cash',
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_payable        record;
  v_session_id     uuid := NULL;
  v_cash_balance   numeric;
  v_new_paid       numeric;
  v_new_remaining  numeric;
  v_new_status     text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'يجب أن يكون مبلغ السداد أكبر من صفر';
  END IF;

  -- Lock payable row
  SELECT * INTO v_payable FROM public.payables WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الالتزام المالي غير موجود';
  END IF;

  IF v_payable.status = 'paid' OR v_payable.remaining_amount <= 0 THEN
    RAISE EXCEPTION 'هذا الالتزام مسدد بالكامل مسبقاً';
  END IF;

  IF p_amount > v_payable.remaining_amount THEN
    RAISE EXCEPTION 'المبلغ المدخل أكبر من الرصيد المتبقي (% شيكل)', v_payable.remaining_amount;
  END IF;

  -- Verify access
  IF NOT public.is_platform_admin(v_caller) AND NOT public.check_user_mill_access(v_payable.mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بسداد التزامات هذه المعصرة';
  END IF;

  -- If payment from mill cash:
  IF p_payment_method = 'cash' THEN
    SELECT id INTO v_session_id FROM public.cash_sessions WHERE mill_id = v_payable.mill_id AND status = 'open' LIMIT 1;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً قبل سداد أي التزام نقدي.';
    END IF;

    SELECT total_cash INTO v_cash_balance FROM public.inventory WHERE season_id = v_payable.season_id AND mill_id = v_payable.mill_id FOR UPDATE;
    IF v_cash_balance IS NULL OR v_cash_balance < p_amount THEN
      RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لسداد هذا المبلغ';
    END IF;

    -- Deduct inventory cash
    UPDATE public.inventory SET total_cash = total_cash - p_amount, updated_at = now() WHERE season_id = v_payable.season_id AND mill_id = v_payable.mill_id;

    -- Record in financial_transactions as debt settlement (NOT expense)
    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, payment_method, reference_id, reference_type, party_type, party_id, party_name, description, category, status, cash_session_id, created_at
    ) VALUES (
      v_caller, v_payable.mill_id, v_payable.season_id,
      CASE WHEN v_payable.type = 'due_to_partner' THEN 'owner_withdrawal'::financial_tx_type ELSE 'supplier_payment'::financial_tx_type END,
      p_amount, 'out'::financial_direction, 'cash'::financial_payment_method, v_payable.id, 'payable_settlement',
      CASE WHEN v_payable.type = 'due_to_partner' THEN 'partner' ELSE 'supplier' END,
      COALESCE(v_payable.partner_id, v_payable.supplier_id),
      v_payable.creditor_name,
      'سداد دفعة من التزام: ' || v_payable.creditor_name || COALESCE(' (' || p_notes || ')', ''),
      'debt_settlement', 'active'::financial_tx_status, v_session_id, now()
    );
  END IF;

  -- Update payable record
  v_new_paid := v_payable.paid_amount + p_amount;
  v_new_remaining := v_payable.remaining_amount - p_amount;
  v_new_status := CASE WHEN v_new_remaining <= 0.001 THEN 'paid' ELSE 'partially_paid' END;

  UPDATE public.payables
  SET paid_amount = v_new_paid,
      remaining_amount = v_new_remaining,
      status = v_new_status,
      updated_at = now()
  WHERE id = p_payable_id;

  RETURN jsonb_build_object(
    'success', true,
    'payable_id', p_payable_id,
    'paid_now', p_amount,
    'total_paid', v_new_paid,
    'remaining', v_new_remaining,
    'status', v_new_status
  );
END;
$$;


-- 13. ATOMIC RPC: record_partner_transaction_atomic
-- For Owner/Partner deposits (adds cash/equity) and withdrawals (deducts cash/equity)
CREATE OR REPLACE FUNCTION public.record_partner_transaction_atomic(
  p_season_id uuid,
  p_partner_id uuid,
  p_type text, -- 'deposit' or 'withdrawal'
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_mill_id uuid;
  v_partner_name text;
  v_active_session record;
  v_cash_balance numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ غير صالح'; END IF;
  IF p_type NOT IN ('deposit', 'withdrawal') THEN RAISE EXCEPTION 'نوع العملية غير صالح'; END IF;

  SELECT mill_id INTO v_mill_id FROM public.seasons WHERE id = p_season_id;
  IF v_mill_id IS NULL THEN RAISE EXCEPTION 'الموسم غير موجود'; END IF;

  IF NOT public.is_platform_admin(v_caller) AND NOT public.check_user_mill_access(v_mill_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية';
  END IF;

  SELECT name INTO v_partner_name FROM public.partners WHERE id = p_partner_id AND mill_id = v_mill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الشريك غير موجود'; END IF;

  -- Check open session
  SELECT * INTO v_active_session FROM public.cash_sessions WHERE mill_id = v_mill_id AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصندوق مغلق. يجب فتح الصندوق أولاً.'; END IF;

  IF p_type = 'deposit' THEN
    -- Partner deposits cash into mill
    UPDATE public.inventory SET total_cash = total_cash + p_amount, updated_at = now() WHERE season_id = p_season_id AND mill_id = v_mill_id;

    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, payment_method, party_type, party_id, party_name, description, category, status, cash_session_id, created_at
    ) VALUES (
      v_caller, v_mill_id, p_season_id, 'owner_deposit', p_amount, 'in', 'cash', 'partner', p_partner_id, v_partner_name,
      'إيداع نقدي من الشريك: ' || v_partner_name || COALESCE(' (' || p_notes || ')', ''),
      'partner_deposit', 'active', v_active_session.id, now()
    );

  ELSIF p_type = 'withdrawal' THEN
    -- Partner withdraws cash from mill
    SELECT total_cash INTO v_cash_balance FROM public.inventory WHERE season_id = p_season_id AND mill_id = v_mill_id FOR UPDATE;
    IF v_cash_balance IS NULL OR v_cash_balance < p_amount THEN
      RAISE EXCEPTION 'رصيد الصندوق غير كافٍ لإتمام السحب';
    END IF;

    UPDATE public.inventory SET total_cash = total_cash - p_amount, updated_at = now() WHERE season_id = p_season_id AND mill_id = v_mill_id;

    INSERT INTO public.financial_transactions (
      created_by, mill_id, season_id, type, amount, direction, payment_method, party_type, party_id, party_name, description, category, status, cash_session_id, created_at
    ) VALUES (
      v_caller, v_mill_id, p_season_id, 'owner_withdrawal', p_amount, 'out', 'cash', 'partner', p_partner_id, v_partner_name,
      'سحب نقدي للشريك: ' || v_partner_name || COALESCE(' (' || p_notes || ')', ''),
      'partner_withdrawal', 'active', v_active_session.id, now()
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'partner_id', p_partner_id, 'type', p_type, 'amount', p_amount);
END;
$$;


-- 14. Grants on new RPCs
REVOKE ALL ON FUNCTION public.record_expense_v2(uuid, text, numeric, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_v2(uuid, text, numeric, text, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_product_purchase_atomic(uuid, uuid, integer, numeric, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_purchase_atomic(uuid, uuid, integer, numeric, text, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_payable_atomic(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payable_atomic(uuid, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_partner_transaction_atomic(uuid, uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_transaction_atomic(uuid, uuid, text, numeric, text) TO authenticated, service_role;
