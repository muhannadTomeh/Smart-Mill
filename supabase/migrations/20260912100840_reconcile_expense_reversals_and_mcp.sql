-- Keep expense cancellation auditable and reconcile every affected balance atomically.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE INDEX IF NOT EXISTS expenses_active_mill_season_idx
  ON public.expenses (mill_id, season_id, created_at DESC)
  WHERE voided_at IS NULL;

CREATE OR REPLACE FUNCTION public.void_expense_and_reverse(
  p_expense_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_financial_transaction_id uuid;
  v_has_access boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المصروف غير موجود';
  END IF;

  IF v_expense.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'هذا المصروف ملغى مسبقاً';
  END IF;

  SELECT public.is_platform_admin(v_caller)
      OR EXISTS (
        SELECT 1
        FROM public.mill_memberships
        WHERE user_id = v_caller
          AND mill_id = v_expense.mill_id
          AND role = 'mill_owner'
          AND is_active = true
      )
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'إلغاء المصروفات مخصص لمالك المعصرة أو مشرف المنصة';
  END IF;

  -- A payable may have been settled partially. Its reversal needs a dedicated
  -- settlement workflow, so never silently alter that financial obligation.
  IF v_expense.payable_id IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن إلغاء مصروف مرتبط بذمة مالية من هذه الشاشة';
  END IF;

  SELECT id INTO v_financial_transaction_id
  FROM public.financial_transactions
  WHERE reference_id = v_expense.id
    AND reference_type = 'expense'
    AND status = 'active'
  FOR UPDATE;

  IF v_financial_transaction_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد حركة مالية نشطة مرتبطة بهذا المصروف';
  END IF;

  UPDATE public.financial_transactions
  SET status = 'voided',
      description = COALESCE(description, '')
        || ' [ملغاة: ' || COALESCE(NULLIF(trim(p_reason), ''), 'بدون سبب') || ']'
  WHERE id = v_financial_transaction_id;

  IF COALESCE(v_expense.payment_method, 'cash') = 'cash' THEN
    UPDATE public.inventory
    SET total_cash = COALESCE(total_cash, 0) + v_expense.amount,
        updated_at = now()
    WHERE season_id = v_expense.season_id
      AND mill_id = v_expense.mill_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'تعذر عكس المصروف: سجل مخزون الموسم غير موجود';
    END IF;
  END IF;

  UPDATE public.expenses
  SET voided_at = now(),
      voided_by = v_caller,
      void_reason = NULLIF(trim(p_reason), '')
  WHERE id = v_expense.id;

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', v_expense.id,
    'financial_transaction_id', v_financial_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_expense_and_reverse(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_expense_and_reverse(uuid, text) TO authenticated, service_role;
