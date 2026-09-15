-- Smart Mill final cash and goods simplification.
-- The credential_vault and its audit tables are deliberately outside this migration.

-- -----------------------------------------------------------------------------
-- 1. Remove every executable cash-session dependency before retiring its schema.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ILIKE '%cash_session%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;

-- Business/test data is intentionally disposable.  Identity, credential vault,
-- credential reveal audit, system configuration, and the platform-admin role are
-- not included.  Auth users are also left untouched because auth.users must be
-- managed through Supabase Auth administration rather than an application SQL RPC.
TRUNCATE TABLE
  public.business_command_receipts,
  public.business_operation_audit_events,
  public.business_operation_dependencies,
  public.business_operations,
  public.financial_command_receipts,
  public.invoice_effect_links,
  public.receivable_movements,
  public.customer_payments,
  public.obligation_movements,
  public.payables,
  public.expenses,
  public.worker_payments,
  public.work_records,
  public.oil_movements,
  public.oil_transactions,
  public.product_stock_movements,
  public.product_purchases,
  public.financial_transactions,
  public.invoices,
  public.queue,
  public.inventory,
  public.daily_inventory,
  public.products,
  public.container_types,
  public.suppliers,
  public.workers,
  public.partners,
  public.customers,
  public.expense_categories,
  public.settings,
  public.cash_transfers,
  public.cash_vaults,
  public.daily_closings,
  public.cash_sessions,
  public.mill_memberships,
  public.seasons,
  public.mills
RESTART IDENTITY CASCADE;

-- Non-admin test identities cannot retain application roles after the reset.
DELETE FROM public.user_roles WHERE role::text <> 'platform_admin';
DELETE FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role::text = 'platform_admin');

-- Any old cash-session column is removed from active business tables.  Dependent
-- legacy views are intentionally removed and recreated below from the ledger.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN pg_class pc ON pc.relname = c.table_name
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'cash_session_id' AND pc.relkind IN ('r','p')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP COLUMN cash_session_id CASCADE', r.table_schema, r.table_name);
  END LOOP;
END $$;

ALTER TABLE public.financial_transactions DROP COLUMN IF EXISTS cash_location;
DROP TABLE IF EXISTS public.daily_closings CASCADE;
DROP TABLE IF EXISTS public.cash_transfers CASCADE;
DROP TABLE IF EXISTS public.cash_vaults CASCADE;
DROP TABLE IF EXISTS public.cash_sessions CASCADE;
DROP TABLE IF EXISTS public.container_types CASCADE;

-- -----------------------------------------------------------------------------
-- 2. One product catalogue for containers and ordinary goods.
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'goods',
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check CHECK (product_type IN ('container', 'goods'));

CREATE TABLE IF NOT EXISTS public.invoice_product_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_snapshot numeric NOT NULL DEFAULT 0 CHECK (unit_price_snapshot >= 0),
  line_total numeric NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_product_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_product_lines_tenant_select ON public.invoice_product_lines;
DROP POLICY IF EXISTS invoice_product_lines_tenant_write ON public.invoice_product_lines;
CREATE POLICY invoice_product_lines_tenant_select ON public.invoice_product_lines
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_active_mill_role(mill_id, ARRAY['mill_owner','mill_employee']));
CREATE POLICY invoice_product_lines_tenant_write ON public.invoice_product_lines
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_active_mill_role(mill_id, ARRAY['mill_owner','mill_employee']))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_active_mill_role(mill_id, ARRAY['mill_owner','mill_employee']));

-- -----------------------------------------------------------------------------
-- 3. Ledger-derived balances.  inventory.total_cash is no longer written by any
-- command and is not a source of truth.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.mill_cash_reconciliation CASCADE;
DROP VIEW IF EXISTS public.mill_cash_balance CASCADE;
DROP VIEW IF EXISTS public.financial_effective_events CASCADE;

CREATE VIEW public.financial_effective_events WITH (security_invoker = true) AS
SELECT ft.*
FROM public.financial_transactions ft
WHERE ft.status = 'active';

CREATE VIEW public.mill_cash_balance WITH (security_invoker = true) AS
SELECT
  ft.mill_id,
  ft.season_id,
  COALESCE(SUM(CASE
    WHEN ft.direction = 'in'::public.financial_direction THEN ft.amount
    WHEN ft.direction = 'out'::public.financial_direction THEN -ft.amount
    ELSE 0
  END), 0) AS cash_balance
