
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
