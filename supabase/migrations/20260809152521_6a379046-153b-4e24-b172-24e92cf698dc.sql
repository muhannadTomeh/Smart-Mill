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
