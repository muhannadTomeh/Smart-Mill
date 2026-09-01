-- Correcting the mistakenly granted public access to internal functions
-- revoke execute on all public functions from anon and authenticated first
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
                       FROM pg_proc p 
                       JOIN pg_namespace n ON p.pronamespace = n.oid 
                       WHERE n.nspname = 'public' 
    LOOP 
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon, authenticated, PUBLIC', func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Explicitly grant back ONLY what is strictly necessary for the app to function
-- 1. Helper for RLS
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2. Public TV/Display features (anon access allowed)
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated, anon;

-- 3. Operations for authenticated users
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;

-- Ensure service_role has access to everything for edge functions/triggers
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
