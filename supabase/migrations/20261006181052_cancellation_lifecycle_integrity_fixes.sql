BEGIN;

-- Keep invoice cancellation append-only, but refuse to cancel an invoice while
-- it still has an effective collection. Otherwise collected cash would remain
-- in the ledger after the invoice/receivable is cancelled.
CREATE OR REPLACE FUNCTION public.cancel_invoice_lifecycle_command(
  p_invoice_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_previous jsonb;
  v_cancellation_operation uuid;
  v_original_operation uuid;
  v_link public.invoice_effect_links%ROWTYPE;
  v_financial public.financial_transactions%ROWTYPE;
  v_oil public.oil_movements%ROWTYPE;
  v_line record;
  v_outstanding numeric;
  v_current_oil numeric;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_actor IS NULL OR NOT FOUND OR v_invoice.voided_at IS NOT NULL
     OR (
       NOT public.is_platform_admin(v_actor)
       AND NOT public.has_active_mill_role(v_invoice.mill_id, ARRAY['mill_owner'])
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_NOT_CANCELLABLE';
  END IF;

  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.receivable_movements collection
    WHERE collection.invoice_id = v_invoice.id
      AND collection.movement_type = 'collection'
      AND NOT EXISTS (
        SELECT 1
        FROM public.receivable_movements reversal
        WHERE reversal.reversal_of = collection.id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVOICE_HAS_COLLECTIONS_REVERSE_COLLECTIONS_FIRST';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'cancel_invoice', v_invoice.mill_id, v_invoice.season_id
  );
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;

  SELECT id INTO v_original_operation
  FROM public.business_operations
  WHERE source_type = 'invoice'
    AND source_id = v_invoice.id
    AND operation_type = 'invoice'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by,
    reverses_operation_id
  ) VALUES (
    v_invoice.mill_id, v_invoice.season_id, 'invoice_cancellation', 'invoice',
    v_invoice.id, v_actor, v_original_operation
  ) RETURNING id INTO v_cancellation_operation;

  SELECT * INTO v_link
  FROM public.invoice_effect_links
  WHERE invoice_id = v_invoice.id;

  IF v_link.cash_financial_transaction_id IS NOT NULL THEN
    SELECT * INTO v_financial
    FROM public.financial_transactions
    WHERE id = v_link.cash_financial_transaction_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1 FROM public.financial_transactions
      WHERE reversal_of = v_financial.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_ALREADY_CANCELLED';
    END IF;

    INSERT INTO public.financial_transactions(
      created_by, mill_id, season_id, type, category, amount, direction,
      payment_method, reference_type, reference_id, description, status,
      operation_id, reversal_of, reversal_reason
    ) VALUES (
      v_actor, v_invoice.mill_id, v_invoice.season_id, 'adjustment',
      'invoice_reversal', v_financial.amount,
      (CASE
        WHEN v_financial.direction = 'in'::public.financial_direction THEN 'out'
        WHEN v_financial.direction = 'out'::public.financial_direction THEN 'in'
        ELSE 'none'
      END)::public.financial_direction,
      v_financial.payment_method, 'financial_reversal', v_financial.id,
      'إلغاء فاتورة: ' || btrim(p_reason), 'active', v_cancellation_operation,
      v_financial.id, btrim(p_reason)
    );
  END IF;

  IF v_link.settlement_oil_movement_id IS NOT NULL THEN
    SELECT * INTO v_oil
    FROM public.oil_movements
    WHERE id = v_link.settlement_oil_movement_id
    FOR UPDATE;

    SELECT coalesce(current_balance, oil_balance, 0) INTO v_current_oil
    FROM public.mill_oil_balance
    WHERE mill_id = v_invoice.mill_id AND season_id = v_invoice.season_id;

    IF coalesce(v_current_oil, 0) < v_oil.quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INSUFFICIENT_OIL_STOCK_FOR_CANCELLATION';
    END IF;

    INSERT INTO public.oil_movements(
      mill_id, season_id, ownership, direction, movement_type, source_type,
      quantity, amount, unit_price, party_name, notes, reference_type,
      reference_id, created_by, idempotency_key
    ) VALUES (
      v_invoice.mill_id, v_invoice.season_id, 'mill', 'out', 'OUT',
      'adjustment', v_oil.quantity, v_oil.quantity, 0, v_invoice.customer_name,
      'إلغاء رد عصر: ' || btrim(p_reason), 'invoice_reversal', v_invoice.id,
      v_actor, p_idempotency_key
    );
  END IF;

  FOR v_line IN
    SELECT product_id, quantity
    FROM public.invoice_product_lines
    WHERE invoice_id = v_invoice.id
  LOOP
    INSERT INTO public.product_stock_movements(
      mill_id, season_id, product_id, quantity, type, reference_type,
      reference_id, notes, created_by, idempotency_key
    ) VALUES (
      v_invoice.mill_id, v_invoice.season_id, v_line.product_id, v_line.quantity,
      'adjustment', 'invoice_reversal', v_invoice.id,
      'إلغاء فاتورة: ' || btrim(p_reason), v_actor, gen_random_uuid()
    );

    UPDATE public.products
    SET current_stock = current_stock + v_line.quantity, updated_at = now()
    WHERE id = v_line.product_id;
  END LOOP;

  SELECT coalesce(sum(amount), 0) INTO v_outstanding
  FROM public.receivable_movements
  WHERE invoice_id = v_invoice.id;

  IF v_outstanding <> 0 AND v_invoice.customer_id IS NOT NULL THEN
    INSERT INTO public.receivable_movements(
      mill_id, season_id, customer_id, invoice_id, operation_id,
      movement_type, amount, reason, created_by
    ) VALUES (
      v_invoice.mill_id, v_invoice.season_id, v_invoice.customer_id,
      v_invoice.id, v_cancellation_operation, 'invoice_cancelled',
      -v_outstanding, btrim(p_reason), v_actor
    );
  END IF;

  UPDATE public.invoices
  SET voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason)
  WHERE id = v_invoice.id;

  IF v_original_operation IS NOT NULL THEN
    UPDATE public.business_operations
    SET status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    WHERE id = v_original_operation;
  END IF;

  PERFORM private.complete_business_command(
    p_idempotency_key, 'cancel_invoice',
    jsonb_build_object('success', true, 'invoice_id', v_invoice.id),
    v_cancellation_operation
  );
  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice.id);
