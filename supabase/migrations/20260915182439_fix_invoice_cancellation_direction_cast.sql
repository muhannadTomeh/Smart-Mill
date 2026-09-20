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
  a uuid := auth.uid();
  i public.invoices%ROWTYPE;
  previous jsonb;
  op uuid;
  link public.invoice_effect_links%ROWTYPE;
  ft public.financial_transactions%ROWTYPE;
  oil public.oil_movements%ROWTYPE;
  line record;
  outstanding numeric;
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF a IS NULL OR NOT FOUND OR i.voided_at IS NOT NULL
    OR NOT public.has_active_mill_role(i.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_NOT_CANCELLABLE';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  previous := private.claim_business_command(p_idempotency_key, 'cancel_invoice', i.mill_id, i.season_id);
  IF previous IS NOT NULL THEN RETURN previous; END IF;

  INSERT INTO public.business_operations(mill_id, season_id, operation_type, source_type, source_id, created_by)
  VALUES (i.mill_id, i.season_id, 'invoice_cancellation', 'invoice', i.id, a)
  RETURNING id INTO op;

  SELECT * INTO link FROM public.invoice_effect_links WHERE invoice_id = i.id;
  IF link.cash_financial_transaction_id IS NOT NULL THEN
    SELECT * INTO ft FROM public.financial_transactions WHERE id = link.cash_financial_transaction_id;
    INSERT INTO public.financial_transactions(
      created_by, mill_id, season_id, type, category, amount, direction, payment_method,
      reference_type, reference_id, description, status, operation_id, reversal_of, reversal_reason
    ) VALUES (
      a, i.mill_id, i.season_id, 'adjustment', 'invoice_reversal', ft.amount,
      (CASE WHEN ft.direction = 'in' THEN 'out' ELSE 'in' END)::public.financial_direction,
      ft.payment_method, 'financial_reversal', ft.id, 'إلغاء فاتورة: ' || p_reason,
      'active', op, ft.id, p_reason
    );
  END IF;

  IF link.settlement_oil_movement_id IS NOT NULL THEN
    SELECT * INTO oil FROM public.oil_movements WHERE id = link.settlement_oil_movement_id;
    INSERT INTO public.oil_movements(
      mill_id, season_id, ownership, direction, movement_type, source_type, quantity, amount,
      unit_price, party_name, notes, reference_type, reference_id, created_by, idempotency_key
    ) VALUES (
      i.mill_id, i.season_id, 'mill', 'out', 'OUT', 'adjustment', oil.quantity, oil.quantity,
      0, i.customer_name, 'إلغاء رد عصر: ' || p_reason, 'invoice_reversal', i.id, a, p_idempotency_key
    );
  END IF;

  FOR line IN SELECT product_id, quantity FROM public.invoice_product_lines WHERE invoice_id = i.id LOOP
    INSERT INTO public.product_stock_movements(
      mill_id, season_id, product_id, quantity, type, reference_type, reference_id, notes, created_by, idempotency_key
    ) VALUES (
      i.mill_id, i.season_id, line.product_id, line.quantity, 'adjustment', 'invoice_reversal', i.id,
      'إلغاء فاتورة: ' || p_reason, a, p_idempotency_key
    );
    UPDATE public.products SET current_stock = current_stock + line.quantity, updated_at = now()
    WHERE id = line.product_id;
  END LOOP;

  SELECT coalesce(sum(amount), 0) INTO outstanding
  FROM public.receivable_movements WHERE invoice_id = i.id;
  IF outstanding <> 0 AND i.customer_id IS NOT NULL THEN
    INSERT INTO public.receivable_movements(
      mill_id, season_id, customer_id, invoice_id, operation_id, movement_type, amount, reason, created_by
    ) VALUES (
      i.mill_id, i.season_id, i.customer_id, i.id, op, 'invoice_cancelled', -outstanding, p_reason, a
    );
  END IF;

  UPDATE public.invoices
     SET voided_at = now(), voided_by = a, void_reason = p_reason
   WHERE id = i.id;

  PERFORM private.complete_business_command(
    p_idempotency_key, 'cancel_invoice', jsonb_build_object('success', true, 'invoice_id', i.id), op
  );
  RETURN jsonb_build_object('success', true, 'invoice_id', i.id);
END;
$$;
