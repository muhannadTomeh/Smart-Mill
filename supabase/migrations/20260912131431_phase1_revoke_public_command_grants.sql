-- PostgreSQL grants EXECUTE to PUBLIC by default. Phase 1 command RPCs are
-- authenticated-only and authorize again inside their bodies.
REVOKE ALL ON FUNCTION
  public.create_invoice_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,uuid),
  public.record_expense_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid),
  public.record_oil_transaction_command(uuid,text,numeric,numeric,text,text,uuid),
  public.pay_worker_command(uuid,uuid,numeric,text,uuid),
  public.settle_payable_command(uuid,numeric,text,text,uuid),
  public.record_partner_transaction_command(uuid,uuid,text,numeric,text,uuid),
  public.record_customer_payment_command(uuid,uuid,numeric,text,uuid),
  public.close_cash_session(uuid,numeric,text),
  public.void_financial_transaction(uuid,text),
  public.void_expense_and_reverse(uuid,text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.create_invoice_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,uuid),
  public.record_expense_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid),
  public.record_oil_transaction_command(uuid,text,numeric,numeric,text,text,uuid),
  public.pay_worker_command(uuid,uuid,numeric,text,uuid),
  public.settle_payable_command(uuid,numeric,text,text,uuid),
  public.record_partner_transaction_command(uuid,uuid,text,numeric,text,uuid),
  public.record_customer_payment_command(uuid,uuid,numeric,text,uuid),
  public.close_cash_session(uuid,numeric,text),
  public.void_financial_transaction(uuid,text),
  public.void_expense_and_reverse(uuid,text)
TO authenticated, service_role;
