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