END;
$$;

-- A cancelled credit/partner-funded purchase must also write the negative
-- obligation event. Updating payables alone made the obligation ledger diverge.
CREATE OR REPLACE FUNCTION public.cancel_product_purchase_command(
  p_purchase_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_purchase public.product_purchases%ROWTYPE;
  v_payable public.payables%ROWTYPE;
  v_financial public.financial_transactions%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_original_operation uuid;
  v_reverse_financial uuid;
  v_reverse_stock uuid;
  v_stock numeric;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
  SELECT * INTO v_purchase FROM public.product_purchases WHERE id=p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_purchase.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_CANCEL_FORBIDDEN'; END IF;
  IF v_purchase.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_ALREADY_CANCELLED'; END IF;

  v_previous:=private.claim_business_command(p_idempotency_key,'cancel_product_purchase',v_purchase.mill_id,v_purchase.season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;

  SELECT coalesce(current_stock, 0) INTO v_stock
  FROM public.product_season_balances
  WHERE product_id=v_purchase.product_id AND mill_id=v_purchase.mill_id
    AND season_id=v_purchase.season_id
  FOR UPDATE;
  IF NOT FOUND THEN v_stock := 0; END IF;
  IF v_stock<v_purchase.quantity THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INSUFFICIENT_STOCK_FOR_CANCELLATION'; END IF;

  SELECT * INTO v_payable FROM public.payables
  WHERE source_type IN ('product_purchase','purchase') AND source_id=v_purchase.id
  FOR UPDATE;
  IF FOUND AND v_payable.paid_amount>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='DEPENDENT_SETTLEMENT_EXISTS'; END IF;

  SELECT * INTO v_financial FROM public.financial_transactions
  WHERE reference_type='product_purchase' AND reference_id=v_purchase.id AND reversal_of IS NULL
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_LEDGER_EVENT_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE reversal_of=v_financial.id) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PRODUCT_PURCHASE_ALREADY_CANCELLED'; END IF;

  v_original_operation:=v_financial.operation_id;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id)
  VALUES(v_purchase.mill_id,v_purchase.season_id,'product_purchase_cancellation','product_purchase',v_purchase.id,v_actor,v_original_operation)
  RETURNING id INTO v_operation;

  INSERT INTO public.product_stock_movements(mill_id,season_id,product_id,quantity,type,reference_type,reference_id,notes,created_by,idempotency_key)
  VALUES(v_purchase.mill_id,v_purchase.season_id,v_purchase.product_id,-v_purchase.quantity,'adjustment','product_purchase_cancellation',v_purchase.id,'إلغاء شراء بضاعة: '||btrim(p_reason),v_actor,p_idempotency_key)
  RETURNING id INTO v_reverse_stock;

  UPDATE public.products SET current_stock=current_stock-v_purchase.quantity,updated_at=now() WHERE id=v_purchase.product_id;

  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id,idempotency_key,reversal_of,reversal_reason)
  VALUES(v_actor,v_purchase.mill_id,v_purchase.season_id,'adjustment','product_purchase_cancellation',v_financial.amount,
    (CASE v_financial.direction WHEN 'in'::public.financial_direction THEN 'out' WHEN 'out'::public.financial_direction THEN 'in' ELSE 'none' END)::public.financial_direction,
    v_financial.payment_method,'product_purchase_cancellation',v_purchase.id,v_financial.party_type,v_financial.party_id,v_financial.party_name,
    'إلغاء شراء بضاعة: '||btrim(p_reason),'active',v_operation,p_idempotency_key,v_financial.id,btrim(p_reason))
  RETURNING id INTO v_reverse_financial;

  IF v_payable.id IS NOT NULL THEN
    INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,reason,created_by)
    VALUES(v_payable.id,v_payable.mill_id,v_payable.season_id,v_operation,'cancelled',-v_payable.original_amount,
      CASE WHEN v_payable.type='due_to_partner' THEN 'partner' ELSE 'credit' END,
      btrim(p_reason),v_actor);
    UPDATE public.payables SET paid_amount=0,remaining_amount=0,status='cancelled',updated_at=now() WHERE id=v_payable.id;
  END IF;

  UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=btrim(p_reason) WHERE id=v_original_operation;
  UPDATE public.product_purchases SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=btrim(p_reason),cancellation_operation_id=v_operation WHERE id=v_purchase.id;
  PERFORM private.complete_business_command(p_idempotency_key,'cancel_product_purchase',jsonb_build_object('success',true,'purchase_id',v_purchase.id,'stock_reversal_id',v_reverse_stock,'financial_reversal_id',v_reverse_financial,'payable_id',v_payable.id),v_operation);
  RETURN jsonb_build_object('success',true,'purchase_id',v_purchase.id,'stock_reversal_id',v_reverse_stock,'financial_reversal_id',v_reverse_financial,'payable_id',v_payable.id);
