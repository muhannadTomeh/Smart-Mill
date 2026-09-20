-- Only the lifecycle command may create oil trades.  These legacy RPCs are
-- not used by the frontend and could bypass the source-document lifecycle.
REVOKE ALL ON FUNCTION public.record_oil_trade_atomic(uuid,text,numeric,numeric,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_oil_transaction_command(uuid,text,numeric,numeric,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
