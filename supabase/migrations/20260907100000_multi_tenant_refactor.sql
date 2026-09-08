-- ============================================================
-- Migration: 20260907100000_multi_tenant_refactor.sql
-- Description: Complete, Secure Multi-Tenant Architecture & Authorization Refactoring
-- Principle: Platform Admin -> Mills (mills.id) -> Mill Memberships -> Operational & Financial Data
-- ============================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Standardize user_roles table and role column
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, role)
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'user_roles' 
          AND column_name = 'role' 
          AND udt_name <> 'text'
    ) THEN
        ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
    END IF;
END $$;

-- 3. Resolve subscription_status enum conflict and standardize to TEXT
DO $$ 
BEGIN
    -- Implicit cast if subscription_status enum exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        BEGIN
            CREATE CAST (text AS public.subscription_status) WITH INOUT AS IMPLICIT;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- If mills table already exists, convert subscription_status column to text
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'mills'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'mills' 
              AND column_name = 'subscription_status'
              AND udt_name <> 'text'
        ) THEN
            ALTER TABLE public.mills ALTER COLUMN subscription_status DROP DEFAULT;
            ALTER TABLE public.mills ALTER COLUMN subscription_status TYPE text USING subscription_status::text;
            ALTER TABLE public.mills ALTER COLUMN subscription_status SET DEFAULT 'active';
        END IF;
    END IF;

    -- If profiles table already exists, convert subscription_status column to text
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'profiles' 
              AND column_name = 'subscription_status'
              AND udt_name <> 'text'
        ) THEN
            ALTER TABLE public.profiles ALTER COLUMN subscription_status DROP DEFAULT;
            ALTER TABLE public.profiles ALTER COLUMN subscription_status TYPE text USING subscription_status::text;
            ALTER TABLE public.profiles ALTER COLUMN subscription_status SET DEFAULT 'active';
        END IF;
    END IF;
END $$;

-- ============================================================
-- 4. CREATE / STANDARDIZE THE TRUE TENANT TABLE: public.mills
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mill_code TEXT UNIQUE,
    country TEXT DEFAULT 'فلسطين',
    location TEXT,
    phone TEXT,
    secondary_phone TEXT,
    subscription_status TEXT DEFAULT 'active',
    subscription_notes TEXT,
    monthly_fee NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table already existed in a different shape
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS owner_user_id UUID;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS mill_code TEXT;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'فلسطين';
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS secondary_phone TEXT;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS subscription_notes TEXT;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC DEFAULT 0;
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.mills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 5. CREATE / STANDARDIZE THE MEMBERSHIP TABLE: public.mill_memberships
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mill_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mill_id UUID NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('mill_owner', 'mill_employee')),
    username TEXT UNIQUE,
    display_username TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT mill_memberships_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.mill_memberships ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.mill_memberships ADD COLUMN IF NOT EXISTS display_username TEXT;
ALTER TABLE public.mill_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure unique constraint on user_id exists if table already existed without it
DO $$
BEGIN
    -- Deduplicate any existing memberships by user_id
    DELETE FROM public.mill_memberships a
    USING public.mill_memberships b
    WHERE a.id > b.id AND a.user_id = b.user_id;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.mill_memberships'::regclass
          AND contype = 'u'
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.mill_memberships'::regclass AND attname = 'user_id')]
    ) THEN
        BEGIN
            ALTER TABLE public.mill_memberships ADD CONSTRAINT mill_memberships_user_id_key UNIQUE (user_id);
        EXCEPTION WHEN duplicate_table THEN
            NULL;
        WHEN OTHERS THEN
            NULL;
        END;
    END IF;
END $$;

-- Unique index on username (ignoring nulls, case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mill_memberships_username_lower 
ON public.mill_memberships (lower(username)) 
WHERE username IS NOT NULL;

-- ============================================================
-- 6. SECURITY HELPER FUNCTIONS (DEFINED EARLY FOR USE IN RLS)
-- ============================================================

-- Function: Check if a user is Platform Admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role = 'platform_admin'
  );
$$;

-- Function: Get the authoritative Mill ID for the authenticated caller
CREATE OR REPLACE FUNCTION public.get_current_mill_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mill_id 
  FROM public.mill_memberships 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$;

-- Function: Get Mill ID for any user
CREATE OR REPLACE FUNCTION public.get_user_mill_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mill_id 
  FROM public.mill_memberships 
  WHERE user_id = _user_id 
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_mill_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_mill_id(uuid) TO authenticated, anon, service_role;

-- ============================================================
-- 7. BACKFILL EXISTING MILLS AND MEMBERSHIPS (SAFELY PRESERVING ADMIN)
-- ============================================================
DO $$
DECLARE
    r RECORD;
    v_mill_id UUID;
    v_admin_ids UUID[];
    v_safe_mill_code TEXT;
    v_owner_username TEXT;
    v_emp_username TEXT;