FROM public.financial_transactions ft
WHERE ft.status = 'active'
  AND ft.payment_method = 'cash'::public.financial_payment_method
GROUP BY ft.mill_id, ft.season_id;

CREATE VIEW public.mill_cash_reconciliation WITH (security_invoker = true) AS
SELECT mill_id, season_id, cash_balance AS ledger_cash
FROM public.mill_cash_balance;

-- -----------------------------------------------------------------------------
-- 4. Canonical, idempotent commands.  None references a cash session or cache.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_cash_opening_balance_command(
  p_season_id uuid, p_amount numeric, p_notes text, p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_actor uuid := auth.uid(); v_mill uuid; v_previous jsonb; v_operation uuid; v_financial uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SEASON_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_BALANCE_FORBIDDEN'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='OPENING_BALANCE_INVALID'; END IF;
  v_previous := private.claim_business_command(p_idempotency_key, 'cash_opening_balance', v_mill, p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE mill_id=v_mill AND season_id=p_season_id AND reference_type='cash_opening_balance' AND status='active') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DUPLICATE_OPENING_BALANCE';
  END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by)
  VALUES(v_mill,p_season_id,'cash_opening_balance','cash_opening_balance',v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,description,status,operation_id,idempotency_key)
  VALUES(v_actor,v_mill,p_season_id,'adjustment','opening_balance',p_amount,'in','cash','cash_opening_balance',coalesce(nullif(btrim(p_notes),''),'الرصيد النقدي الافتتاحي'),'active',v_operation,p_idempotency_key)
  RETURNING id INTO v_financial;
  PERFORM private.complete_business_command(p_idempotency_key,'cash_opening_balance',jsonb_build_object('success',true,'financial_transaction_id',v_financial),v_operation);
  RETURN jsonb_build_object('success',true,'financial_transaction_id',v_financial);
END $$;

DROP FUNCTION IF EXISTS public.record_product_purchase_atomic(uuid,uuid,numeric,numeric,text,uuid,uuid,text,numeric,text);
CREATE FUNCTION public.record_product_purchase_atomic(
  p_season_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_payment_method text, p_supplier_id uuid DEFAULT NULL, p_partner_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL, p_sale_price numeric DEFAULT NULL, p_partner_name text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_mill uuid; v_product public.products%ROWTYPE; v_supplier text; v_total numeric;
  v_previous jsonb; v_operation uuid; v_purchase uuid; v_payable uuid; v_financial uuid; v_partner uuid:=p_partner_id;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SEASON_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_FORBIDDEN'; END IF;
  IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity<>trunc(p_quantity) OR p_unit_price IS NULL OR p_unit_price<0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_INVALID'; END IF;
  IF p_payment_method NOT IN ('cash','credit','partner') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PAYMENT_METHOD_INVALID'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id AND mill_id=v_mill AND active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_NOT_FOUND'; END IF;
  SELECT name INTO v_supplier FROM public.suppliers WHERE id=p_supplier_id AND mill_id=v_mill AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SUPPLIER_NOT_FOUND'; END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'product_purchase',v_mill,p_season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_total:=p_quantity*p_unit_price;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(v_mill,p_season_id,'product_purchase','product_purchase',v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.product_purchases(mill_id,season_id,product_id,supplier_id,quantity,unit_price,total_price,payment_method,partner_id,notes,created_by)
  VALUES(v_mill,p_season_id,p_product_id,p_supplier_id,p_quantity::integer,p_unit_price,v_total,p_payment_method,p_partner_id,p_notes,v_actor) RETURNING id INTO v_purchase;
  INSERT INTO public.product_stock_movements(mill_id,season_id,product_id,quantity,type,reference_type,reference_id,notes,created_by,idempotency_key)
  VALUES(v_mill,p_season_id,p_product_id,p_quantity::integer,'purchase','product_purchase',v_purchase,p_notes,v_actor,p_idempotency_key);
  UPDATE public.products SET current_stock=current_stock+p_quantity::integer,default_purchase_price=p_unit_price,
    default_sale_price=coalesce(p_sale_price,default_sale_price),updated_at=now() WHERE id=p_product_id;
  IF p_payment_method='credit' THEN
    INSERT INTO public.payables(mill_id,season_id,type,supplier_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,source_id,status,notes,created_by)
    VALUES(v_mill,p_season_id,'due_to_supplier',p_supplier_id,v_supplier,v_total,0,v_total,'product_purchase',v_purchase,'unpaid',p_notes,v_actor) RETURNING id INTO v_payable;
  ELSIF p_payment_method='partner' THEN
    IF v_partner IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_REQUIRED'; END IF;
    INSERT INTO public.payables(mill_id,season_id,type,partner_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,source_id,status,notes,created_by)
    SELECT v_mill,p_season_id,'due_to_partner',p.id,p.name,v_total,0,v_total,'product_purchase',v_purchase,'unpaid',p_notes,v_actor FROM public.partners p WHERE p.id=v_partner AND p.mill_id=v_mill
    RETURNING id INTO v_payable;
    IF v_payable IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PARTNER_NOT_FOUND'; END IF;
  END IF;
  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id,idempotency_key)
  VALUES(v_actor,v_mill,p_season_id,'stock_purchase','stock_purchase',v_total,CASE WHEN p_payment_method='cash' THEN 'out' ELSE 'none' END,CASE WHEN p_payment_method='cash' THEN 'cash' ELSE 'credit' END,'product_purchase',v_purchase,CASE WHEN p_payment_method='partner' THEN 'partner' ELSE 'supplier' END,CASE WHEN p_payment_method='partner' THEN v_partner ELSE p_supplier_id END,v_supplier,'شراء بضاعة: '||v_product.name,'active',v_operation,p_idempotency_key)
  RETURNING id INTO v_financial;
  PERFORM private.complete_business_command(p_idempotency_key,'product_purchase',jsonb_build_object('success',true,'purchase_id',v_purchase,'financial_transaction_id',v_financial,'payable_id',v_payable),v_operation);
  RETURN jsonb_build_object('success',true,'purchase_id',v_purchase,'financial_transaction_id',v_financial,'payable_id',v_payable);
