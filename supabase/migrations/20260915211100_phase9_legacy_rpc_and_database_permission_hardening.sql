-- Phase 9: only lifecycle commands and explicitly public display/auth helpers are
-- callable from the browser.  These revokes preserve all historical data.

-- Superseded direct/atomic command entry points. Their canonical lifecycle
-- wrappers remain executable (expense command, payable lifecycle, etc.).
REVOKE ALL ON FUNCTION public.record_expense_atomic(uuid,text,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_expense_v2(uuid,text,numeric,text,text,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_customer_payment_atomic(uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_customer_payment_command(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid,uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_payable_atomic(uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_payable_command(uuid,numeric,text,text,uuid) FROM PUBLIC, anon, authenticated;

-- Legacy owner-user tenancy helpers and obsolete role aliases must not be
-- browser RPCs. Canonical tenancy is auth.uid() -> mill_memberships -> mill_id.
REVOKE ALL ON FUNCTION public.can_access_mill_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_effective_mill_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_effective_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_cashier() FROM PUBLIC, anon, authenticated;

-- Trigger functions are never an RPC surface.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_setup() FROM PUBLIC, anon, authenticated;

-- Ledger/source documents are append-only. Browser clients may read only where
-- their existing RLS policies allow; commands write them under controlled logic.
REVOKE ALL ON TABLE public.financial_transactions, public.oil_movements,
  public.product_stock_movements, public.obligation_movements,
  public.receivable_movements, public.business_operations
  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.financial_transactions, public.oil_movements,
  public.product_stock_movements, public.obligation_movements,
  public.receivable_movements, public.business_operations
  FROM authenticated;

-- Explicitly retain the canonical client commands and intentionally public
-- display/auth endpoints. Every financial command authorizes roles internally.
GRANT EXECUTE ON FUNCTION public.record_expense_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid),
  public.settle_payable_lifecycle_command(uuid,numeric,text,text,uuid),
  public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid),
  public.register_worker_session(uuid,uuid,uuid,numeric,text),
  public.create_invoice_lifecycle_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid),
  public.create_deferred_invoice_lifecycle_command(uuid,text,numeric,integer,text,numeric,numeric,text,uuid,uuid,jsonb,uuid),
  public.collect_invoice_receivable_lifecycle_command(uuid,numeric,text,uuid),
  public.reverse_invoice_collection_lifecycle_command(uuid,text,uuid),
  public.cancel_invoice_lifecycle_command(uuid,text,uuid),
  public.cancel_oil_trade_command(uuid,text,uuid),
  public.cancel_product_purchase_command(uuid,text,uuid),
  public.reverse_payable_settlement_lifecycle_command(uuid,text,uuid),
  public.reverse_worker_payment_command(uuid,text,uuid)
  TO authenticated;

-- Intentionally anonymous endpoints: public display exposes queue/display data
-- for one supplied season; username lookup is required before employee login.
REVOKE ALL ON FUNCTION public.get_public_queue(uuid), public.get_public_season_display(uuid), public.lookup_cashier_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid), public.get_public_season_display(uuid), public.lookup_cashier_by_username(text) TO anon, authenticated;
