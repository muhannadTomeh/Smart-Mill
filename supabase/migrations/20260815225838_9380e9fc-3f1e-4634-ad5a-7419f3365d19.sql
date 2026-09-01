
-- Security Hardening Migration
-- This migration ensures all tables in the public schema have appropriate RLS and GRANTs

-- 1. Profiles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2. Core Business Tables (excluding non-existent 'settings')
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue TO authenticated;
GRANT ALL ON public.queue TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_records TO authenticated;
GRANT ALL ON public.work_records TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO authenticated;
GRANT ALL ON public.worker_payments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oil_transactions TO authenticated;
GRANT ALL ON public.oil_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.container_types TO authenticated;
GRANT ALL ON public.container_types TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;

-- 3. Audit Logs and roles
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

-- 4. System Settings
GRANT SELECT ON public.system_settings TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- 5. Ensure RLS is enabled on all existing tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.worker_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.oil_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.container_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_payments ENABLE ROW LEVEL SECURITY;
