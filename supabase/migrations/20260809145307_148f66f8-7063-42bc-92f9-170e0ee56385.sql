DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Loop through all SECURITY DEFINER functions in the public schema
    FOR func_record IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        -- Revoke EXECUTE from public (anon) and authenticated roles
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM public', func_record.proname, func_record.args);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', func_record.proname, func_record.args);
    END LOOP;
END $$;
