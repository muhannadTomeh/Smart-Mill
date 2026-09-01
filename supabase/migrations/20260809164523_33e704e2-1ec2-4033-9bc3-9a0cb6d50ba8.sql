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