END $$;

DROP FUNCTION IF EXISTS public.create_invoice_lifecycle_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid);
CREATE FUNCTION public.create_invoice_lifecycle_command(
  p_season_id uuid,p_customer_name text,p_oil_produced numeric,p_container_count integer,p_container_type text,p_payment_type text,
  p_oil_amount numeric,p_cash_amount numeric,p_total_display text,p_customer_id uuid,p_queue_id uuid,p_container_lines jsonb DEFAULT '[]'::jsonb,p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_mill uuid; v_previous jsonb; v_operation uuid; v_invoice uuid; v_financial uuid; v_oil uuid;
  v_line jsonb; v_product public.products%ROWTYPE; v_qty integer; v_price numeric; v_total_qty integer:=0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SEASON_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_CREATE_FORBIDDEN'; END IF;
  IF coalesce(p_cash_amount,0)<0 OR coalesce(p_oil_amount,0)<0 OR jsonb_typeof(coalesce(p_container_lines,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_INVALID'; END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'create_invoice',v_mill,p_season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(v_mill,p_season_id,'invoice','invoice',v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.invoices(user_id,mill_id,season_id,customer_id,customer_name,oil_produced,container_count,container_type,payment_type,oil_amount,cash_amount,total_display,unpaid_amount)
  VALUES(v_actor,v_mill,p_season_id,p_customer_id,coalesce(nullif(btrim(p_customer_name),''),'زبون'),coalesce(p_oil_produced,0),coalesce(p_container_count,0),coalesce(p_container_type,''),coalesce(p_payment_type,'cash'),coalesce(p_oil_amount,0),coalesce(p_cash_amount,0),coalesce(p_total_display,''),0)
  RETURNING id INTO v_invoice;
  UPDATE public.business_operations SET source_id=v_invoice WHERE id=v_operation;
  FOR v_line IN SELECT value FROM jsonb_array_elements(coalesce(p_container_lines,'[]'::jsonb)) LOOP
    v_qty:=nullif(v_line->>'quantity','')::integer;
    IF v_qty IS NULL OR v_qty<=0 OR nullif(v_line->>'product_id','') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_PRODUCT_LINES_INVALID'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id=(v_line->>'product_id')::uuid AND mill_id=v_mill AND active=true AND product_type='container' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_NOT_FOUND'; END IF;
    IF v_product.current_stock<v_qty THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INSUFFICIENT_PRODUCT_STOCK'; END IF;
    v_price:=coalesce(nullif(v_line->>'unit_price','')::numeric,v_product.default_sale_price,0);
    INSERT INTO public.invoice_product_lines(mill_id,season_id,invoice_id,product_id,product_name_snapshot,quantity,unit_price_snapshot,line_total)
    VALUES(v_mill,p_season_id,v_invoice,v_product.id,v_product.name,v_qty,v_price,v_qty*v_price);
    INSERT INTO public.product_stock_movements(mill_id,season_id,product_id,quantity,type,reference_type,reference_id,notes,created_by,idempotency_key)
    VALUES(v_mill,p_season_id,v_product.id,-v_qty,'sale','invoice',v_invoice,'عبوات ضمن فاتورة عصر',v_actor,p_idempotency_key);
    UPDATE public.products SET current_stock=current_stock-v_qty,updated_at=now() WHERE id=v_product.id;
    v_total_qty:=v_total_qty+v_qty;
  END LOOP;
  IF v_total_qty<>coalesce(p_container_count,0) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVOICE_PRODUCT_LINES_MISMATCH'; END IF;
  IF coalesce(p_cash_amount,0)>0 THEN
    INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id,idempotency_key)
    VALUES(v_actor,v_mill,p_season_id,'income','invoice',p_cash_amount,'in','cash','invoice',v_invoice,'customer',p_customer_id,p_customer_name,'فاتورة عصر نقدية','active',v_operation,p_idempotency_key) RETURNING id INTO v_financial;
  END IF;
  IF coalesce(p_oil_amount,0)>0 THEN
    INSERT INTO public.oil_movements(mill_id,season_id,ownership,direction,movement_type,source_type,quantity,amount,unit_price,party_name,notes,reference_type,reference_id,created_by,idempotency_key)
    VALUES(v_mill,p_season_id,'mill','in','IN','milling_settlement',p_oil_amount,p_oil_amount,0,p_customer_name,'رد من عملية عصر','invoice',v_invoice,v_actor,p_idempotency_key) RETURNING id INTO v_oil;
  END IF;
  INSERT INTO public.invoice_effect_links(invoice_id,mill_id,season_id,operation_id,cash_financial_transaction_id,settlement_oil_movement_id)
  VALUES(v_invoice,v_mill,p_season_id,v_operation,v_financial,v_oil);
  IF p_queue_id IS NOT NULL THEN UPDATE public.queue SET status='completed' WHERE id=p_queue_id AND mill_id=v_mill AND season_id=p_season_id; END IF;
  PERFORM private.complete_business_command(p_idempotency_key,'create_invoice',jsonb_build_object('success',true,'invoice_id',v_invoice,'operation_id',v_operation),v_operation);
  RETURN jsonb_build_object('success',true,'invoice_id',v_invoice,'operation_id',v_operation);
END $$;

DROP FUNCTION IF EXISTS public.create_deferred_invoice_lifecycle_command(uuid,text,numeric,integer,text,numeric,numeric,text,uuid,uuid,jsonb,uuid);
CREATE FUNCTION public.create_deferred_invoice_lifecycle_command(
  p_season_id uuid,p_customer_name text,p_oil_produced numeric,p_container_count integer,p_container_type text,p_oil_amount numeric,
  p_receivable_amount numeric,p_total_display text,p_customer_id uuid,p_queue_id uuid,p_container_lines jsonb,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_result jsonb; v_invoice uuid; v_mill uuid; v_operation uuid;
BEGIN
  v_result:=public.create_invoice_lifecycle_command(p_season_id,p_customer_name,p_oil_produced,p_container_count,p_container_type,'credit',p_oil_amount,0,p_total_display,p_customer_id,p_queue_id,p_container_lines,gen_random_uuid());
  v_invoice:=(v_result->>'invoice_id')::uuid;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  SELECT id INTO v_operation FROM public.business_operations WHERE source_type='invoice' AND source_id=v_invoice;
  IF p_customer_id IS NULL OR p_receivable_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RECEIVABLE_CUSTOMER_REQUIRED'; END IF;
  UPDATE public.invoices SET unpaid_amount=p_receivable_amount WHERE id=v_invoice;
  INSERT INTO public.receivable_movements(mill_id,season_id,customer_id,invoice_id,operation_id,movement_type,amount,created_by)
  VALUES(v_mill,p_season_id,p_customer_id,v_invoice,v_operation,'invoice_charge',p_receivable_amount,auth.uid());
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.record_oil_trade_command(
  p_season_id uuid,p_movement_type text,p_quantity numeric,p_unit_price numeric,p_payment_method text DEFAULT 'cash',p_party_name text DEFAULT NULL,p_notes text DEFAULT NULL,p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_mill uuid; v_total numeric; v_previous jsonb; v_operation uuid; v_trade uuid; v_fin uuid; v_oil uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_FORBIDDEN'; END IF;
  IF p_movement_type NOT IN ('IN','OUT') OR p_quantity<=0 OR p_unit_price<0 OR p_payment_method NOT IN ('cash','credit') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_INVALID'; END IF;
  IF p_movement_type='OUT' AND coalesce((SELECT coalesce(current_balance, oil_balance) FROM public.mill_oil_balance WHERE mill_id=v_mill AND season_id=p_season_id),0)<p_quantity THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INSUFFICIENT_OIL_STOCK'; END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'oil_trade',v_mill,p_season_id); IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  v_total:=p_quantity*p_unit_price;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,created_by) VALUES(v_mill,p_season_id,'oil_trade','oil_trade',v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.oil_transactions(user_id,mill_id,season_id,type,amount,price,total_price,party_name,notes) VALUES(v_actor,v_mill,p_season_id,CASE WHEN p_movement_type='IN' THEN 'buy' ELSE 'sell' END,p_quantity,p_unit_price,v_total,p_party_name,p_notes) RETURNING id INTO v_trade;
  INSERT INTO public.oil_movements(mill_id,season_id,ownership,direction,movement_type,source_type,quantity,amount,unit_price,party_name,notes,reference_type,reference_id,created_by,idempotency_key)
  VALUES(v_mill,p_season_id,'mill',lower(p_movement_type),p_movement_type,CASE WHEN p_movement_type='IN' THEN 'oil_purchase' ELSE 'oil_sale' END,p_quantity,p_quantity,p_unit_price,p_party_name,p_notes,'oil_transaction',v_trade,v_actor,p_idempotency_key) RETURNING id INTO v_oil;
  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_name,description,status,operation_id,idempotency_key)
  VALUES(
    v_actor,v_mill,p_season_id,
    (CASE WHEN p_movement_type='IN' THEN 'expense' ELSE 'income' END)::public.financial_tx_type,
    (CASE WHEN p_movement_type='IN' THEN 'شراء زيت' ELSE 'بيع زيت' END),
    v_total,
    (CASE WHEN p_payment_method='cash' AND p_movement_type='IN' THEN 'out' WHEN p_payment_method='cash' THEN 'in' ELSE 'none' END)::public.financial_direction,
    (CASE WHEN p_payment_method='cash' THEN 'cash' ELSE 'credit' END)::public.financial_payment_method,
    'oil_transaction',
    v_trade,
    p_party_name,
    CASE WHEN p_movement_type='IN' THEN 'شراء زيت (' || p_quantity || ' كغم)' ELSE 'بيع زيت (' || p_quantity || ' كغم)' END || CASE WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN ' — ' || TRIM(p_notes) ELSE '' END,
    'active'::public.financial_tx_status,
    v_operation,
    p_idempotency_key
  ) RETURNING id INTO v_fin;
  PERFORM private.complete_business_command(p_idempotency_key,'oil_trade',jsonb_build_object('success',true,'oil_movement_id',v_oil,'financial_transaction_id',v_fin,'oil_transaction_id',v_trade),v_operation);
  RETURN jsonb_build_object('success',true,'oil_movement_id',v_oil,'financial_transaction_id',v_fin,'oil_transaction_id',v_trade);
END $$;

REVOKE ALL ON FUNCTION public.record_cash_opening_balance_command(uuid,numeric,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_product_purchase_atomic(uuid,uuid,numeric,numeric,text,uuid,uuid,text,numeric,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_invoice_lifecycle_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_deferred_invoice_lifecycle_command(uuid,text,numeric,integer,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_opening_balance_command(uuid,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_purchase_atomic(uuid,uuid,numeric,numeric,text,uuid,uuid,text,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_lifecycle_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deferred_invoice_lifecycle_command(uuid,text,numeric,integer,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_oil_trade_command(uuid,text,numeric,numeric,text,text,text,uuid) TO authenticated;