END;
$$;

-- Preserve the complete obligation history when cancelling credit oil buys.
CREATE OR REPLACE FUNCTION public.cancel_oil_trade_command(
  p_oil_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_trade public.oil_transactions%ROWTYPE;
  v_payable public.payables%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_original_operation uuid;
  v_original_financial public.financial_transactions%ROWTYPE;
  v_reverse_financial uuid;
  v_reverse_oil uuid;
  v_current_oil numeric;
  v_direction text;
  v_movement_type text;
  v_source_type text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CANCELLATION_REASON_REQUIRED'; END IF;
  SELECT * INTO v_trade FROM public.oil_transactions WHERE id=p_oil_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_trade.mill_id,ARRAY['mill_owner','mill_employee']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_CANCEL_FORBIDDEN'; END IF;
  IF v_trade.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_ALREADY_CANCELLED'; END IF;

  v_previous:=private.claim_business_command(p_idempotency_key,'cancel_oil_trade',v_trade.mill_id,v_trade.season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;

  IF v_trade.payable_id IS NOT NULL THEN
    SELECT * INTO v_payable FROM public.payables WHERE id=v_trade.payable_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_PAYABLE_NOT_FOUND'; END IF;
    IF v_payable.paid_amount>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='DEPENDENT_SETTLEMENT_EXISTS'; END IF;
  END IF;

  IF v_trade.type='buy' THEN
    SELECT coalesce(current_balance,oil_balance,0) INTO v_current_oil FROM public.mill_oil_balance WHERE mill_id=v_trade.mill_id AND season_id=v_trade.season_id;
    IF coalesce(v_current_oil,0)<v_trade.amount THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INSUFFICIENT_OIL_STOCK_FOR_CANCELLATION'; END IF;
    v_direction:='out'; v_movement_type:='OUT'; v_source_type:='oil_purchase';
  ELSE
    v_direction:='in'; v_movement_type:='IN'; v_source_type:='oil_sale';
  END IF;

  SELECT * INTO v_original_financial FROM public.financial_transactions
  WHERE reference_type='oil_transaction' AND reference_id=v_trade.id AND reversal_of IS NULL
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_LEDGER_EVENT_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE reversal_of=v_original_financial.id) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OIL_TRADE_ALREADY_CANCELLED'; END IF;
  v_original_operation:=v_original_financial.operation_id;

  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id)
  VALUES(v_trade.mill_id,v_trade.season_id,'oil_trade_cancellation','oil_transaction',v_trade.id,v_actor,v_original_operation)
  RETURNING id INTO v_operation;

  INSERT INTO public.oil_movements(mill_id,season_id,ownership,direction,movement_type,source_type,quantity,amount,unit_price,party_name,notes,reference_type,reference_id,created_by,idempotency_key)
  VALUES(v_trade.mill_id,v_trade.season_id,'mill',v_direction,v_movement_type,v_source_type,v_trade.amount,v_trade.amount,v_trade.price,v_trade.party_name,
    'إلغاء عملية زيت: '||btrim(p_reason),'oil_transaction_cancellation',v_trade.id,v_actor,p_idempotency_key)
  RETURNING id INTO v_reverse_oil;

  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,operation_id,idempotency_key,reversal_of,reversal_reason)
  VALUES(v_actor,v_trade.mill_id,v_trade.season_id,'adjustment'::public.financial_tx_type,'oil_trade_cancellation',v_original_financial.amount,
    (CASE v_original_financial.direction WHEN 'in'::public.financial_direction THEN 'out' WHEN 'out'::public.financial_direction THEN 'in' ELSE 'none' END)::public.financial_direction,
    v_original_financial.payment_method,'oil_transaction_cancellation',v_trade.id,v_original_financial.party_type,v_original_financial.party_id,v_original_financial.party_name,
    'إلغاء '||CASE WHEN v_trade.type='buy' THEN 'شراء زيت' ELSE 'بيع زيت' END||': '||btrim(p_reason),
    'active'::public.financial_tx_status,v_operation,p_idempotency_key,v_original_financial.id,btrim(p_reason))
  RETURNING id INTO v_reverse_financial;

  IF v_trade.payable_id IS NOT NULL THEN
    INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,reason,created_by)
    VALUES(v_payable.id,v_payable.mill_id,v_payable.season_id,v_operation,'cancelled',-v_payable.original_amount,
      CASE WHEN v_payable.type='due_to_partner' THEN 'partner' ELSE 'credit' END,btrim(p_reason),v_actor);
    UPDATE public.payables SET paid_amount=0,remaining_amount=0,status='cancelled',updated_at=now() WHERE id=v_payable.id;
  END IF;

  UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=btrim(p_reason) WHERE id=v_original_operation;
  UPDATE public.oil_transactions SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=btrim(p_reason),cancellation_operation_id=v_operation WHERE id=v_trade.id;
  PERFORM private.complete_business_command(p_idempotency_key,'cancel_oil_trade',jsonb_build_object('success',true,'oil_transaction_id',v_trade.id,'reversal_oil_movement_id',v_reverse_oil,'financial_reversal_id',v_reverse_financial,'payable_id',v_trade.payable_id),v_operation);
  RETURN jsonb_build_object('success',true,'oil_transaction_id',v_trade.id,'reversal_oil_movement_id',v_reverse_oil,'financial_reversal_id',v_reverse_financial,'payable_id',v_trade.payable_id);
