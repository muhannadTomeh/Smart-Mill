-- Purchase workflows must create exactly one stock movement and one financial event.
-- Credit and partner-funded purchases additionally create a payable using the
-- canonical payables source type: `purchase`.
CREATE OR REPLACE FUNCTION public.record_product_purchase_atomic(
  p_season_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_payment_method text, p_supplier_id uuid DEFAULT NULL, p_partner_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL, p_sale_price numeric DEFAULT NULL, p_partner_name text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_product public.products%ROWTYPE;
  v_supplier_name text;
  v_partner_name text;
  v_total numeric;
  v_previous jsonb;
  v_operation uuid;
  v_purchase uuid;
  v_payable uuid;
  v_financial uuid;
  v_partner uuid := p_partner_id;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT mill_id INTO v_mill FROM public.seasons WHERE id = p_season_id;
  IF v_mill IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEASON_NOT_FOUND';
  END IF;

  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRODUCT_PURCHASE_FORBIDDEN';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> trunc(p_quantity)
     OR p_unit_price IS NULL OR p_unit_price <= 0
     OR (p_sale_price IS NOT NULL AND p_sale_price < 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRODUCT_PURCHASE_INVALID';
  END IF;

  IF p_payment_method NOT IN ('cash', 'credit', 'partner') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_METHOD_INVALID';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND mill_id = v_mill AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND mill_id = v_mill AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_NOT_FOUND';
  END IF;

  -- The UI accepts either a quick-selected partner or an exact typed partner name.
  IF p_payment_method = 'partner' AND v_partner IS NULL
     AND nullif(btrim(p_partner_name), '') IS NOT NULL THEN
    SELECT id INTO v_partner
    FROM public.partners
    WHERE mill_id = v_mill
      AND lower(btrim(name)) = lower(btrim(p_partner_name))
    LIMIT 1;
  END IF;

  IF p_payment_method = 'partner' THEN
    IF v_partner IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PARTNER_REQUIRED';
    END IF;

    SELECT name INTO v_partner_name
    FROM public.partners
    WHERE id = v_partner AND mill_id = v_mill;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PARTNER_NOT_FOUND';
    END IF;
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key, 'product_purchase', v_mill, p_season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  v_total := p_quantity * p_unit_price;

  INSERT INTO public.business_operations(mill_id, season_id, operation_type, source_type, created_by)
  VALUES (v_mill, p_season_id, 'product_purchase', 'product_purchase', v_actor)
  RETURNING id INTO v_operation;

  INSERT INTO public.product_purchases(
    mill_id, season_id, product_id, supplier_id, quantity, unit_price, total_price,
    payment_method, partner_id, notes, created_by
  ) VALUES (
    v_mill, p_season_id, p_product_id, p_supplier_id, p_quantity::integer, p_unit_price, v_total,
    p_payment_method, v_partner, p_notes, v_actor
  ) RETURNING id INTO v_purchase;

  INSERT INTO public.product_stock_movements(
    mill_id, season_id, product_id, quantity, type, reference_type, reference_id,
    notes, created_by, idempotency_key
  ) VALUES (
    v_mill, p_season_id, p_product_id, p_quantity::integer, 'purchase', 'product_purchase',
    v_purchase, p_notes, v_actor, p_idempotency_key
  );

  UPDATE public.products
  SET current_stock = current_stock + p_quantity::integer,
      default_purchase_price = p_unit_price,
      default_sale_price = coalesce(p_sale_price, default_sale_price),
      updated_at = now()
  WHERE id = p_product_id;

  IF p_payment_method = 'credit' THEN
    INSERT INTO public.payables(
      mill_id, season_id, type, supplier_id, creditor_name, original_amount,
      paid_amount, remaining_amount, source_type, source_id, status, notes, created_by
    ) VALUES (
      v_mill, p_season_id, 'due_to_supplier', p_supplier_id, v_supplier_name, v_total,
      0, v_total, 'purchase', v_purchase, 'unpaid', p_notes, v_actor
    ) RETURNING id INTO v_payable;
  ELSIF p_payment_method = 'partner' THEN
    INSERT INTO public.payables(
      mill_id, season_id, type, partner_id, creditor_name, original_amount,
      paid_amount, remaining_amount, source_type, source_id, status, notes, created_by
    ) VALUES (
      v_mill, p_season_id, 'due_to_partner', v_partner, v_partner_name, v_total,
      0, v_total, 'purchase', v_purchase, 'unpaid', p_notes, v_actor
    ) RETURNING id INTO v_payable;
  END IF;

  INSERT INTO public.financial_transactions(
    created_by, mill_id, season_id, type, category, amount, direction, payment_method,
    reference_type, reference_id, party_type, party_id, party_name, description,
    status, operation_id, idempotency_key
  ) VALUES (
    v_actor, v_mill, p_season_id, 'stock_purchase', 'stock_purchase', v_total,
    (CASE WHEN p_payment_method = 'cash' THEN 'out' ELSE 'none' END)::public.financial_direction,
    (CASE WHEN p_payment_method = 'cash' THEN 'cash' ELSE 'credit' END)::public.financial_payment_method,
    'product_purchase', v_purchase,
    CASE WHEN p_payment_method = 'partner' THEN 'partner' ELSE 'supplier' END,
    CASE WHEN p_payment_method = 'partner' THEN v_partner ELSE p_supplier_id END,
    CASE WHEN p_payment_method = 'partner' THEN v_partner_name ELSE v_supplier_name END,
    'Purchase of goods: ' || v_product.name,
    'active', v_operation, p_idempotency_key
  ) RETURNING id INTO v_financial;

  PERFORM private.complete_business_command(
    p_idempotency_key,
    'product_purchase',
    jsonb_build_object(
      'success', true,
      'purchase_id', v_purchase,
      'financial_transaction_id', v_financial,
      'payable_id', v_payable
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase,
    'financial_transaction_id', v_financial,
    'payable_id', v_payable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_product_purchase_atomic(
  uuid, uuid, numeric, numeric, text, uuid, uuid, text, numeric, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_purchase_atomic(
  uuid, uuid, numeric, numeric, text, uuid, uuid, text, numeric, text, uuid
) TO authenticated;