BEGIN
    -- Gather all current platform admin IDs
    SELECT ARRAY_AGG(user_id) INTO v_admin_ids 
    FROM public.user_roles 
    WHERE role = 'platform_admin';

    IF v_admin_ids IS NULL THEN
        v_admin_ids := ARRAY[]::UUID[];
    END IF;

    -- A. Migrate Mill Owners from profiles (users who have no parent_mill_id and are NOT platform_admin)
    FOR r IN 
        SELECT p.* 
        FROM public.profiles p
        WHERE (p.parent_mill_id IS NULL)
          AND NOT (p.user_id = ANY(v_admin_ids))
    LOOP
        v_mill_id := NULL;

        -- 1. Try matching existing mill by id = r.user_id
        SELECT id INTO v_mill_id FROM public.mills WHERE id = r.user_id;

        -- 2. If not found, try matching by owner_user_id
        IF v_mill_id IS NULL THEN
            SELECT id INTO v_mill_id FROM public.mills WHERE owner_user_id = r.user_id LIMIT 1;
        END IF;

        -- 3. If still not found, try matching by mill_code (e.g. raefammar)
        IF v_mill_id IS NULL AND r.mill_code IS NOT NULL AND trim(r.mill_code) <> '' THEN
            SELECT id INTO v_mill_id FROM public.mills WHERE lower(trim(mill_code)) = lower(trim(r.mill_code)) LIMIT 1;
        END IF;

        -- If existing mill was found (matching this owner or this mill_code)
        IF v_mill_id IS NOT NULL THEN
            UPDATE public.mills
            SET 
                owner_user_id = COALESCE(owner_user_id, r.user_id),
                name = COALESCE(NULLIF(name, ''), r.mill_name, r.display_name, 'معصرة غير مسماة'),
                country = COALESCE(country, r.country, 'فلسطين'),
                location = COALESCE(location, r.mill_location),
                phone = COALESCE(phone, r.phone),
                secondary_phone = COALESCE(secondary_phone, r.secondary_phone)
            WHERE id = v_mill_id;
        ELSE
            -- Generate a safe unique mill_code to avoid collision
            v_safe_mill_code := NULLIF(trim(r.mill_code), '');
            IF v_safe_mill_code IS NOT NULL THEN
                IF EXISTS (SELECT 1 FROM public.mills WHERE lower(mill_code) = lower(v_safe_mill_code)) THEN
                    v_safe_mill_code := v_safe_mill_code || '_' || substr(r.user_id::text, 1, 4);
                END IF;
            END IF;

            INSERT INTO public.mills (
                id, owner_user_id, name, mill_code, country, location, phone, secondary_phone,
                subscription_status, subscription_notes, monthly_fee, created_at
            ) VALUES (
                r.user_id,
                r.user_id,
                COALESCE(r.mill_name, r.display_name, 'معصرة غير مسماة'),
                v_safe_mill_code,
                COALESCE(r.country, 'فلسطين'),
                r.mill_location,
                r.phone,
                r.secondary_phone,
                COALESCE(r.subscription_status::text, 'active'),
                r.subscription_notes,
                COALESCE(r.monthly_fee, 0),
                COALESCE(r.created_at, now())
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                country = EXCLUDED.country
            RETURNING id INTO v_mill_id;
        END IF;

        -- Create/update Mill Membership for the owner
        v_owner_username := lower(trim(COALESCE(r.mill_code, 'owner_' || substr(r.user_id::text, 1, 8))));
        IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE lower(username) = v_owner_username AND user_id <> r.user_id) THEN
            v_owner_username := v_owner_username || '_' || substr(r.user_id::text, 1, 4);
        END IF;

        -- Create/update Mill Membership for the owner
        IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE user_id = r.user_id) THEN
            UPDATE public.mill_memberships
            SET 
                mill_id = v_mill_id,
                role = 'mill_owner',
                display_username = COALESCE(display_username, r.display_name, 'مالك المعصرة'),
                username = COALESCE(username, v_owner_username)
            WHERE user_id = r.user_id;
        ELSE
            INSERT INTO public.mill_memberships (
                mill_id, user_id, role, display_username, username
            ) VALUES (
                v_mill_id,
                r.user_id,
                'mill_owner',
                COALESCE(r.display_name, 'مالك المعصرة'),
                v_owner_username
            );
        END IF;

        -- Ensure user_roles has mill_owner
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = r.user_id AND role = 'mill_owner') THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (r.user_id, 'mill_owner');
        END IF;
    END LOOP;

    -- B. Migrate Employees from profiles (users with parent_mill_id)
    FOR r IN 
        SELECT p.* 
        FROM public.profiles p
        WHERE (p.parent_mill_id IS NOT NULL)
          AND NOT (p.user_id = ANY(v_admin_ids))
    LOOP
        v_mill_id := NULL;

        -- Match parent mill by id or owner_user_id or from membership
        SELECT id INTO v_mill_id FROM public.mills WHERE id = r.parent_mill_id OR owner_user_id = r.parent_mill_id LIMIT 1;

        IF v_mill_id IS NULL THEN
            SELECT mill_id INTO v_mill_id FROM public.mill_memberships WHERE user_id = r.parent_mill_id LIMIT 1;
        END IF;

        -- If parent mill doesn't exist yet, create placeholder
        IF v_mill_id IS NULL THEN
            INSERT INTO public.mills (id, owner_user_id, name, country)
            VALUES (r.parent_mill_id, r.parent_mill_id, 'معصرة تابعة', COALESCE(r.country, 'فلسطين'))
            ON CONFLICT (id) DO NOTHING;
            v_mill_id := r.parent_mill_id;
        END IF;

        -- Create Mill Membership for the employee
        v_emp_username := lower(trim(COALESCE(r.phone, 'emp_' || substr(r.user_id::text, 1, 8))));
        IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE lower(username) = v_emp_username AND user_id <> r.user_id) THEN
            v_emp_username := v_emp_username || '_' || substr(r.user_id::text, 1, 4);
        END IF;

        IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE user_id = r.user_id) THEN
            UPDATE public.mill_memberships
            SET 
                mill_id = v_mill_id,
                role = 'mill_employee',
                display_username = COALESCE(display_username, r.display_name, 'موظف'),
                username = COALESCE(username, v_emp_username)
            WHERE user_id = r.user_id;
        ELSE
            INSERT INTO public.mill_memberships (
                mill_id, user_id, role, display_username, username
            ) VALUES (
                v_mill_id,
                r.user_id,
                'mill_employee',
                COALESCE(r.display_name, 'موظف'),
                v_emp_username
            );
        END IF;

        -- Ensure user_roles has mill_employee
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = r.user_id AND role = 'mill_employee') THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (r.user_id, 'mill_employee');
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- ============================================================
-- 8. ADD, BACKFILL, AND ENFORCE CASCADE ON ALL OPERATIONAL & FINANCIAL TABLES
-- ============================================================