END;
$$;

-- A partner-funded worker payment is non-cash and opens a partner payable.
-- Reverse the original financial direction/method exactly and cancel that
-- payable only when it has no effective settlement.
CREATE OR REPLACE FUNCTION public.reverse_worker_payment_command(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_payment public.worker_payments%ROWTYPE;
  v_worker public.workers%ROWTYPE;
  v_payable public.payables%ROWTYPE;
  v_original_financial public.financial_transactions%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_financial uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REVERSAL_REASON_REQUIRED'; END IF;
  SELECT * INTO v_payment FROM public.worker_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_NOT_FOUND'; END IF;
  IF NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_payment.mill_id,ARRAY['mill_owner']) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_FORBIDDEN'; END IF;
  v_previous:=private.claim_business_command(p_idempotency_key,'reverse_worker_payment',v_payment.mill_id,v_payment.season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF v_payment.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_ALREADY_REVERSED'; END IF;

  SELECT * INTO v_worker FROM public.workers WHERE id=v_payment.worker_id FOR UPDATE;
  IF NOT FOUND OR v_worker.total_paid<v_payment.amount THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_RECONCILIATION_REQUIRED'; END IF;
  SELECT * INTO v_original_financial FROM public.financial_transactions
  WHERE reference_type='worker_payment' AND reference_id=v_payment.id AND status='active' AND reversal_of IS NULL
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_LEDGER_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE reversal_of=v_original_financial.id) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_ALREADY_REVERSED'; END IF;

  IF v_payment.payment_source='partner_paid' THEN
    SELECT * INTO v_payable FROM public.payables
    WHERE source_id=v_payment.id AND source_type IN ('expense','worker_payment')
    ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKER_PAYMENT_PAYABLE_NOT_FOUND'; END IF;
    IF v_payable.paid_amount>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='DEPENDENT_SETTLEMENT_EXISTS'; END IF;
  END IF;

  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by,reverses_operation_id)
  VALUES(v_payment.mill_id,v_payment.season_id,'worker_payment_reversal','worker_payment',v_payment.id,v_actor,v_original_financial.operation_id)
  RETURNING id INTO v_operation;

  UPDATE public.worker_payments SET status='reversed',reversed_at=now(),reversed_by=v_actor,reversal_reason=BTRIM(p_reason) WHERE id=v_payment.id;
  UPDATE public.workers SET total_paid=total_paid-v_payment.amount,updated_at=now() WHERE id=v_worker.id;

  INSERT INTO public.financial_transactions(created_by,mill_id,season_id,type,category,amount,direction,payment_method,reference_type,reference_id,party_type,party_id,party_name,description,status,reversal_of,reversal_reason,operation_id)
  VALUES(v_actor,v_payment.mill_id,v_payment.season_id,'worker_payment'::public.financial_tx_type,'عكس أجور عمال',v_payment.amount,
    (CASE v_original_financial.direction WHEN 'in'::public.financial_direction THEN 'out' WHEN 'out'::public.financial_direction THEN 'in' ELSE 'none' END)::public.financial_direction,
    v_original_financial.payment_method,'worker_payment_reversal',v_payment.id,'worker',v_payment.worker_id,v_worker.name,
    'عكس دفعة العامل: '||v_worker.name,'active'::public.financial_tx_status,v_original_financial.id,BTRIM(p_reason),v_operation)
  RETURNING id INTO v_financial;

  IF v_payable.id IS NOT NULL THEN
    INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,reason,created_by)
    VALUES(v_payable.id,v_payable.mill_id,v_payable.season_id,v_operation,'cancelled',-v_payable.original_amount,'partner',BTRIM(p_reason),v_actor);
    UPDATE public.payables SET paid_amount=0,remaining_amount=0,status='cancelled',updated_at=now() WHERE id=v_payable.id;
  END IF;

  UPDATE public.business_operations SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=BTRIM(p_reason)
  WHERE id=v_original_financial.operation_id;

  PERFORM private.complete_business_command(p_idempotency_key,'reverse_worker_payment',jsonb_build_object('success',true,'financial_transaction_id',v_financial,'worker_payment_id',v_payment.id,'payable_id',v_payable.id),v_operation);
  RETURN jsonb_build_object('success',true,'financial_transaction_id',v_financial,'worker_payment_id',v_payment.id,'payable_id',v_payable.id);
