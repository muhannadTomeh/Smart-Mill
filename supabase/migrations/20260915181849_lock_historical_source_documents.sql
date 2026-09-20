-- Phase 1: browser clients may read historical source documents, but every
-- financial or inventory mutation must pass through a canonical command.
-- SECURITY DEFINER lifecycle functions remain the only writers for these tables.

-- Do not rely on tenant RLS alone: a tenant member must not mutate their own
-- historical documents directly through the authenticated browser client.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoices FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoice_product_lines FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.expenses FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payables FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.worker_payments FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.product_purchases FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.oil_transactions FROM PUBLIC, anon, authenticated;

-- Existing policies grant ALL commands to authenticated users. Replace them
-- with a single canonical tenant/platform-admin read policy per protected table.
DROP POLICY IF EXISTS "Tenant isolation for invoices" ON public.invoices;
CREATE POLICY invoices_tenant_read
  ON public.invoices FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS invoice_product_lines_tenant_select ON public.invoice_product_lines;
DROP POLICY IF EXISTS invoice_product_lines_tenant_write ON public.invoice_product_lines;
CREATE POLICY invoice_product_lines_tenant_read
  ON public.invoice_product_lines FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS "Tenant isolation for expenses" ON public.expenses;
CREATE POLICY expenses_tenant_read
  ON public.expenses FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS payables_mill_access ON public.payables;
CREATE POLICY payables_tenant_read
  ON public.payables FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS "Tenant isolation for worker_payments" ON public.worker_payments;
CREATE POLICY worker_payments_tenant_read
  ON public.worker_payments FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS product_purchases_mill_access ON public.product_purchases;
CREATE POLICY product_purchases_tenant_read
  ON public.product_purchases FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));

DROP POLICY IF EXISTS "Tenant isolation for oil_transactions" ON public.oil_transactions;
CREATE POLICY oil_transactions_tenant_read
  ON public.oil_transactions FOR SELECT TO authenticated
  USING (public.check_user_mill_access(mill_id));
