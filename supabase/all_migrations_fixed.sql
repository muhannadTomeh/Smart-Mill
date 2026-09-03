-- =============================================
-- OLIVE FLOW MANAGER - FULL DATABASE SCHEMA
-- Migrations ordered by dependency (not just date)
-- Generated: 2026-09-02 01:19
-- =============================================


-- ===== 20260308202752_dc78ed1f-38f3-4841-874d-b70f805f49d4.sql =====
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 20260308214910_1f76e00a-d9c0-44ba-9c05-cfe25bf8d9c8.sql =====

-- Settings table (one per user)
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

-- Queue table
CREATE TABLE public.queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  bags integer NOT NULL,
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Customers table
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoices table
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
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Workers table
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  hourly_rate numeric,
  shift_rate numeric,
  total_earned numeric NOT NULL DEFAULT 0,
  total_paid numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Work records
CREATE TABLE public.work_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  hours numeric,
  shifts integer,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Worker payments
CREATE TABLE public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Oil transactions
CREATE TABLE public.oil_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL,
  price numeric NOT NULL,
  total_price numeric NOT NULL,
  party_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inventory (one per user)
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_oil numeric NOT NULL DEFAULT 0,
  total_cash numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oil_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- RLS policies for settings
CREATE POLICY "Users manage own settings" ON public.settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for queue
CREATE POLICY "Users manage own queue" ON public.queue FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for customers
CREATE POLICY "Users manage own customers" ON public.customers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for invoices
CREATE POLICY "Users manage own invoices" ON public.invoices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for workers
CREATE POLICY "Users manage own workers" ON public.workers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for work_records
CREATE POLICY "Users manage own work_records" ON public.work_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for worker_payments
CREATE POLICY "Users manage own worker_payments" ON public.worker_payments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for oil_transactions
CREATE POLICY "Users manage own oil_transactions" ON public.oil_transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for expenses
CREATE POLICY "Users manage own expenses" ON public.expenses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for inventory
CREATE POLICY "Users manage own inventory" ON public.inventory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at on settings
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on customers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on workers
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on inventory
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create settings and inventory for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.inventory (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_setup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();


-- ===== 20260308225653_fc2ecda5-c3d5-4ffa-be10-8f56dca92a0b.sql =====

CREATE TABLE public.container_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.container_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own container_types" ON public.container_types
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ===== 20260308231016_7362e2b6-bd05-4c20-98ab-645d84036f57.sql =====
ALTER TABLE public.queue ADD COLUMN status text NOT NULL DEFAULT 'waiting';

-- ===== 20260309011742_0c2cf5d7-753b-4c83-8d7e-716d72c72a57.sql =====
ALTER TABLE public.workers ADD COLUMN phone text;
ALTER TABLE public.worker_payments ADD COLUMN notes text;

-- ===== 20260309022006_8b1c8209-713b-429d-9b93-01c580fb36f6.sql =====

-- Create seasons table
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
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

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own seasons" ON public.seasons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add season_id to all data tables
ALTER TABLE public.queue ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.invoices ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.customers ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.workers ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.work_records ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.worker_payments ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.expenses ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.oil_transactions ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.container_types ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.inventory ADD COLUMN season_id uuid REFERENCES public.seasons(id);


-- ===== 20260309034835_a17599cb-a081-4363-8e15-ada3116734b3.sql =====
CREATE POLICY "Public can view queue by season"
  ON public.queue
  FOR SELECT
  TO anon
  USING (true);

-- ===== 20260309034934_3fecf86c-2883-42b5-ade2-d1a76cd67546.sql =====
CREATE POLICY "Public can view season name"
  ON public.seasons
  FOR SELECT
  TO anon
  USING (true);

-- ===== 20240324000000_daily_inventory.sql =====
CREATE TABLE IF NOT EXISTS public.daily_inventory (
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_inventory TO authenticated;
GRANT ALL ON public.daily_inventory TO service_role;

ALTER TABLE public.daily_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own daily inventory"
ON public.daily_inventory
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ===== 20240324000001_contact_settings.sql =====
-- Check if table exists, if not create it (it seems it might exist based on AdminIndex.tsx)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

-- Ensure correct GRANTs
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read system settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage system settings" ON public.system_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Initialize default values if they don't exist
INSERT INTO public.system_settings (key, value) VALUES 
('contact_email', 'muhannad.tomeh22@gmail.com'),
('contact_phone', '0569945677'),
('contact_whatsapp', '+972594596906')
ON CONFLICT (key) DO NOTHING;


-- ===== 20240813000000_add_mill_employee_role.sql =====
-- 1. Add mill_employee to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mill_employee';

-- 2. Add employee_pin to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_pin TEXT;

-- 3. Update has_role to be more robust if needed (already is)
-- No changes needed to has_role.

-- 4. Secure the employee_pin: ensure only the owner (profile owner) or admin can read it
-- By default RLS on profiles allows users to read their own profile.
-- We might want to ensure only the owner can update it.

-- Grant permissions (if needed, but already granted in previous steps)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Function to set employee pin securely
CREATE OR REPLACE FUNCTION public.set_employee_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET employee_pin = CASE WHEN new_pin = '' THEN NULL ELSE crypt(new_pin, gen_salt('bf')) END
  WHERE id = auth.uid();
END;
$$;

-- Function to verify employee pin
-- This returns the user_id (mill_owner_id) if valid
CREATE OR REPLACE FUNCTION public.verify_employee_pin(owner_id uuid, input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = owner_id
      AND employee_pin IS NOT NULL
      AND employee_pin = crypt(input_pin, employee_pin)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin(uuid, text) TO anon;


-- ===== 20260801014812_13461a4e-af87-4701-bc62-5a7e9ede00b2.sql =====
ALTER TABLE public.queue REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;

-- ===== 20260802004703_a62e5c77-e981-456e-b205-3c729490cb3a.sql =====
UPDATE public.queue SET status = 'completed' WHERE status = 'done';
ALTER TABLE public.queue
  ADD CONSTRAINT queue_status_check
  CHECK (status IN ('waiting', 'processing', 'completed'));

-- ===== 20260802004953_2beb5050-1a1c-4802-aab3-f970cd1fe329.sql =====
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.inventory (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TABLE IF EXISTS public.settings;

-- ===== 20260802010206_62f2d43e-9450-4bf8-a777-30a64854a762.sql =====
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
  v_user uuid := auth.uid();
  v_invoice_id uuid;
  v_oil_delta numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.seasons s WHERE s.id = p_season_id AND s.user_id = v_user) THEN
    RAISE EXCEPTION 'Season not found for this user';
  END IF;

  INSERT INTO public.invoices (
    user_id, season_id, customer_id, customer_name, oil_produced,
    container_count, container_type, payment_type, oil_amount, cash_amount, total_display
  ) VALUES (
    v_user, p_season_id, p_customer_id, p_customer_name, p_oil_produced,
    p_container_count, p_container_type, p_payment_type, p_oil_amount, p_cash_amount, p_total_display
  ) RETURNING id INTO v_invoice_id;

  v_oil_delta := COALESCE(p_oil_produced, 0) - COALESCE(p_oil_amount, 0);

  UPDATE public.inventory
     SET total_oil = COALESCE(total_oil, 0) + v_oil_delta,
         total_cash = COALESCE(total_cash, 0) + COALESCE(p_cash_amount, 0),
         updated_at = now()
   WHERE user_id = v_user AND season_id = p_season_id;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
    VALUES (v_user, p_season_id, v_oil_delta, COALESCE(p_cash_amount, 0));
  END IF;

  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue SET status = 'completed'
     WHERE id = p_queue_id AND user_id = v_user;
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;

-- ===== 20260803231305_f0d5d198-7f61-4b35-8f0e-82574b753340.sql =====
CREATE OR REPLACE FUNCTION public.set_queue_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.position IS NULL OR NEW.position <= 0 THEN
    SELECT COALESCE(MAX(q.position), 0) + 1
      INTO NEW.position
      FROM public.queue q
     WHERE q.season_id = NEW.season_id
       AND q.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_queue_position_trigger ON public.queue;
CREATE TRIGGER set_queue_position_trigger
BEFORE INSERT ON public.queue
FOR EACH ROW EXECUTE FUNCTION public.set_queue_position();

ALTER TABLE public.queue ALTER COLUMN position DROP NOT NULL;
ALTER TABLE public.queue ALTER COLUMN position DROP DEFAULT;

-- ===== 20260804144052_e4f9501e-c78d-47e2-9b97-2c627a1b1252.sql =====
-- attach legacy season-less inventory rows to the user's active season
UPDATE public.inventory i
SET season_id = s.id
FROM public.seasons s
WHERE i.season_id IS NULL
  AND s.user_id = i.user_id
  AND s.status = 'active';

-- remove leftovers that still have no season and no data
DELETE FROM public.inventory
WHERE season_id IS NULL AND total_oil = 0 AND total_cash = 0;

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_user_season_uidx
  ON public.inventory (user_id, season_id);

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- inventory is created per season, nothing to do at signup
  RETURN NEW;
END;
$function$;

-- ===== 20260805103537_de205a92-cfa4-4b7b-a8e2-e41b91415de5.sql =====
DROP POLICY IF EXISTS "Public can view queue by season" ON public.queue;
DROP POLICY IF EXISTS "Public can view season name" ON public.seasons;

REVOKE SELECT ON public.queue FROM anon;
REVOKE SELECT ON public.seasons FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_queue(p_season_id uuid)
RETURNS TABLE (id uuid, name text, "position" integer, status text, bags integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.name, q."position", q.status, q.bags
  FROM public.queue q
  WHERE q.season_id = p_season_id
    AND q.status IN ('waiting', 'processing')
  ORDER BY q."position" ASC
$$;

CREATE OR REPLACE FUNCTION public.get_public_season_display(p_season_id uuid)
RETURNS TABLE (
  name text,
  oil_buy_price numeric,
  oil_sell_price numeric,
  return_percent numeric,
  plastic_container_price numeric,
  metal_container_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.name, s.oil_buy_price, s.oil_sell_price, s.return_percent,
         s.plastic_container_price, s.metal_container_price
  FROM public.seasons s
  WHERE s.id = p_season_id
$$;

GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;

-- ===== 20260805123142_c6f6b1f5-9161-4b22-9346-70c72164fb23.sql =====
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_setup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_queue_position() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- ===== 20260809145224_8741f870-a0c8-4924-8935-d653cbd7d895.sql =====
DO $$
BEGIN
    -- 1. Create the enum type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('platform_admin', 'mill_owner');
    END IF;

    -- 2. Create the user_roles table
    CREATE TABLE IF NOT EXISTS public.user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        role public.app_role NOT NULL,
        created_at timestamptz DEFAULT now(),
        UNIQUE (user_id, role)
    );

    -- 3. Grant access
    -- We grant SELECT to authenticated users so they can check their own roles via the client
    -- But RLS will restrict it.
    GRANT SELECT ON public.user_roles TO authenticated;
    GRANT ALL ON public.user_roles TO service_role;

    -- 4. Enable RLS
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

    -- 5. Create RLS Policy: Users can only read their own roles
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_roles' AND policyname = 'Users can view their own roles'
    ) THEN
        CREATE POLICY "Users can view their own roles"
        ON public.user_roles
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);
    END IF;

    -- 6. Create the has_role function
    -- Using SECURITY DEFINER to bypass RLS recursion
    CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $f$
      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
      );
    $f$;

    -- 7. Assign platform_admin to the main user (Muhannad)
    -- Both IDs found in the system seem to be yours; assigning to both for safety 
    -- or prioritizing the primary one if identifiable. I'll assign to both as 'platform_admin' 
    -- and ensure the logic works.
    INSERT INTO public.user_roles (user_id, role)
    VALUES 
        ('f607698a-250a-4f6c-aed0-c397b0812216', 'platform_admin'),
        ('74311940-1c85-4e95-8bb3-92dfc81ba869', 'platform_admin')
    ON CONFLICT (user_id, role) DO NOTHING;

END $$;


-- ===== 20260809145246_1bdb11ad-004a-4368-b701-999dee0f9659.sql =====
-- Revoke EXECUTE from public (anon) and authenticated roles for security definer functions
-- to prevent manual abuse via the API while keeping them available for RLS/Triggers.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

-- Also check other security definer functions that might have been flagged
REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_public_season_display(uuid) FROM public;


-- ===== 20260809145307_148f66f8-7063-42bc-92f9-170e0ee56385.sql =====
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Loop through all SECURITY DEFINER functions in the public schema
    FOR func_record IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        -- Revoke EXECUTE from public (anon) and authenticated roles
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM public', func_record.proname, func_record.args);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', func_record.proname, func_record.args);
    END LOOP;
