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