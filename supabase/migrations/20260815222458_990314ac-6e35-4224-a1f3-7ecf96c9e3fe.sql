
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