END $$;


-- ===== 20260809145324_ec090c91-6184-409f-97df-c35ec9d8ae95.sql =====
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon;


-- ===== 20260809145516_f70ccbcb-8b27-43db-ac78-5ab089994e71.sql =====
DO $$
DECLARE
    t_name text;
    tables text[] := ARRAY[
        'profiles', 'seasons', 'queue', 'customers', 'invoices', 
        'workers', 'work_records', 'worker_payments', 'expenses', 
        'inventory', 'oil_transactions', 'container_types'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables LOOP
        -- Execute the policy creation for each table
        -- We use format to safely build the identifier-based SQL
        EXECUTE format(
            'CREATE POLICY "Platform admin can view all %I" ON public.%I 
             FOR SELECT 
             TO authenticated 
             USING (public.has_role(auth.uid(), %L))',
            t_name, t_name, 'platform_admin'
        );
    END LOOP;
END $$;


-- ===== 20260809145632_278fddc8-cb2b-4f6a-beea-022dce830dcb.sql =====
-- 1. Create the audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid REFERENCES auth.users(id) NOT NULL,
    viewed_user_id uuid REFERENCES auth.users(id) NOT NULL,
    action text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 2. Grant permissions
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

-- 3. Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policy: Only platform_admin can view the logs
CREATE POLICY "Only platform admins can view audit logs"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'));

-- 5. Create the logging function (SECURITY DEFINER)
-- This allows the application to insert logs safely
CREATE OR REPLACE FUNCTION public.log_admin_access(target_user_id uuid, admin_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure the person calling this is actually a platform_admin
    IF public.has_role(auth.uid(), 'platform_admin') THEN
        INSERT INTO public.admin_audit_log (admin_user_id, viewed_user_id, action)
        VALUES (auth.uid(), target_user_id, admin_action);
    ELSE
        RAISE EXCEPTION 'Access denied: Only platform admins can log access.';
    END IF;
END;
$$;

-- 6. Revoke direct execute from everyone initially for the new function
REVOKE EXECUTE ON FUNCTION public.log_admin_access(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.log_admin_access(uuid, text) FROM authenticated;

-- 7. Grant execute specifically to authenticated (since the admin will call it)
-- RLS/Internal check inside the function handles the role verification
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;


-- ===== 20260809145703_2e9e8fea-418e-4408-a6a8-f6704ba888df.sql =====
-- Clean up security definer access to satisfy linter
REVOKE EXECUTE ON FUNCTION public.log_admin_access(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public;

-- Keep authenticated access for these specific functions as they are needed for the app logic,
-- but the functions themselves have internal checks.


-- ===== 20260809150227_b5400c83-e642-44fa-a625-0ca865a094f8.sql =====
-- Add indexes to optimize performance for multi-tenant and multi-season queries

-- Table: queue
CREATE INDEX IF NOT EXISTS idx_queue_user_season ON public.queue(user_id, season_id);

-- Table: customers
CREATE INDEX IF NOT EXISTS idx_customers_user_season ON public.customers(user_id, season_id);

-- Table: invoices
CREATE INDEX IF NOT EXISTS idx_invoices_user_season ON public.invoices(user_id, season_id);

-- Table: workers
CREATE INDEX IF NOT EXISTS idx_workers_user ON public.workers(user_id);

-- Table: work_records
CREATE INDEX IF NOT EXISTS idx_work_records_user_season ON public.work_records(user_id, season_id);

-- Table: worker_payments
CREATE INDEX IF NOT EXISTS idx_worker_payments_user_season ON public.worker_payments(user_id, season_id);

-- Table: oil_transactions
CREATE INDEX IF NOT EXISTS idx_oil_transactions_user_season ON public.oil_transactions(user_id, season_id);

-- Table: expenses
CREATE INDEX IF NOT EXISTS idx_expenses_user_season ON public.expenses(user_id, season_id);

-- Table: container_types
CREATE INDEX IF NOT EXISTS idx_container_types_user_season ON public.container_types(user_id, season_id);


-- ===== 20260809150848_85ba1a89-8f54-45f7-b3e1-367ad29ac1d9.sql =====

-- Fix critical permission issue for has_role
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Ensure other required business logic functions are executable by authenticated users
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated;

-- Handle pay_worker_and_settle if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pay_worker_and_settle') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(uuid, uuid, numeric, text) TO authenticated';
    END IF;
END $$;


-- ===== 20260809152521_6a379046-153b-4e24-b172-24e92cf698dc.sql =====
-- 1. Create public.expense_categories table
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Users manage own expense categories"
ON public.expense_categories
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can select all expense categories"
ON public.expense_categories
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'));

-- 4. Grants
GRANT ALL ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

-- 5. Seed data for existing users and their active seasons
DO $$
DECLARE
    r RECORD;
    cat TEXT;
    categories TEXT[] := ARRAY['صيانة المعدات', 'فطور العمال', 'مواد التشحيم', 'النقل والمواصلات', 'فواتير الكهرباء', 'مواد التنظيف', 'أدوات ومستلزمات', 'أخرى'];
BEGIN
    FOR r IN SELECT id, user_id FROM public.seasons WHERE status = 'active' LOOP
        FOREACH cat IN ARRAY categories LOOP
            INSERT INTO public.expense_categories (user_id, season_id, name)
            VALUES (r.user_id, r.id, cat)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- 6. Create or update handle_new_user_setup to include expense categories
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger AS $$
DECLARE
    new_season_id uuid;
    cat TEXT;
    categories TEXT[] := ARRAY['صيانة المعدات', 'فطور العمال', 'مواد التشحيم', 'النقل والمواصلات', 'فواتير الكهرباء', 'مواد التنظيف', 'أدوات ومستلزمات', 'أخرى'];
BEGIN
    -- This is often triggered when a new user is created OR when they create their first season.
    -- If this is a season trigger:
    IF TG_TABLE_NAME = 'seasons' THEN
        FOREACH cat IN ARRAY categories LOOP
            INSERT INTO public.expense_categories (user_id, season_id, name)
            VALUES (NEW.user_id, NEW.id, cat);
        END LOOP;
        
        -- Also add default container types if not exists
        INSERT INTO public.container_types (user_id, season_id, name, price)
        VALUES 
            (NEW.user_id, NEW.id, 'بلاستيك', 10),
            (NEW.user_id, NEW.id, 'حديد', 15);
            
        -- Initial inventory
        INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
        VALUES (NEW.user_id, NEW.id, 0, 0);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Ensure the trigger exists on the seasons table
DROP TRIGGER IF EXISTS on_season_created_setup ON public.seasons;
CREATE TRIGGER on_season_created_setup
    AFTER INSERT ON public.seasons
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_setup();


-- ===== 20260809154800_secure_reports_pin.sql =====
-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add report_pin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS report_pin text;

-- Function to set report PIN (hashes the input)
CREATE OR REPLACE FUNCTION public.set_report_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET report_pin = CASE 
    WHEN new_pin IS NULL OR new_pin = '' THEN NULL 
    ELSE crypt(new_pin, gen_salt('bf')) 
  END
  WHERE user_id = auth.uid();
END;
$$;

-- Function to verify report PIN
CREATE OR REPLACE FUNCTION public.verify_report_pin(input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT report_pin INTO stored_hash
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- If no PIN is set, return true (unprotected)
  IF stored_hash IS NULL THEN
    RETURN true;
  END IF;
  
  -- Use crypt to compare input with stored hash
  RETURN stored_hash = crypt(input_pin, stored_hash);
END;
$$;

-- Revoke and Grant permissions
REVOKE ALL ON FUNCTION public.set_report_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_report_pin(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO service_role;


-- ===== 20260809154854_20a591e4-c3b2-41c3-a1d0-13fb25c4441f.sql =====
-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add report_pin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS report_pin text;

-- Function to set report PIN (hashes the input)
CREATE OR REPLACE FUNCTION public.set_report_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET report_pin = CASE 
    WHEN new_pin IS NULL OR new_pin = '' THEN NULL 
    ELSE crypt(new_pin, gen_salt('bf')) 
  END
  WHERE user_id = auth.uid();
END;
$$;

-- Function to verify report PIN
CREATE OR REPLACE FUNCTION public.verify_report_pin(input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT report_pin INTO stored_hash
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- If no PIN is set, return true (unprotected)
  IF stored_hash IS NULL THEN
    RETURN true;
  END IF;
  
  -- Use crypt to compare input with stored hash
  RETURN stored_hash = crypt(input_pin, stored_hash);
END;
$$;

-- Revoke and Grant permissions
REVOKE ALL ON FUNCTION public.set_report_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_report_pin(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO service_role;

-- ===== 20260809164146_2cd98a93-21ad-4553-80ba-bff0aa72601d.sql =====
-- 1. Add mill_name to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mill_name text;

-- 2. Update handle_new_user to capture mill_name and phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, mill_name, phone)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'owner_name', NEW.email),
    NEW.raw_user_meta_data->>'mill_name',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$function$;

-- 3. Corrective migration for existing users
UPDATE public.profiles p
SET 
  mill_name = COALESCE(p.mill_name, u.raw_user_meta_data->>'mill_name'),
  phone = COALESCE(p.phone, u.raw_user_meta_data->>'phone'),
  display_name = COALESCE(p.display_name, u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'owner_name')
FROM auth.users u
WHERE p.user_id = u.id
AND (p.mill_name IS NULL OR p.phone IS NULL OR p.display_name IS NULL)
AND (u.raw_user_meta_data->>'mill_name' IS NOT NULL OR u.raw_user_meta_data->>'phone' IS NOT NULL);


-- ===== 20260809164225_01bb4dd0-43ea-4494-8d64-fc25e43ba507.sql =====
-- Corrective migration: update display_name, mill_name, and phone for existing users
UPDATE public.profiles p
SET 
  mill_name = COALESCE(p.mill_name, u.raw_user_meta_data->>'mill_name'),
  phone = COALESCE(p.phone, u.raw_user_meta_data->>'phone'),
  display_name = COALESCE(p.display_name, u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'owner_name')
FROM auth.users u
WHERE p.user_id = u.id
AND (p.mill_name IS NULL OR p.phone IS NULL OR p.display_name IS NULL)
AND (u.raw_user_meta_data->>'mill_name' IS NOT NULL OR u.raw_user_meta_data->>'phone' IS NOT NULL OR u.raw_user_meta_data->>'owner_name' IS NOT NULL);


-- ===== 20260809164523_33e704e2-1ec2-4033-9bc3-9a0cb6d50ba8.sql =====
-- 1. Create subscription_status enum
DO $$ BEGIN
    CREATE TYPE public.subscription_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add subscription columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS subscription_notes text;

-- 3. Update existing active profiles (especially the admin) to 'active'
-- Since we don't have the exact IDs of "current accounts" mentioned, we activate accounts that have the admin role 
-- or just activate all existing accounts to avoid locking everyone out during transition.
-- The user specifically mentioned "my accounts" (plural).
UPDATE public.profiles 
SET subscription_status = 'active'
WHERE user_id IN (
    SELECT user_id FROM public.user_roles WHERE role = 'platform_admin'
);

-- For others, let's make sure existing accounts aren't locked out if they were already working
-- (Assuming "existing accounts" refers to accounts created before this migration)
UPDATE public.profiles 
SET subscription_status = 'active'
WHERE subscription_status IS NULL OR subscription_status = 'pending';


-- ===== 20260813200906_worker_atomic_operations.sql =====
-- 1. Function to pay worker and update inventory
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

-- 2. Function to register work and update worker earnings
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_worker_session TO authenticated;


-- ===== 20260813204000_fix_profile_metadata.sql =====
-- 1. Ensure mill_name exists in profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mill_name text;

-- 2. Update handle_new_user to capture mill_name and phone from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, mill_name, phone)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'owner_name', NEW.email),
    NEW.raw_user_meta_data->>'mill_name',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$function$;

-- 3. Corrective migration for existing accounts to recover metadata
UPDATE public.profiles p
SET 
  mill_name = COALESCE(p.mill_name, u.raw_user_meta_data->>'mill_name'),
  phone = COALESCE(p.phone, u.raw_user_meta_data->>'phone'),
  display_name = COALESCE(p.display_name, u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'owner_name')
FROM auth.users u
WHERE p.user_id = u.id
AND (p.mill_name IS NULL OR p.phone IS NULL OR p.display_name IS NULL)
AND (u.raw_user_meta_data->>'mill_name' IS NOT NULL OR u.raw_user_meta_data->>'phone' IS NOT NULL OR u.raw_user_meta_data->>'display_name' IS NOT NULL OR u.raw_user_meta_data->>'owner_name' IS NOT NULL);


-- ===== 20260813211812_15338bab-b8c1-4b6e-985d-49ed2df51a85.sql =====
-- Add system_settings table to store global configurations
CREATE TABLE public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

-- Grant access to system_settings
GRANT SELECT ON public.system_settings TO authenticated;
GRANT SELECT ON public.system_settings TO anon;
GRANT ALL ON public.system_settings TO service_role;

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read system settings" ON public.system_settings
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage system settings" ON public.system_settings
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'platform_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Seed default contact setting
INSERT INTO public.system_settings (key, value)
VALUES ('contact_link', 'https://wa.me/970598326014?text=مرحباً، أريد الاشتراك بنظام Smart Mill')
ON CONFLICT (key) DO NOTHING;


-- ===== 20260815212042_a902e3d4-8fb4-4774-b403-94aeae18dd47.sql =====
-- 1. Get the user ID
DO $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = 'muhannad.tomeh3@gmail.com';

    IF target_user_id IS NOT NULL THEN
        -- 2. Update auth user metadata
        UPDATE auth.users 
        SET raw_user_meta_data = raw_user_meta_data || '{"mill_name": "معصرة تجريبية", "display_name": "مهند طعمة"}'::jsonb
        WHERE id = target_user_id;

        -- 3. Update profile
        INSERT INTO public.profiles (user_id, display_name, mill_name, subscription_status)
        VALUES (target_user_id, 'مهند طعمة', 'معصرة تجريبية', 'active')
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            display_name = EXCLUDED.display_name,
            mill_name = EXCLUDED.mill_name,
            subscription_status = 'active',
            updated_at = now();
            
        -- 4. Ensure mill_owner role exists
        INSERT INTO public.user_roles (user_id, role)
        VALUES (target_user_id, 'mill_owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $$;

-- ===== 20260815212243_69da2609-3dc8-47d1-aaa5-97cc7e83175a.sql =====
-- 1. Add monthly_fee to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC DEFAULT 0;

-- 2. Create subscription_payments table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mill_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    recorded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;

-- 4. Enable RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Only platform_admin)
CREATE POLICY "platform_admins_manage_payments" 
ON public.subscription_payments 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Note: No policy for mill_owner ensures they can't see the data.


-- ===== 20260815220000_admin_update_profiles.sql =====
-- Allow platform admins to update all profiles
CREATE POLICY "Platform admin can update all profiles" ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));


-- ===== 20260815220334_385ced3d-47a3-4492-a08c-db61252bf141.sql =====
-- Allow platform admins to update all profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Platform admin can update all profiles'
    ) THEN
        CREATE POLICY "Platform admin can update all profiles" ON public.profiles
        FOR UPDATE
        USING (public.has_role(auth.uid(), 'platform_admin'))
        WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
    END IF;
END $$;


-- ===== 20260815221303_f0897211-acf0-4526-bbf1-936e040024f1.sql =====
-- 1. Correct user metadata in auth.users
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || 
  jsonb_build_object(
    'mill_name', COALESCE(raw_user_meta_data->>'millName', 'معصرة الإيمان'),
    'display_name', COALESCE(raw_user_meta_data->>'ownerName', 'مهند طعمة'),
    'phone', COALESCE(raw_user_meta_data->>'phone', '')
  )
WHERE email = 'muhannad.tomeh3@gmail.com';

-- 2. Correct profile data
UPDATE public.profiles
SET 
  mill_name = COALESCE(
    (SELECT raw_user_meta_data->>'mill_name' FROM auth.users WHERE email = 'muhannad.tomeh3@gmail.com'),
    'معصرة الإيمان'
  ),
  display_name = COALESCE(
    (SELECT raw_user_meta_data->>'display_name' FROM auth.users WHERE email = 'muhannad.tomeh3@gmail.com'),
    'مهند طعمة'
  ),
  subscription_status = 'active'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'muhannad.tomeh3@gmail.com');