DO $$
DECLARE
    tbl text;
    r_fk RECORD;
    tables text[] := ARRAY[
        'seasons', 'settings', 'queue', 'customers', 'invoices', 
        'expenses', 'expense_categories', 'workers', 'work_records', 
        'worker_payments', 'oil_transactions', 'inventory', 'daily_inventory',
        'container_types', 'subscription_payments', 'daily_closings',
        'customer_payments', 'financial_transactions'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        -- 0. Check if table exists
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- 1. Add mill_id column if not present
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS mill_id UUID;', tbl);

            -- 2. Backfill mill_id using user_id from mill_memberships or direct match with mills
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'user_id'
            ) THEN
                EXECUTE format('
                    UPDATE public.%I t
                    SET mill_id = COALESCE(
                        (SELECT mm.mill_id FROM public.mill_memberships mm WHERE mm.user_id = t.user_id LIMIT 1),
                        (SELECT m.id FROM public.mills m WHERE m.id = t.user_id OR m.owner_user_id = t.user_id LIMIT 1),
                        (SELECT id FROM public.mills LIMIT 1)
                    )
                    WHERE t.mill_id IS NULL AND t.user_id IS NOT NULL;
                ', tbl);
            END IF;

            -- For subscription_payments (which uses mill_user_id)
            IF tbl = 'subscription_payments' THEN
                EXECUTE '
                    UPDATE public.subscription_payments t
                    SET mill_id = COALESCE(
                        (SELECT mm.mill_id FROM public.mill_memberships mm WHERE mm.user_id = t.mill_user_id LIMIT 1),
                        (SELECT m.id FROM public.mills m WHERE m.id = t.mill_user_id OR m.owner_user_id = t.mill_user_id LIMIT 1),
                        (SELECT id FROM public.mills LIMIT 1)
                    )
                    WHERE t.mill_id IS NULL;
                ';
            END IF;

            -- 3. PURGE ORPHANED ROWS (Data whose mill was deleted or does not exist)
            EXECUTE format('
                DELETE FROM public.%I 
                WHERE mill_id IS NULL 
                   OR mill_id NOT IN (SELECT id FROM public.mills);
            ', tbl);

            -- 4. Drop any existing foreign key constraint on mill_id column
            FOR r_fk IN (
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = ('public.' || quote_ident(tbl))::regclass 
                  AND contype = 'f'
                  AND conkey = ARRAY[(
                      SELECT attnum FROM pg_attribute 
                      WHERE attrelid = ('public.' || quote_ident(tbl))::regclass 
                        AND attname = 'mill_id'
                  )]
            ) LOOP
                EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I;', tbl, r_fk.conname);
            END LOOP;

            -- 5. Enforce foreign key with ON DELETE CASCADE
            BEGIN
                EXECUTE format('
                    ALTER TABLE public.%I 
                    ADD CONSTRAINT %I 
                    FOREIGN KEY (mill_id) REFERENCES public.mills(id) ON DELETE CASCADE;
                ', tbl, 'fk_' || tbl || '_mill_id');
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;

            -- 6. Create index on mill_id
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (mill_id);', 'idx_' || tbl || '_mill_id', tbl);

            -- 7. Create composite index on (mill_id, season_id) if season_id exists
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'season_id'
            ) THEN
                EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (mill_id, season_id);', 'idx_' || tbl || '_mill_season', tbl);
            END IF;
        END IF;
    END LOOP;

    -- Clean and enforce ON DELETE CASCADE on mill_memberships as well
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'mill_memberships'
    ) THEN
        DELETE FROM public.mill_memberships 
        WHERE mill_id IS NULL OR mill_id NOT IN (SELECT id FROM public.mills);

        FOR r_fk IN (
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'public.mill_memberships'::regclass 
              AND contype = 'f'
              AND conkey = ARRAY[(
                  SELECT attnum FROM pg_attribute 
                  WHERE attrelid = 'public.mill_memberships'::regclass 
                    AND attname = 'mill_id'
              )]
        ) LOOP
            EXECUTE format('ALTER TABLE public.mill_memberships DROP CONSTRAINT IF EXISTS %I;', r_fk.conname);
        END LOOP;

        BEGIN
            ALTER TABLE public.mill_memberships 
            ADD CONSTRAINT fk_mill_memberships_mill_id 
            FOREIGN KEY (mill_id) REFERENCES public.mills(id) ON DELETE CASCADE;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
END $$;

-- Enforce UNIQUE(mill_id) on settings (one settings configuration per mill)
DO $$
BEGIN
    -- Deduplicate settings keeping the latest row per mill_id
    DELETE FROM public.settings s1
    USING public.settings s2
    WHERE s1.mill_id = s2.mill_id 
      AND s1.ctid < s2.ctid;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'settings_mill_id_key' AND conrelid = 'public.settings'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.settings ADD CONSTRAINT settings_mill_id_key UNIQUE (mill_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
END $$;

-- Enforce UNIQUE(mill_id, season_id) on inventory
DO $$
BEGIN
    -- Deduplicate inventory keeping the latest row per (mill_id, season_id)
    DELETE FROM public.inventory i1
    USING public.inventory i2
    WHERE i1.mill_id = i2.mill_id 
      AND (i1.season_id = i2.season_id OR (i1.season_id IS NULL AND i2.season_id IS NULL))
      AND i1.ctid < i2.ctid;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'inventory_mill_season_key' AND conrelid = 'public.inventory'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.inventory ADD CONSTRAINT inventory_mill_season_key UNIQUE (mill_id, season_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
END $$;

-- ============================================================
-- 9. REBUILD ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Helper macro: Drop all existing policies on a table
CREATE OR REPLACE FUNCTION public.drop_all_policies_on_table(p_table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = p_table_name
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, p_table_name);
    END LOOP;
END;
$$;

-- 9.1 RLS on public.mills
SELECT public.drop_all_policies_on_table('mills');
ALTER TABLE public.mills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin full access on mills"
ON public.mills FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Mill members view own mill"
ON public.mills FOR SELECT TO authenticated
USING (id = public.get_current_mill_id());

CREATE POLICY "Mill owner update own mill"
ON public.mills FOR UPDATE TO authenticated
USING (
    id = public.get_current_mill_id() 
    AND EXISTS (
        SELECT 1 FROM public.mill_memberships 
        WHERE user_id = auth.uid() AND role = 'mill_owner'
    )
)
WITH CHECK (
    id = public.get_current_mill_id() 
    AND EXISTS (
        SELECT 1 FROM public.mill_memberships 
        WHERE user_id = auth.uid() AND role = 'mill_owner'
    )
);

-- 9.2 RLS on public.mill_memberships
SELECT public.drop_all_policies_on_table('mill_memberships');
ALTER TABLE public.mill_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin full access on mill_memberships"
ON public.mill_memberships FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Mill members view memberships in same mill"
ON public.mill_memberships FOR SELECT TO authenticated
USING (mill_id = public.get_current_mill_id() OR user_id = auth.uid());

CREATE POLICY "Mill owner manage memberships in own mill"
ON public.mill_memberships FOR ALL TO authenticated
USING (
    mill_id = public.get_current_mill_id() 
    AND EXISTS (
        SELECT 1 FROM public.mill_memberships 
        WHERE user_id = auth.uid() AND role = 'mill_owner'
    )
)
WITH CHECK (
    mill_id = public.get_current_mill_id() 
    AND EXISTS (
        SELECT 1 FROM public.mill_memberships 
        WHERE user_id = auth.uid() AND role = 'mill_owner'
    )
);

-- 9.3 RLS on public.user_roles
SELECT public.drop_all_policies_on_table('user_roles');
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin manage all user_roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Users view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 9.4 RLS on public.profiles
SELECT public.drop_all_policies_on_table('profiles');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin manage all profiles"
ON public.profiles FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Users read their own profile or mill peers"
ON public.profiles FOR SELECT TO authenticated
USING (
    user_id = auth.uid() 
    OR EXISTS (
        SELECT 1 FROM public.mill_memberships m1
        JOIN public.mill_memberships m2 ON m1.mill_id = m2.mill_id
        WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.user_id
    )
);

CREATE POLICY "Users update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 9.5 RLS on all tenant operational and financial tables
DO $$
DECLARE
    tbl text;
    tenant_tables text[] := ARRAY[
        'seasons', 'settings', 'queue', 'customers', 'invoices', 
        'expenses', 'expense_categories', 'workers', 'work_records', 
        'worker_payments', 'oil_transactions', 'inventory', 
        'container_types', 'financial_transactions', 'daily_closings', 
        'customer_payments', 'subscription_payments'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables LOOP
        PERFORM public.drop_all_policies_on_table(tbl);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        EXECUTE format('
            CREATE POLICY "Tenant isolation for %I"
            ON public.%I FOR ALL TO authenticated
            USING (
                public.is_platform_admin(auth.uid()) 
                OR mill_id = public.get_current_mill_id()
            )
            WITH CHECK (
                public.is_platform_admin(auth.uid()) 
                OR mill_id = public.get_current_mill_id()
            );
        ', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================
-- 10. REWRITE AND SECURE ATOMIC RPC FUNCTIONS
-- ============================================================

-- 10.1: Atomic Expense Recording
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
  v_caller_id UUID := auth.uid();
  v_mill_id UUID;
  v_expense_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ المصروف يجب أن يكون أكبر من صفر';
  END IF;

  IF public.is_platform_admin(v_caller_id) THEN
    v_mill_id := COALESCE(p_target_user_id, public.get_current_mill_id());
  ELSE
    v_mill_id := public.get_current_mill_id();
  END IF;

  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user does not belong to a mill';
  END IF;

  -- 1. Insert into expenses
  INSERT INTO public.expenses (
    mill_id, user_id, season_id, category, amount, description
  ) VALUES (
    v_mill_id, v_caller_id, p_season_id, p_category, p_amount, p_description
  )
  RETURNING id INTO v_expense_id;

  -- 2. Insert into financial_transactions
  INSERT INTO public.financial_transactions (
    mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, description, created_by
  ) VALUES (
    v_mill_id, p_season_id, 'expense', p_category, p_amount, 'out', 'cash',
    'expense', v_expense_id, p_description, v_caller_id
  );

  -- 3. Update inventory cash
  INSERT INTO public.inventory (mill_id, user_id, season_id, total_oil, total_cash)
  VALUES (v_mill_id, v_caller_id, p_season_id, 0, -p_amount)
  ON CONFLICT (mill_id, season_id)
  DO UPDATE SET
    total_cash = public.inventory.total_cash - p_amount,
    updated_at = now();

  RETURN v_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_expense_atomic(UUID, TEXT, NUMERIC, TEXT, UUID) TO authenticated, service_role;

-- 10.2: Atomic Oil Trading
CREATE OR REPLACE FUNCTION public.record_oil_trade_atomic(
  p_season_id UUID,
  p_type TEXT,
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
  v_caller_id UUID := auth.uid();
  v_mill_id UUID;
  v_total_price NUMERIC;
  v_tx_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount <= 0 OR p_price <= 0 THEN
    RAISE EXCEPTION 'الكمية والسعر يجب أن يكونا أكبر من صفر';
  END IF;

  IF public.is_platform_admin(v_caller_id) THEN
    v_mill_id := COALESCE(p_target_user_id, public.get_current_mill_id());
  ELSE
    v_mill_id := public.get_current_mill_id();
  END IF;

  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user does not belong to a mill';
  END IF;

  v_total_price := p_amount * p_price;

  -- 1. Insert into oil_transactions
  INSERT INTO public.oil_transactions (
    mill_id, user_id, season_id, type, amount, price, total_price, party_name, notes
  ) VALUES (
    v_mill_id, v_caller_id, p_season_id, p_type, p_amount, p_price, v_total_price, p_party_name, p_notes
  )
  RETURNING id INTO v_tx_id;

  -- 2. Insert financial transaction & update inventory
  IF p_type = 'buy' THEN
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'stock_purchase', 'oil_inventory', v_total_price, 'out', 'cash',
      'oil_transaction', v_tx_id, 'supplier', p_party_name, p_notes, v_caller_id
    );

    INSERT INTO public.inventory (mill_id, user_id, season_id, total_oil, total_cash)
    VALUES (v_mill_id, v_caller_id, p_season_id, p_amount, -v_total_price)
    ON CONFLICT (mill_id, season_id)
    DO UPDATE SET
      total_oil = public.inventory.total_oil + p_amount,
      total_cash = public.inventory.total_cash - v_total_price,
      updated_at = now();
  ELSE
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'stock_sale', 'oil_inventory', v_total_price, 'in', 'cash',
      'oil_transaction', v_tx_id, 'customer', p_party_name, p_notes, v_caller_id
    );

    INSERT INTO public.inventory (mill_id, user_id, season_id, total_oil, total_cash)
    VALUES (v_mill_id, v_caller_id, p_season_id, -p_amount, v_total_price)
    ON CONFLICT (mill_id, season_id)
    DO UPDATE SET
      total_oil = public.inventory.total_oil - p_amount,
      total_cash = public.inventory.total_cash + v_total_price,
      updated_at = now();
  END IF;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_oil_trade_atomic(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID) TO authenticated, service_role;

-- 10.3: Atomic Invoice Creation & Settlement
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
  v_caller_id uuid := auth.uid();
  v_invoice_id uuid;
  v_mill_id uuid;
  v_pay_method public.financial_payment_method;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.is_platform_admin(v_caller_id) THEN
    v_mill_id := COALESCE(p_target_user_id, public.get_current_mill_id());
  ELSE
    v_mill_id := public.get_current_mill_id();
  END IF;

  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user does not belong to a mill';
  END IF;

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
    mill_id, user_id, customer_id, customer_name, oil_produced,
    container_count, container_type, payment_type,
    oil_amount, cash_amount, total_display, season_id
  ) VALUES (
    v_mill_id, v_caller_id, p_customer_id, p_customer_name, p_oil_produced,
    p_container_count, p_container_type, p_payment_type,
    p_oil_amount, p_cash_amount, p_total_display, p_season_id
  )
  RETURNING id INTO v_invoice_id;

  -- 2. Record Financial Transaction if cash collected
  IF p_cash_amount > 0 THEN
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_id, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'income', 'pressing_revenue', p_cash_amount, 'in', v_pay_method,
      'invoice', v_invoice_id, 'customer', p_customer_id, p_customer_name, 'فاتورة عصر وزيت #' || v_invoice_id, v_caller_id
    );
  END IF;

  -- 3. Update queue status
  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue
    SET status = 'done'
    WHERE id = p_queue_id AND mill_id = v_mill_id;
  END IF;

  -- 4. Update inventory
  INSERT INTO public.inventory (mill_id, user_id, season_id, total_oil, total_cash)
  VALUES (v_mill_id, v_caller_id, p_season_id, p_oil_amount, p_cash_amount)
  ON CONFLICT (mill_id, season_id)
  DO UPDATE SET
    total_oil = public.inventory.total_oil + p_oil_amount,
    total_cash = public.inventory.total_cash + p_cash_amount,
    updated_at = now();

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(UUID, TEXT, NUMERIC, INTEGER, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, UUID, UUID) TO authenticated, service_role;

-- 10.4: Atomic Worker Payment & Settlement
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
    v_caller_id UUID := auth.uid();
    v_mill_id UUID;
    v_worker_name TEXT;
    v_payment_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_amount <= 0 THEN
      RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
    END IF;

    IF public.is_platform_admin(v_caller_id) THEN
      v_mill_id := COALESCE(p_user_id, public.get_current_mill_id());
    ELSE
      v_mill_id := public.get_current_mill_id();
    END IF;

    IF v_mill_id IS NULL THEN
      RAISE EXCEPTION 'Access denied: user does not belong to a mill';
    END IF;

    SELECT name INTO v_worker_name
    FROM public.workers
    WHERE id = p_worker_id AND mill_id = v_mill_id;

    IF v_worker_name IS NULL THEN
      RAISE EXCEPTION 'العامل غير موجود في هذه المعصرة';
    END IF;

    -- 1. Insert worker payment
    INSERT INTO public.worker_payments (mill_id, user_id, season_id, worker_id, amount, notes)
    VALUES (v_mill_id, v_caller_id, p_season_id, p_worker_id, p_amount, p_notes)
    RETURNING id INTO v_payment_id;

    -- 2. Insert financial transaction
    INSERT INTO public.financial_transactions (
      mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, party_type, party_id, party_name, description, created_by
    ) VALUES (
      v_mill_id, p_season_id, 'worker_payment', 'wages', p_amount, 'out', 'cash',
      'worker_payment', v_payment_id, 'worker', p_worker_id, v_worker_name, p_notes, v_caller_id
    );

    -- 3. Update worker total_paid
    UPDATE public.workers
    SET total_paid = total_paid + p_amount,
        updated_at = now()
    WHERE id = p_worker_id AND mill_id = v_mill_id;

    -- 4. Update inventory cash
    INSERT INTO public.inventory (mill_id, user_id, season_id, total_oil, total_cash)
    VALUES (v_mill_id, v_caller_id, p_season_id, 0, -p_amount)
    ON CONFLICT (mill_id, season_id)
    DO UPDATE SET
      total_cash = public.inventory.total_cash - p_amount,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(UUID, UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- 10.5: Atomic Customer Payment Recording
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
  v_caller_id UUID := auth.uid();
  v_mill_id UUID;
  v_customer_name TEXT;
  v_payment_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ المسدد يجب أن يكون أكبر من صفر';
  END IF;

  IF public.is_platform_admin(v_caller_id) THEN
    v_mill_id := COALESCE(p_target_user_id, public.get_current_mill_id());
  ELSE
    v_mill_id := public.get_current_mill_id();
  END IF;

  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user does not belong to a mill';
  END IF;

  SELECT name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND mill_id = v_mill_id;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'الزبون غير موجود في هذه المعصرة';
  END IF;

  -- 1. Insert customer payment
  INSERT INTO public.customer_payments (
    mill_id, season_id, customer_id, amount, payment_method, notes, created_by
  ) VALUES (
    v_mill_id, p_season_id, p_customer_id, p_amount, 'cash', p_notes, v_caller_id
  )
  RETURNING id INTO v_payment_id;

  -- 2. Insert into financial_transactions
  INSERT INTO public.financial_transactions (
    mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, party_type, party_id, party_name, description, created_by
  ) VALUES (
    v_mill_id, p_season_id, 'customer_payment', 'debt_settlement', p_amount, 'in', 'cash',
    'customer_payment', v_payment_id, 'customer', p_customer_id, v_customer_name, p_notes, v_caller_id
  );

  -- 3. Update inventory cash
  INSERT INTO public.inventory (mill_id, user_id, season_id, total_oil, total_cash)
  VALUES (v_mill_id, v_caller_id, p_season_id, 0, p_amount)
  ON CONFLICT (mill_id, season_id)
  DO UPDATE SET
    total_cash = public.inventory.total_cash + p_amount,
    updated_at = now();

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_customer_payment_atomic(UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;

-- 10.6: Void Financial Transaction
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
  v_caller_id UUID := auth.uid();
  v_tx RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_tx
  FROM public.financial_transactions
  WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحركة المالية غير موجودة';
  END IF;

  IF NOT public.is_platform_admin(v_caller_id) AND v_tx.mill_id <> public.get_current_mill_id() THEN
    RAISE EXCEPTION 'غير مصرح لك بإلغاء حركة تابعة لمعصرة أخرى';
  END IF;

  IF v_tx.status = 'voided' THEN
    RAISE EXCEPTION 'هذه الحركة تم إلغاؤها مسبقاً';
  END IF;

  -- 1. Mark as voided
  UPDATE public.financial_transactions
  SET status = 'voided',
      voided_at = now(),
      voided_by = v_caller_id,
      void_reason = p_reason
  WHERE id = p_transaction_id;

  -- 2. Reverse inventory cash balance if direction was in or out
  IF v_tx.direction = 'in' THEN
    UPDATE public.inventory
    SET total_cash = total_cash - v_tx.amount,
        updated_at = now()
    WHERE mill_id = v_tx.mill_id AND season_id = v_tx.season_id;
  ELSIF v_tx.direction = 'out' THEN
    UPDATE public.inventory
    SET total_cash = total_cash + v_tx.amount,
        updated_at = now()
    WHERE mill_id = v_tx.mill_id AND season_id = v_tx.season_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_financial_transaction(UUID, TEXT) TO authenticated, service_role;

-- 10.7: Admin Create Mill RPC
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
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_mill_id UUID;
  v_owner_user_id UUID;
  v_clean_username TEXT;
  v_email TEXT;
BEGIN
  -- Strict permission check: only platform_admin
  IF NOT public.is_platform_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Only platform admins can create mills';
  END IF;

  v_clean_username := lower(trim(p_username));
  IF v_clean_username IS NOT NULL AND v_clean_username <> '' THEN
    -- Check uniqueness across memberships
    IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE lower(username) = v_clean_username) THEN
      RAISE EXCEPTION 'اسم المستخدم "%" مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر', v_clean_username;
    END IF;
    v_email := v_clean_username || '@smartmill.com';
  ELSIF p_owner_email IS NOT NULL AND p_owner_email <> '' THEN
    v_email := lower(trim(p_owner_email));
  ELSE
    RAISE EXCEPTION 'يجب تحديد اسم مستخدم أو بريد إلكتروني لصاحب المعصرة';
  END IF;

  -- 1. Create Mill record
  INSERT INTO public.mills (
    name, country, phone, secondary_phone, subscription_status
  ) VALUES (
    p_mill_name, p_country, p_owner_phone, p_owner_email, 'active'
  )
  RETURNING id INTO v_mill_id;

  -- 2. Create or link auth user
  SELECT id INTO v_owner_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_owner_user_id IS NULL THEN
    v_owner_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      v_owner_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt(COALESCE(p_password, '12345678'), gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'display_name', p_owner_name,
        'mill_name', p_mill_name,
        'username', v_clean_username,
        'phone', p_owner_phone,
        'country', p_country
      ),
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_owner_user_id::text,
      v_owner_user_id,
      jsonb_build_object('sub', v_owner_user_id::text, 'email', v_email),
      'email',
      v_owner_user_id::text,
      now(),
      now(),
      now()
    );
  END IF;

  -- 3. Create profile
  INSERT INTO public.profiles (
    user_id, display_name, mill_name, phone, secondary_phone, country, subscription_status
  ) VALUES (
    v_owner_user_id, p_owner_name, p_mill_name, p_owner_phone, p_owner_email, p_country, 'active'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    mill_name = EXCLUDED.mill_name,
    display_name = EXCLUDED.display_name;

  -- 4. Create Mill Membership
  IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE user_id = v_owner_user_id) THEN
    UPDATE public.mill_memberships
    SET mill_id = v_mill_id, role = 'mill_owner', display_username = p_owner_name, username = v_clean_username
    WHERE user_id = v_owner_user_id;
  ELSE
    INSERT INTO public.mill_memberships (
      mill_id, user_id, role, username, display_username
    ) VALUES (
      v_mill_id, v_owner_user_id, 'mill_owner', v_clean_username, p_owner_name
    );
  END IF;

  -- 5. Assign mill_owner role in user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_owner_user_id, 'mill_owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 6. Initialize mill settings
  INSERT INTO public.settings (mill_id, user_id)
  VALUES (v_mill_id, v_owner_user_id)
  ON CONFLICT (mill_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'mill_id', v_mill_id,
    'user_id', v_owner_user_id,
    'username', v_clean_username,
    'email', v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_mill(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 10.8: Admin Create Cashier / Employee RPC
CREATE OR REPLACE FUNCTION public.admin_create_cashier(
  p_parent_mill_id UUID,
  p_display_name TEXT,
  p_username TEXT,
  p_password TEXT,
  p_mill_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_username TEXT;
  v_email TEXT;
  v_emp_user_id UUID;
  v_target_mill_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Resolve target mill: if caller is platform_admin, allow p_parent_mill_id.
  -- Otherwise, verify caller is mill_owner of p_parent_mill_id.
  IF public.is_platform_admin(v_caller_id) THEN
    v_target_mill_id := p_parent_mill_id;
  ELSE
    SELECT mill_id INTO v_target_mill_id
    FROM public.mill_memberships
    WHERE user_id = v_caller_id AND role = 'mill_owner';

    IF v_target_mill_id IS NULL OR (p_parent_mill_id IS NOT NULL AND v_target_mill_id <> p_parent_mill_id) THEN
      RAISE EXCEPTION 'غير مصرح لك بإضافة موظف لهذه المعصرة';
    END IF;
  END IF;

  IF v_target_mill_id IS NULL THEN
    RAISE EXCEPTION 'المعصرة المحددة غير موجودة';
  END IF;

  v_clean_username := lower(trim(p_username));
  IF v_clean_username IS NULL OR v_clean_username = '' THEN
    RAISE EXCEPTION 'يرجى إدخال اسم مستخدم صالح';
  END IF;

  -- Enforce Globally Unique Username
  IF EXISTS (SELECT 1 FROM public.mill_memberships WHERE lower(username) = v_clean_username) THEN
    RAISE EXCEPTION 'اسم المستخدم "%" مستخدم بالفعل في النظام، يرجى اختيار اسم آخر', v_clean_username;
  END IF;

  v_email := v_clean_username || '@smartmill.com';

  -- Check if auth user exists
  SELECT id INTO v_emp_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_emp_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'حساب البريد/المستخدم "%" مسجل مسبقاً', v_email;
  END IF;

  -- Create Auth user
  v_emp_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
  ) VALUES (
    v_emp_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', p_display_name,
      'username', v_clean_username,
      'mill_id', v_target_mill_id
    ),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_emp_user_id::text,
    v_emp_user_id,
    jsonb_build_object('sub', v_emp_user_id::text, 'email', v_email),
    'email',
    v_emp_user_id::text,
    now(),
    now(),
    now()
  );

  -- Create Profile
  INSERT INTO public.profiles (
    user_id, display_name, phone, employee_pin, subscription_status
  ) VALUES (
    v_emp_user_id, p_display_name, v_clean_username, p_password, 'active'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name;

  -- Create Mill Membership
  INSERT INTO public.mill_memberships (
    mill_id, user_id, role, username, display_username
  ) VALUES (
    v_target_mill_id, v_emp_user_id, 'mill_employee', v_clean_username, p_display_name
  );

  -- Assign mill_employee role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_emp_user_id, 'mill_employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_emp_user_id,
    'mill_id', v_target_mill_id,
    'username', v_clean_username,
    'email', v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_cashier(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 10.9: Lookup Cashier by globally unique username
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
  v_clean TEXT := lower(trim(p_username));
  v_count INT;
  v_email TEXT;
BEGIN
  SELECT count(*), min(u.email) INTO v_count, v_email
  FROM public.mill_memberships mm
  JOIN auth.users u ON mm.user_id = u.id
  WHERE lower(mm.username) = v_clean;

  IF v_count = 1 THEN
    RETURN QUERY SELECT v_email, false;
  ELSIF v_count > 1 THEN
    RETURN QUERY SELECT NULL::TEXT, true;
  ELSE
    -- Check direct auth email match (e.g. {username}@smartmill.com)
    SELECT email INTO v_email
    FROM auth.users
    WHERE lower(email) = v_clean || '@smartmill.com';

    IF v_email IS NOT NULL THEN
      RETURN QUERY SELECT v_email, false;
    ELSE
      RETURN QUERY SELECT NULL::TEXT, false;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_cashier_by_username(TEXT) TO anon, authenticated, service_role;

-- 10.10: Admin Delete Mill RPC (with CASCADE cleanup)
CREATE OR REPLACE FUNCTION public.admin_delete_mill(
  p_mill_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_mill_name TEXT;
  v_member RECORD;
BEGIN
  -- Strict permission check: only platform_admin
  IF NOT public.is_platform_admin(v_caller_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بحذف المعاصر. للمشرف العام فقط.';
  END IF;

  SELECT name INTO v_mill_name FROM public.mills WHERE id = p_mill_id;
  IF v_mill_name IS NULL THEN
    RAISE EXCEPTION 'المعصرة غير موجودة.';
  END IF;

  -- Delete cashier/employee auth accounts if any
  FOR v_member IN 
    SELECT user_id FROM public.mill_memberships 
    WHERE mill_id = p_mill_id AND role = 'mill_employee'
  LOOP
    IF NOT public.is_platform_admin(v_member.user_id) THEN
      DELETE FROM auth.users WHERE id = v_member.user_id;
    END IF;
  END LOOP;

  -- Delete the mill itself (CASCADE will automatically delete all operational/financial data and memberships)
  DELETE FROM public.mills WHERE id = p_mill_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('تم حذف معصرة %s وجميع البيانات التابعة لها بنجاح', v_mill_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_mill(UUID) TO authenticated, service_role;

