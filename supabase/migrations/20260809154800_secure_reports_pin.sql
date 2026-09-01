-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add report_pin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS report_pin text;

-- Function to set report PIN (hashes the input)
CREATE OR REPLACE FUNCTION public.set_report_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET report_pin = CASE 
    WHEN new_pin IS NULL OR new_pin = '' THEN NULL 
    ELSE crypt(new_pin, gen_salt('bf')) 
  END
  WHERE user_id = auth.uid();
END;
$$;

-- Function to verify report PIN
CREATE OR REPLACE FUNCTION public.verify_report_pin(input_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT report_pin INTO stored_hash
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- If no PIN is set, return true (unprotected)
  IF stored_hash IS NULL THEN
    RETURN true;
  END IF;
  
  -- Use crypt to compare input with stored hash
  RETURN stored_hash = crypt(input_pin, stored_hash);
END;
$$;

-- Revoke and Grant permissions
REVOKE ALL ON FUNCTION public.set_report_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_report_pin(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO service_role;