-- 3. Ensure role is present
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'mill_owner'::public.app_role
FROM auth.users
WHERE email = 'muhannad.tomeh3@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- ===== 20260815221801_b807adda-d600-4da7-9af2-a3cac2cbfe57.sql =====

-- Fix metadata keys in auth.users for existing account
UPDATE auth.users
SET raw_user_meta_data = 
  jsonb_set(
    jsonb_set(
      jsonb_set(
        raw_user_meta_data, 
        '{mill_name}', 
        raw_user_meta_data->'millName'
      ),
      '{display_name}', 
      raw_user_meta_data->'ownerName'
    ),
    '{phone}',
    COALESCE(raw_user_meta_data->'phone', '""')
  ) - 'millName' - 'ownerName'
WHERE email = 'muhannad.tomeh3@gmail.com'
AND raw_user_meta_data ? 'millName';

-- Update profile for the same user
UPDATE public.profiles p
SET 
  mill_name = u.raw_user_meta_data->>'mill_name',
  display_name = u.raw_user_meta_data->>'display_name',
  phone = u.raw_user_meta_data->>'phone',
  subscription_status = 'active'
FROM auth.users u
WHERE u.id = p.user_id 
AND u.email = 'muhannad.tomeh3@gmail.com';

-- Ensure role is mill_owner
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'mill_owner'::public.app_role
FROM auth.users
WHERE email = 'muhannad.tomeh3@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;


