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