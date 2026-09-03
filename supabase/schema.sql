-- =============================================
-- OLIVE FLOW MANAGER - COMPLETE DATABASE SCHEMA
-- Clean ordered schema (no dependency conflicts)
-- =============================================

-- ============================================================
-- STEP 1: ENUMS
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('platform_admin', 'mill_owner');
CREATE TYPE public.subscription_status AS ENUM ('pending', 'active', 'suspended');


-- ============================================================
-- STEP 2: HELPER FUNCTIONS (needed by triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ============================================================
-- STEP 3: CORE TABLES (no foreign key dependencies between them)
-- ============================================================

-- Profiles (one per user)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  secondary_phone TEXT,
  country TEXT,
  mill_name TEXT,
  mill_location TEXT,
  subscription_status public.subscription_status DEFAULT 'pending',
  subscription_notes TEXT,
  monthly_fee NUMERIC,
  report_pin TEXT,
  employee_pin TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Settings (one per user - legacy, kept for compatibility)
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_percent numeric NOT NULL DEFAULT 6,
  oil_sell_price numeric NOT NULL DEFAULT 25,
  oil_buy_price numeric NOT NULL DEFAULT 23,
  cash_return_cost numeric NOT NULL DEFAULT 1.5,
  plastic_container_price numeric NOT NULL DEFAULT 10,
  metal_container_price numeric NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- System Settings (platform-level)
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Subscription Payments
CREATE TABLE public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  recorded_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admin Audit Log
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  viewed_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seasons (one of the most important tables)
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  return_percent numeric NOT NULL DEFAULT 6,
  oil_sell_price numeric NOT NULL DEFAULT 25,
  oil_buy_price numeric NOT NULL DEFAULT 23,
  cash_return_cost numeric NOT NULL DEFAULT 1.5,
  plastic_container_price numeric NOT NULL DEFAULT 10,
  metal_container_price numeric NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Queue
CREATE TABLE public.queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  bags integer NOT NULL,
  notes text,
  position integer DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting',
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  oil_produced numeric NOT NULL,
  container_count integer NOT NULL,
  container_type text NOT NULL DEFAULT 'plastic',
  payment_type text NOT NULL,
  oil_amount numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  total_display text NOT NULL,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Workers
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  phone text,
  hourly_rate numeric,
  shift_rate numeric,
  total_earned numeric NOT NULL DEFAULT 0,
  total_paid numeric NOT NULL DEFAULT 0,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Work Records
CREATE TABLE public.work_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  hours numeric,
  shifts integer,
  amount numeric NOT NULL,
  notes text,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Worker Payments
CREATE TABLE public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  notes text,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Oil Transactions
CREATE TABLE public.oil_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL,
  price numeric NOT NULL,
  total_price numeric NOT NULL,
  party_name text,
  notes text,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric NOT NULL,
  description text,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Expense Categories
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  season_id uuid NOT NULL REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inventory (summary per user/season)
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_oil numeric NOT NULL DEFAULT 0,
  total_cash numeric NOT NULL DEFAULT 0,
  season_id uuid REFERENCES public.seasons(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season_id)
);

-- Container Types
CREATE TABLE public.container_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  season_id uuid REFERENCES public.seasons(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Daily Inventory
CREATE TABLE public.daily_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE NOT NULL,
  oil_amount numeric DEFAULT 0 NOT NULL,
  cash_amount numeric DEFAULT 0 NOT NULL,
  container_count integer DEFAULT 0 NOT NULL,
  inventory_date date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, season_id, inventory_date)
);


-- ============================================================
-- STEP 4: ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oil_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 5: has_role FUNCTION (must be before any policy using it)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;


-- ============================================================
-- STEP 6: RLS POLICIES
-- ============================================================

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- User Roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'platform_admin'));

