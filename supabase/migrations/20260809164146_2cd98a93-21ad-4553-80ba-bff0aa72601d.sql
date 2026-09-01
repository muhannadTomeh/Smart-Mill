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