END;
$$;

-- Historical reconciliation: keep every row and append the missing obligation
-- cancellation entries for already-cancelled test-era payables.
DO $$
DECLARE
  v_payable record;
  v_operation uuid;
  v_actor uuid;
BEGIN
  FOR v_payable IN
    SELECT p.*
    FROM public.payables p
    WHERE p.status='cancelled'
      AND p.source_type IN ('product_purchase','purchase','oil_transaction','oil_purchase','expense','worker_payment')
      AND NOT EXISTS (
        SELECT 1 FROM public.obligation_movements om
        WHERE om.payable_id=p.id AND om.movement_type='cancelled'
      )
  LOOP
    v_actor := coalesce(
      v_payable.created_by,
      (SELECT user_id FROM public.user_roles WHERE role='platform_admin' LIMIT 1)
    );
    IF v_actor IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by)
    VALUES(v_payable.mill_id,v_payable.season_id,'payable_cancellation_reconciliation','payable',v_payable.id,v_actor)
    RETURNING id INTO v_operation;

    INSERT INTO public.obligation_movements(payable_id,mill_id,season_id,operation_id,movement_type,amount,payment_method,reason,created_by)
    VALUES(v_payable.id,v_payable.mill_id,v_payable.season_id,v_operation,'cancelled',-v_payable.original_amount,
      CASE WHEN v_payable.type='due_to_partner' THEN 'partner' ELSE 'credit' END,
      'استكمال سجل إلغاء سابق دون تغيير الرصيد',v_actor);
  END LOOP;
END;
$$;

-- Link historical cancelled invoices to their canonical original operation.
UPDATE public.business_operations operation
SET status='cancelled',
    cancelled_by=invoice.voided_by,
    cancelled_at=invoice.voided_at,
    cancellation_reason=coalesce(invoice.void_reason,'إلغاء فاتورة سابق')
FROM public.invoices invoice
WHERE operation.source_type='invoice'
  AND operation.operation_type='invoice'
  AND operation.source_id=invoice.id
  AND invoice.voided_at IS NOT NULL
  AND operation.status='active';

REVOKE ALL ON FUNCTION public.cancel_invoice_lifecycle_command(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_product_purchase_command(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_oil_trade_command(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_worker_payment_command(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_lifecycle_command(uuid,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_product_purchase_command(uuid,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_oil_trade_command(uuid,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_worker_payment_command(uuid,text,uuid) TO authenticated, service_role;

COMMIT;
