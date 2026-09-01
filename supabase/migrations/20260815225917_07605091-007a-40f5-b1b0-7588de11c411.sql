
-- Fix function search path for SECURITY DEFINER functions
ALTER FUNCTION public.handle_new_user_setup() SET search_path = public;

-- Revoke default public execute from all functions in public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Re-grant EXECUTE only to specific roles for specific functions
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;

-- Ensure triggers can still run (triggers run as the caller or owner)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;
