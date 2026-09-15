CREATE OR REPLACE FUNCTION public.void_expense_and_reverse(
  p_expense_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_original public.financial_transactions%ROWTYPE;
  v_reversal_id uuid;
  v_operation_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND OR v_expense.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Expense cannot be reversed';
  END IF;
  IF v_expense.payable_id IS NOT NULL THEN
    RAISE EXCEPTION 'A payable-backed expense must be reversed through its payable workflow';
  END IF;
  IF NOT public.is_platform_admin(v_caller)
    AND NOT public.has_active_mill_role(v_expense.mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION 'Only the mill owner may reverse an expense';
  END IF;

  SELECT * INTO v_original
  FROM public.financial_transactions
  WHERE reference_type = 'expense'
    AND reference_id = v_expense.id
    AND status = 'active'::public.financial_tx_status
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active financial event exists for this expense';
  END IF;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, source_id, created_by
  ) VALUES (
    v_expense.mill_id, v_expense.season_id, 'expense_cancellation', 'expense', v_expense.id, v_caller
  ) RETURNING id INTO v_operation_id;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, party_type, party_id, party_name, description,
    status, operation_id, reversal_of, reversal_reason
  ) VALUES (
    v_caller, v_original.mill_id, v_original.season_id, 'adjustment', 'expense_reversal', v_original.amount,
    (CASE WHEN v_original.direction = 'in' THEN 'out' ELSE 'in' END)::public.financial_direction,
    v_original.payment_method, 'financial_reversal', v_original.id,
    v_original.party_type, v_original.party_id, v_original.party_name,
    'إلغاء مصروف: ' || coalesce(nullif(btrim(p_reason), ''), 'بدون سبب'),
    'active', v_operation_id, v_original.id, nullif(btrim(p_reason), '')
  ) RETURNING id INTO v_reversal_id;

  UPDATE public.expenses
  SET voided_at = now(),
      voided_by = v_caller,
      void_reason = nullif(btrim(p_reason), '')
  WHERE id = v_expense.id;

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', v_expense.id,
    'reversal_financial_transaction_id', v_reversal_id
  );
END;
$$;