-- Settings
CREATE POLICY "Users manage own settings" ON public.settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- System Settings (admins only)
CREATE POLICY "Admins manage system settings" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Seasons
CREATE POLICY "Users manage own seasons" ON public.seasons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Customers
CREATE POLICY "Users manage own customers" ON public.customers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Queue
CREATE POLICY "Users manage own queue" ON public.queue FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Invoices
CREATE POLICY "Users manage own invoices" ON public.invoices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Workers
CREATE POLICY "Users manage own workers" ON public.workers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Work Records
CREATE POLICY "Users manage own work_records" ON public.work_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Worker Payments
CREATE POLICY "Users manage own worker_payments" ON public.worker_payments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Oil Transactions
CREATE POLICY "Users manage own oil_transactions" ON public.oil_transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Expenses
CREATE POLICY "Users manage own expenses" ON public.expenses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Expense Categories
CREATE POLICY "Users manage own expense_categories" ON public.expense_categories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inventory
CREATE POLICY "Users manage own inventory" ON public.inventory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Container Types
CREATE POLICY "Users manage own container_types" ON public.container_types FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Daily Inventory
CREATE POLICY "Users can manage their own daily inventory" ON public.daily_inventory FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Subscription Payments (admins only)
CREATE POLICY "Admins manage subscription payments" ON public.subscription_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Admin Audit Log
CREATE POLICY "Admins can view audit log" ON public.admin_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "Admins can insert audit log" ON public.admin_audit_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));


-- ============================================================
-- STEP 7: GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_inventory TO authenticated;
GRANT ALL ON public.daily_inventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue TO authenticated;
GRANT ALL ON public.queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_records TO authenticated;
GRANT ALL ON public.work_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO authenticated;
GRANT ALL ON public.worker_payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oil_transactions TO authenticated;
GRANT ALL ON public.oil_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.container_types TO authenticated;
GRANT ALL ON public.container_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;


