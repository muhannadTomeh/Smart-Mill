-- Restore reversal for invoice receivable collections without legacy cash-session
-- columns. Cash is reversed through the financial ledger only.
CREATE OR REPLACE FUNCTION public.reverse_invoice_collection_lifecycle_command(
  p_movement_id uuid,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_movement public.receivable_movements%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_reverse_movement uuid := gen_random_uuid();
  v_original_financial public.financial_transactions%ROWTYPE;
  v_reverse_financial uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_movement
  FROM public.receivable_movements
  WHERE id = p_movement_id
  FOR UPDATE;
  IF NOT FOUND OR v_movement.movement_type <> 'collection' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_NOT_REVERSIBLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receivable_movements WHERE reversal_of = v_movement.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_ALREADY_REVERSED';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_movement.invoice_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_active_mill_role(v_movement.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_REVERSE_FORBIDDEN';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'reverse_invoice_collection', v_movement.mill_id, v_movement.season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by, reverses_operation_id
  ) VALUES (
    v_movement.mill_id, v_movement.season_id, 'invoice_collection_reversal',
    'receivable_movement', v_reverse_movement, v_actor, v_movement.operation_id
  ) RETURNING id INTO v_operation;

  IF v_movement.financial_transaction_id IS NOT NULL THEN
    SELECT * INTO v_original_financial
    FROM public.financial_transactions
    WHERE id = v_movement.financial_transaction_id
    FOR UPDATE;

    IF FOUND AND v_original_financial.payment_method = 'cash'::public.financial_payment_method THEN
      INSERT INTO public.financial_transactions(
        created_by, mill_id, season_id, type, category, amount, direction,
        payment_method, reference_type, reference_id, party_type, party_id,
        party_name, description, status, operation_id, idempotency_key,
        reversal_of, reversal_reason
      ) VALUES (
        v_actor, v_movement.mill_id, v_movement.season_id,
        'adjustment'::public.financial_tx_type,
        'invoice_collection_reversal',
        v_original_financial.amount,
        'out'::public.financial_direction,
        'cash'::public.financial_payment_method,
        'financial_reversal', v_original_financial.id,
        v_original_financial.party_type, v_original_financial.party_id,
        v_original_financial.party_name,
        'عكس تحصيل فاتورة: ' || btrim(p_reason),
        'active'::public.financial_tx_status,
        v_operation, p_idempotency_key,
        v_original_financial.id, btrim(p_reason)
      ) RETURNING id INTO v_reverse_financial;
    END IF;
  END IF;

  INSERT INTO public.receivable_movements(
    id, mill_id, season_id, customer_id, invoice_id, customer_payment_id,
    operation_id, movement_type, amount, financial_transaction_id,
    reversal_of, reason, created_by
  ) VALUES (
    v_reverse_movement, v_movement.mill_id, v_movement.season_id,
    v_movement.customer_id, v_movement.invoice_id, v_movement.customer_payment_id,
    v_operation, 'collection_reversal', -v_movement.amount, v_reverse_financial,
    v_movement.id, btrim(p_reason), v_actor
  );

  PERFORM private.complete_business_command(
    p_idempotency_key,
    'reverse_invoice_collection',
    jsonb_build_object(
      'success', true,
      'invoice_id', v_invoice.id,
      'reversal_movement_id', v_reverse_movement,
      'financial_reversal_id', v_reverse_financial
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice.id,
    'reversal_movement_id', v_reverse_movement,
    'financial_reversal_id', v_reverse_financial
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_invoice_collection_lifecycle_command(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_collection_lifecycle_command(uuid, text, uuid) TO authenticated;
