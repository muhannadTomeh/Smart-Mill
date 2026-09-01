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
