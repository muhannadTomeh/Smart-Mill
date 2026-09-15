-- Harden the remaining platform audit RPC and remove disabled SQL admin routes.
CREATE OR REPLACE FUNCTION public.log_admin_access(admin_action text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;
  INSERT INTO public.admin_audit_log (admin_user_id, viewed_user_id, action)
  VALUES (auth.uid(), target_user_id, admin_action);
END;
$$;

-- These SQL entry points are deliberately disabled; account/mill provisioning
-- goes through the authenticated Edge Function and Credential Vault workflow.
REVOKE ALL ON FUNCTION public.admin_create_cashier(text,text,text,text,text),
  public.admin_create_mill(text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;

-- This maintenance helper has no API grant, but receives a safe immutable path
-- to eliminate the advisor finding as defense in depth.
ALTER FUNCTION public.drop_all_policies_on_table(text) SET search_path = public;
