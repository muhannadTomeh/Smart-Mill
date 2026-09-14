CREATE OR REPLACE FUNCTION public.record_vault_expense_lifecycle_command(
  p_season_id uuid, p_category text, p_amount numeric, p_description text,
  p_payment_method text, p_partner_id uuid, p_supplier_id uuid,
  p_partner_name text, p_creditor_name text, p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_mill uuid; v_previous jsonb; v_expense uuid;
  v_payable uuid; v_operation uuid; v_financial uuid; v_vault public.cash_vaults%ROWTYPE;
  v_partner uuid := p_partner_id; v_name text;
BEGIN
  IF v_actor IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_payment_method NOT IN ('cash','credit','partner') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INVALID_VAULT_EXPENSE';
  END IF;
  SELECT mill_id INTO v_mill FROM public.seasons WHERE id=p_season_id FOR SHARE;
  IF v_mill IS NULL OR NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='VAULT_OWNER_REQUIRED';
  END IF;
  v_previous := private.claim_business_command(p_idempotency_key,'record_vault_expense',v_mill,p_season_id);
  IF v_previous IS NOT NULL THEN RETURN v_previous; END IF;
  IF p_partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partners WHERE id=p_partner_id AND mill_id=v_mill) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PARTNER_NOT_IN_MILL';
  END IF;
  v_name := CASE WHEN p_payment_method='partner' THEN coalesce(nullif(btrim(p_partner_name),''),(SELECT name FROM public.partners WHERE id=p_partner_id),'شريك')
                 WHEN p_payment_method='credit' THEN coalesce(nullif(btrim(p_creditor_name),''),'مورد') ELSE NULL END;
  IF p_payment_method='cash' THEN
    INSERT INTO public.cash_vaults(mill_id,season_id,balance) VALUES(v_mill,p_season_id,0) ON CONFLICT(mill_id,season_id) DO NOTHING;
    SELECT * INTO v_vault FROM public.cash_vaults WHERE mill_id=v_mill AND season_id=p_season_id FOR UPDATE;
    IF v_vault.balance < p_amount THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INSUFFICIENT_VAULT_CASH'; END IF;
  ELSE
    INSERT INTO public.payables(mill_id,season_id,type,partner_id,supplier_id,creditor_name,original_amount,paid_amount,remaining_amount,source_type,status,notes,created_by)
    VALUES(v_mill,p_season_id,CASE WHEN p_payment_method='partner' THEN 'due_to_partner' ELSE 'due_to_supplier' END,v_partner,p_supplier_id,v_name,p_amount,0,p_amount,'expense','unpaid',p_description,v_actor)
    RETURNING id INTO v_payable;
  END IF;
  INSERT INTO public.expenses(user_id,season_id,mill_id,category,amount,description,payment_method,partner_id,supplier_id,payable_id,cash_session_id)
  VALUES(v_actor,p_season_id,v_mill,btrim(p_category),p_amount,nullif(btrim(p_description),''),p_payment_method,v_partner,p_supplier_id,v_payable,NULL)
  RETURNING id INTO v_expense;
  INSERT INTO public.business_operations(mill_id,season_id,operation_type,source_type,source_id,created_by)
  VALUES(v_mill,p_season_id,'vault_expense','expense',v_expense,v_actor) RETURNING id INTO v_operation;
  INSERT INTO public.financial_transactions(mill_id,season_id,type,amount,direction,payment_method,reference_id,reference_type,description,category,status,created_by,party_type,party_id,party_name,cash_location,operation_id)
  VALUES(v_mill,p_season_id,'expense',p_amount,CASE WHEN p_payment_method='cash' THEN 'out'::financial_direction ELSE 'none'::financial_direction END,
    CASE WHEN p_payment_method='cash' THEN 'cash'::financial_payment_method ELSE 'credit'::financial_payment_method END,
    v_expense,'expense',p_description,btrim(p_category),'active',v_actor,
    CASE WHEN p_payment_method='partner' THEN 'partner' WHEN p_payment_method='credit' THEN 'supplier' ELSE NULL END,
    coalesce(v_partner,p_supplier_id),v_name,CASE WHEN p_payment_method='cash' THEN 'vault' ELSE NULL END,v_operation)
  RETURNING id INTO v_financial;
  IF p_payment_method='cash' THEN UPDATE public.cash_vaults SET balance=balance-p_amount,updated_at=now() WHERE id=v_vault.id; END IF;
  PERFORM private.complete_business_command(p_idempotency_key,'record_vault_expense',jsonb_build_object('success',true,'expense_id',v_expense,'payable_id',v_payable,'operation_id',v_operation,'financial_transaction_id',v_financial),v_operation);
  RETURN jsonb_build_object('success',true,'expense_id',v_expense,'payable_id',v_payable,'operation_id',v_operation,'financial_transaction_id',v_financial);
END;
$$;

REVOKE ALL ON FUNCTION public.record_vault_expense_lifecycle_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vault_expense_lifecycle_command(uuid,text,numeric,text,text,uuid,uuid,text,text,uuid) TO authenticated;
