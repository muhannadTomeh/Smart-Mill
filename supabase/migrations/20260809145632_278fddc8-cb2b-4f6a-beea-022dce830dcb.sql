-- 1. Create the audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid REFERENCES auth.users(id) NOT NULL,
    viewed_user_id uuid REFERENCES auth.users(id) NOT NULL,
    action text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 2. Grant permissions
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

-- 3. Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policy: Only platform_admin can view the logs
CREATE POLICY "Only platform admins can view audit logs"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'));

-- 5. Create the logging function (SECURITY DEFINER)
-- This allows the application to insert logs safely
CREATE OR REPLACE FUNCTION public.log_admin_access(target_user_id uuid, admin_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure the person calling this is actually a platform_admin
    IF public.has_role(auth.uid(), 'platform_admin') THEN
        INSERT INTO public.admin_audit_log (admin_user_id, viewed_user_id, action)
        VALUES (auth.uid(), target_user_id, admin_action);
    ELSE
        RAISE EXCEPTION 'Access denied: Only platform admins can log access.';
    END IF;
END;
$$;

-- 6. Revoke direct execute from everyone initially for the new function
REVOKE EXECUTE ON FUNCTION public.log_admin_access(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.log_admin_access(uuid, text) FROM authenticated;

-- 7. Grant execute specifically to authenticated (since the admin will call it)
-- RLS/Internal check inside the function handles the role verification
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