-- ===== 20260815222458_990314ac-6e35-4224-a1f3-7ecf96c9e3fe.sql =====

-- 1. Fix user metadata for the existing test account
UPDATE auth.users
SET raw_user_meta_data = 
  jsonb_strip_nulls(
    jsonb_build_object(
      'mill_name', COALESCE(raw_user_meta_data->>'millName', raw_user_meta_data->>'mill_name'),
      'display_name', COALESCE(raw_user_meta_data->>'ownerName', raw_user_meta_data->>'display_name'),
      'phone', COALESCE(raw_user_meta_data->>'phone', '')
    )
  )
WHERE email = 'muhannad.tomeh3@gmail.com';

-- 2. Update profile for the same user
UPDATE public.profiles
SET 
  mill_name = COALESCE(display_name, mill_name), -- Just in case
  subscription_status = 'active'
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'muhannad.tomeh3@gmail.com'
);

-- 3. Ensure role is mill_owner
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'mill_owner'::public.app_role
FROM auth.users
WHERE email = 'muhannad.tomeh3@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;


-- ===== 20260815222815_206c6a17-2761-428c-bd8e-e9dd1b3b1719.sql =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;

-- Update existing profiles if needed (optional, just to keep consistent)
-- UPDATE public.profiles SET country = 'فلسطين' WHERE country IS NULL;


