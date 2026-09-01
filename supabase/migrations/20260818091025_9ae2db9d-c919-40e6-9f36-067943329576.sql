-- Revoke execution from PUBLIC for all public functions first to be safe
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
                       FROM pg_proc p 
                       JOIN pg_namespace n ON p.pronamespace = n.oid 
                       WHERE n.nspname = 'public' 
    LOOP 
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Explicitly grant back only what is needed with correct signatures
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;

-- Ensure service_role has access to everything
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
