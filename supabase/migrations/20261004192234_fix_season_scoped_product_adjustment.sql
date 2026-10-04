CREATE OR REPLACE FUNCTION public.adjust_product_stock_command(
  p_season_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_mill_id uuid;
  v_previous jsonb;
  v_stock integer;
BEGIN
  IF v_caller IS NULL OR p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_STOCK_ADJUSTMENT_INVALID';
  END IF;

  SELECT season.mill_id
  INTO v_mill_id
  FROM public.seasons AS season
  WHERE season.id = p_season_id;

  IF v_mill_id IS NULL
     OR NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner']) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_STOCK_ADJUSTMENT_FORBIDDEN';
  END IF;

  v_previous := public.claim_financial_command(
    p_idempotency_key,
    'product_stock_adjustment'
  );

  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  -- Lock the shared product definition only to serialize the legacy aggregate
  -- cache update. Availability is enforced by the season-scoped movement trigger.
  PERFORM 1
  FROM public.products
  WHERE id = p_product_id
    AND mill_id = v_mill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_NOT_FOUND';
  END IF;

  INSERT INTO public.product_stock_movements (
    mill_id,
    season_id,
    product_id,
    quantity,
    type,
    reference_type,
    notes,
    created_by,
    idempotency_key
  )
  VALUES (
    v_mill_id,
    p_season_id,
    p_product_id,
    p_quantity,
    'adjustment',
    'manual_adjustment',
    nullif(btrim(p_notes), ''),
    v_caller,
    p_idempotency_key
  );

  -- Transitional mill-wide cache only. Canonical reads use the seasonal balance.
  UPDATE public.products
  SET current_stock = current_stock + p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  SELECT balance.current_stock
  INTO v_stock
  FROM public.product_season_balances AS balance
  WHERE balance.mill_id = v_mill_id
    AND balance.season_id = p_season_id
    AND balance.product_id = p_product_id;

  PERFORM public.complete_financial_command(
    p_idempotency_key,
    jsonb_build_object(
      'success', true,
      'product_id', p_product_id,
      'current_stock', v_stock
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'current_stock', v_stock
  );
END;
$function$;