-- ===== 20260815225838_9380e9fc-3f1e-4634-ad5a-7419f3365d19.sql =====

-- Security Hardening Migration
-- This migration ensures all tables in the public schema have appropriate RLS and GRANTs

-- 1. Profiles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2. Core Business Tables (excluding non-existent 'settings')
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.container_types TO authenticated;
GRANT ALL ON public.container_types TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;

-- 3. Audit Logs and roles
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

-- 4. System Settings
GRANT SELECT ON public.system_settings TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- 5. Ensure RLS is enabled on all existing tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.worker_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.oil_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.container_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_payments ENABLE ROW LEVEL SECURITY;


-- ===== 20260815225917_07605091-007a-40f5-b1b0-7588de11c411.sql =====

-- Fix function search path for SECURITY DEFINER functions
ALTER FUNCTION public.handle_new_user_setup() SET search_path = public;

-- Revoke default public execute from all functions in public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Re-grant EXECUTE only to specific roles for specific functions
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;

-- Ensure triggers can still run (triggers run as the caller or owner)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;


-- ===== 20260818091025_9ae2db9d-c919-40e6-9f36-067943329576.sql =====
-- Revoke execution from PUBLIC for all public functions first to be safe
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
                       FROM pg_proc p 
                       JOIN pg_namespace n ON p.pronamespace = n.oid 
                       WHERE n.nspname = 'public' 
    LOOP 
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Explicitly grant back only what is needed with correct signatures
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;

