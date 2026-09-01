-- Clean up security definer access to satisfy linter
REVOKE EXECUTE ON FUNCTION public.log_admin_access(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public;

-- Keep authenticated access for these specific functions as they are needed for the app logic,
-- but the functions themselves have internal checks.
