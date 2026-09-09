-- =============================================================================
-- SMART-MILL SECURITY HARDENING & CANONICAL RPC PRIVILEGES
-- =============================================================================

-- 1. DROP LEGACY FUNCTION OVERLOADS (CONTAINING p_target_user_id / DIRECT SQL INSERTS)
DROP FUNCTION IF EXISTS public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.record_customer_payment_atomic(uuid, uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.record_expense_atomic(uuid, text, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.record_oil_trade_atomic(uuid, text, numeric, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS public.admin_create_cashier(uuid, text, text, text, text);

-- 2. REVOKE SENSITIVE FUNCTION PRIVILEGES FROM ANON AND AUTHENTICATED
-- Exact live signature: drop_all_policies_on_table(p_table_name text)
REVOKE ALL ON FUNCTION public.drop_all_policies_on_table(text) FROM anon, authenticated, PUBLIC;

-- Exact live signature: can_access_mill_data(p_owner_user_id uuid)
REVOKE ALL ON FUNCTION public.can_access_mill_data(uuid) FROM anon, PUBLIC;

-- Exact live signature: get_user_mill_id(_user_id uuid)
REVOKE ALL ON FUNCTION public.get_user_mill_id(uuid) FROM anon, PUBLIC;

-- Exact live signature: log_admin_access(admin_action text, target_user_id uuid)
REVOKE ALL ON FUNCTION public.log_admin_access(text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, uuid) TO authenticated, service_role;

-- Exact live signature: is_cashier()
REVOKE ALL ON FUNCTION public.is_cashier() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_cashier() TO authenticated, service_role;

-- Exact live signature: rls_auto_enable()
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, PUBLIC;

-- 3. REVOKE ANON AND PUBLIC FROM CANONICAL FINANCIAL RPCs (DEFENSE-IN-DEPTH)
-- Exact live signature: create_invoice_and_settle (11 args)
REVOKE ALL ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated, service_role;

-- Exact live signature: record_customer_payment_atomic (4 args)
REVOKE ALL ON FUNCTION public.record_customer_payment_atomic(uuid, uuid, numeric, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_payment_atomic(uuid, uuid, numeric, text) TO authenticated, service_role;

-- Exact live signature: record_expense_atomic (4 args)
REVOKE ALL ON FUNCTION public.record_expense_atomic(uuid, text, numeric, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_expense_atomic(uuid, text, numeric, text) TO authenticated, service_role;

-- Exact live signature: record_oil_trade_atomic (5 args)
REVOKE ALL ON FUNCTION public.record_oil_trade_atomic(uuid, text, numeric, numeric, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_oil_trade_atomic(uuid, text, numeric, numeric, text) TO authenticated, service_role;

-- Exact live signature: pay_worker_and_settle (5 args)
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid, uuid, uuid, numeric, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- Exact live signature: register_worker_session (5 args)
REVOKE ALL ON FUNCTION public.register_worker_session(uuid, uuid, uuid, numeric, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_worker_session(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- Exact live signature: void_financial_transaction (2 args)
REVOKE ALL ON FUNCTION public.void_financial_transaction(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_financial_transaction(uuid, text) TO authenticated, service_role;

-- 4. CREDENTIAL_VAULT RLS HARDENING (RESTRICTIVE DENY-ALL)
DROP POLICY IF EXISTS "deny_all_credential_vault" ON public.credential_vault;
CREATE POLICY "deny_all_credential_vault"
  ON public.credential_vault AS RESTRICTIVE
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

-- 5. RE-ASSERT PLATFORM ADMIN ROLE
INSERT INTO public.user_roles (user_id, role)
VALUES ('7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid, 'platform_admin')
ON CONFLICT (user_id, role) DO NOTHING;