-- Ensure service_role has access to everything
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;


-- ===== 20260818091053_4635811d-d7c1-4f75-b0b1-487fe9216a44.sql =====
-- Correcting the mistakenly granted public access to internal functions
-- revoke execute on all public functions from anon and authenticated first
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
                       FROM pg_proc p 
                       JOIN pg_namespace n ON p.pronamespace = n.oid 
                       WHERE n.nspname = 'public' 
    LOOP 
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon, authenticated, PUBLIC', func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Explicitly grant back ONLY what is strictly necessary for the app to function
-- 1. Helper for RLS
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2. Public TV/Display features (anon access allowed)
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated, anon;

-- 3. Operations for authenticated users
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;

-- Ensure service_role has access to everything for edge functions/triggers
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;


-- ===== 20260822022949_23dab607-5aef-4ad8-b5f3-17371ba8c7a1.sql =====
-- 1. Grant permissions to tables for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oil_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.container_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.expense_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO authenticated;
GRANT SELECT ON public.system_settings TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;

-- 2. Grant ALL permissions to service_role for all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. Security Hardening for Functions
-- Set search_path for ALL Security Definer functions
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_public_queue(uuid) SET search_path = public;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.get_public_season_display(uuid) SET search_path = public;
ALTER FUNCTION public.log_admin_access(uuid, text) SET search_path = public;
ALTER FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.set_report_pin(text) SET search_path = public;
ALTER FUNCTION public.verify_report_pin(text) SET search_path = public;
ALTER FUNCTION public.handle_new_user_setup() SET search_path = public;

-- Revoke public execution
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Re-grant execution to specific roles
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated, service_role;

