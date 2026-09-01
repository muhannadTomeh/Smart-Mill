
-- Fix critical permission issue for has_role
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Ensure other required business logic functions are executable by authenticated users
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated;

-- Handle pay_worker_and_settle if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pay_worker_and_settle') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(uuid, uuid, numeric, text) TO authenticated';
    END IF;
END $$;