-- ============================================================
-- STEP 8: TRIGGERS
-- ============================================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- STEP 9: AUTO-SETUP TRIGGERS ON NEW USER SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id, 
    display_name,
    mill_name,
    phone,
    secondary_phone,
    country,
    mill_location
  )
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'mill_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'secondary_phone',
    COALESCE(NEW.raw_user_meta_data->>'country', 'فلسطين'),
    NEW.raw_user_meta_data->>'mill_location'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    mill_name = COALESCE(EXCLUDED.mill_name, profiles.mill_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    secondary_phone = COALESCE(EXCLUDED.secondary_phone, profiles.secondary_phone),
    country = COALESCE(EXCLUDED.country, profiles.country),
    mill_location = COALESCE(EXCLUDED.mill_location, profiles.mill_location);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.inventory (user_id, season_id) VALUES (NEW.id, NULL) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_setup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();


-- ============================================================
-- STEP 10: STORED FUNCTIONS
-- ============================================================

-- Function: get public queue (no auth needed)
CREATE OR REPLACE FUNCTION public.get_public_queue(p_season_id uuid)
RETURNS TABLE(id uuid, name text, bags integer, queue_position integer, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, bags, "position", status
  FROM public.queue
  WHERE season_id = p_season_id
    AND status IN ('waiting', 'processing')
  ORDER BY "position" ASC;
$$;

-- Function: get public season display info
CREATE OR REPLACE FUNCTION public.get_public_season_display(p_season_id uuid)
RETURNS TABLE(name text, return_percent numeric, oil_sell_price numeric, oil_buy_price numeric, plastic_container_price numeric, metal_container_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, return_percent, oil_sell_price, oil_buy_price, plastic_container_price, metal_container_price
  FROM public.seasons
  WHERE id = p_season_id;
$$;

-- Function: create invoice and settle queue atomically
CREATE OR REPLACE FUNCTION public.create_invoice_and_settle(
  p_customer_name text,
  p_oil_produced numeric,
  p_container_count integer,
  p_container_type text,
  p_payment_type text,
  p_oil_amount numeric,
  p_cash_amount numeric,
  p_total_display text,
  p_season_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  -- Insert invoice
  INSERT INTO public.invoices (
    user_id, customer_id, customer_name, oil_produced,
    container_count, container_type, payment_type,
    oil_amount, cash_amount, total_display, season_id
  ) VALUES (
    v_user_id, p_customer_id, p_customer_name, p_oil_produced,
    p_container_count, p_container_type, p_payment_type,
    p_oil_amount, p_cash_amount, p_total_display, p_season_id
  )
  RETURNING id INTO v_invoice_id;

  -- Update queue status if provided
  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue
    SET status = 'done'
    WHERE id = p_queue_id AND user_id = v_user_id;
  END IF;

  -- Update inventory
  INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
  VALUES (v_user_id, p_season_id, p_oil_amount, p_cash_amount)
  ON CONFLICT (user_id, season_id)
  DO UPDATE SET
    total_oil = public.inventory.total_oil + p_oil_amount,
    total_cash = public.inventory.total_cash + p_cash_amount,
    updated_at = now();

  RETURN v_invoice_id;
END;
$$;

-- Function: set report PIN
CREATE OR REPLACE FUNCTION public.set_report_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET report_pin = new_pin
  WHERE user_id = auth.uid();
END;
$$;

-- Function: verify report PIN
CREATE OR REPLACE FUNCTION public.verify_report_pin(input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_pin text;
BEGIN
  SELECT report_pin INTO stored_pin
  FROM public.profiles
  WHERE user_id = auth.uid();
  RETURN stored_pin = input_pin;
END;
$$;

-- Function: set employee PIN
CREATE OR REPLACE FUNCTION public.set_employee_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET employee_pin = CASE 
    WHEN new_pin IS NULL OR new_pin = '' THEN NULL 
    ELSE crypt(new_pin, gen_salt('bf')) 
  END
  WHERE user_id = auth.uid() OR id = auth.uid();
END;
$$;

-- Function: verify employee PIN
CREATE OR REPLACE FUNCTION public.verify_employee_pin(owner_id uuid, input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (user_id = owner_id OR id = owner_id)
      AND employee_pin IS NOT NULL
      AND employee_pin = crypt(input_pin, employee_pin)
  );
END;
$$;

-- Function: log admin access
CREATE OR REPLACE FUNCTION public.log_admin_access(admin_action text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_audit_log (admin_user_id, viewed_user_id, action)
  VALUES (auth.uid(), target_user_id, admin_action);
END;
$$;

-- Function: register worker session and update earnings
CREATE OR REPLACE FUNCTION public.register_worker_session(
    p_user_id UUID,
    p_season_id UUID,
    p_worker_id UUID,
    p_val NUMERIC,
    p_notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
    v_hourly_rate NUMERIC;
    v_shift_rate NUMERIC;
    v_amount NUMERIC;
BEGIN
    -- Get worker info
    SELECT type, hourly_rate, shift_rate INTO v_type, v_hourly_rate, v_shift_rate
    FROM public.workers
    WHERE id = p_worker_id AND user_id = p_user_id AND season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود';
    END IF;

    -- Calculate amount
    IF v_type = 'hourly' THEN
        v_amount := p_val * COALESCE(v_hourly_rate, 0);
    ELSE
        v_amount := p_val * COALESCE(v_shift_rate, 0);
    END IF;

    -- 1. Insert work record
    INSERT INTO public.work_records (
        user_id, season_id, worker_id, amount, notes, 
        hours, shifts
    )
    VALUES (
        p_user_id, p_season_id, p_worker_id, v_amount, p_notes,
        CASE WHEN v_type = 'hourly' THEN p_val ELSE NULL END,
        CASE WHEN v_type = 'shift' THEN p_val ELSE NULL END
    );

    -- 2. Update worker total_earned
    UPDATE public.workers
    SET total_earned = total_earned + v_amount
    WHERE id = p_worker_id;
END;
$$;

-- Function: pay worker and settle
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
    v_total_earned NUMERIC;
    v_total_paid NUMERIC;
    v_cash_balance NUMERIC;
BEGIN
    -- Check worker balance
    SELECT total_earned, total_paid INTO v_total_earned, v_total_paid
    FROM public.workers
    WHERE id = p_worker_id AND user_id = p_user_id AND season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود';
    END IF;

    IF p_amount > (v_total_earned - v_total_paid) THEN
        RAISE EXCEPTION 'المبلغ أكبر من الرصيد المستحق';
    END IF;

    -- Check inventory cash
    SELECT total_cash INTO v_cash_balance
    FROM public.inventory
    WHERE user_id = p_user_id AND season_id = p_season_id;

    IF v_cash_balance < p_amount THEN
        RAISE EXCEPTION 'رصيد الصندوق غير كافٍ';
    END IF;

    -- 1. Insert payment record
    INSERT INTO public.worker_payments (user_id, season_id, worker_id, amount, notes)
    VALUES (p_user_id, p_season_id, p_worker_id, p_amount, p_notes);

    -- 2. Update worker total_paid
    UPDATE public.workers
    SET total_paid = total_paid + p_amount
    WHERE id = p_worker_id;

    -- 3. Update inventory total_cash
    UPDATE public.inventory
    SET total_cash = total_cash - p_amount
    WHERE user_id = p_user_id AND season_id = p_season_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_worker_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin(uuid, text) TO authenticated, anon;

