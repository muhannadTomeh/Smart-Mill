-- 1. Grant permissions to tables for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oil_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.container_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.expense_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO authenticated;
GRANT SELECT ON public.system_settings TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;

-- 2. Grant ALL permissions to service_role for all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. Security Hardening for Functions
-- Set search_path for ALL Security Definer functions
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_public_queue(uuid) SET search_path = public;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.get_public_season_display(uuid) SET search_path = public;
ALTER FUNCTION public.log_admin_access(uuid, text) SET search_path = public;
ALTER FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.set_report_pin(text) SET search_path = public;
ALTER FUNCTION public.verify_report_pin(text) SET search_path = public;
ALTER FUNCTION public.handle_new_user_setup() SET search_path = public;

-- Revoke public execution
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Re-grant execution to specific roles
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_queue_position() TO authenticated, service_role;
