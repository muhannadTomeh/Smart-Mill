DO $$
DECLARE
    t_name text;
    tables text[] := ARRAY[
        'profiles', 'seasons', 'queue', 'customers', 'invoices', 
        'workers', 'work_records', 'worker_payments', 'expenses', 
        'inventory', 'oil_transactions', 'container_types'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables LOOP
        -- Execute the policy creation for each table
        -- We use format to safely build the identifier-based SQL
        EXECUTE format(
            'CREATE POLICY "Platform admin can view all %I" ON public.%I 
             FOR SELECT 
             TO authenticated 
             USING (public.has_role(auth.uid(), %L))',
            t_name, t_name, 'platform_admin'
        );
    END LOOP;
END $$;
