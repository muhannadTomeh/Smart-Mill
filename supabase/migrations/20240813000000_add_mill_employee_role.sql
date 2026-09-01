-- 1. Add mill_employee to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mill_employee';

-- 2. Add employee_pin to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_pin TEXT;

-- 3. Update has_role to be more robust if needed (already is)
-- No changes needed to has_role.

-- 4. Secure the employee_pin: ensure only the owner (profile owner) or admin can read it
-- By default RLS on profiles allows users to read their own profile.
-- We might want to ensure only the owner can update it.

-- Grant permissions (if needed, but already granted in previous steps)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Function to set employee pin securely
CREATE OR REPLACE FUNCTION public.set_employee_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET employee_pin = CASE WHEN new_pin = '' THEN NULL ELSE crypt(new_pin, gen_salt('bf')) END
  WHERE id = auth.uid();
END;
$$;

-- Function to verify employee pin
-- This returns the user_id (mill_owner_id) if valid
CREATE OR REPLACE FUNCTION public.verify_employee_pin(owner_id uuid, input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = owner_id
      AND employee_pin IS NOT NULL
      AND employee_pin = crypt(input_pin, employee_pin)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin(uuid, text) TO anon;
