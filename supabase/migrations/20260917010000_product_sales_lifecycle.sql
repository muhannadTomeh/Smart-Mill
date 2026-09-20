-- Product sales lifecycle:
-- cash sale -> stock OUT + cash IN
-- cancellation -> stock IN + cash OUT
-- immutable history through reversal instead of deletion.

CREATE TABLE IF NOT EXISTS public.product_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price > 0),
  total_price numeric NOT NULL CHECK (total_price > 0),
  customer_name text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  operation_id uuid REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancellation_reason text,

  CONSTRAINT product_sales_cancellation_consistent CHECK (
    (
      status = 'active'
      AND cancelled_by IS NULL
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
    OR
    (
      status = 'cancelled'
      AND cancelled_by IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND nullif(btrim(cancellation_reason), '') IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS product_sales_tenant_idx
  ON public.product_sales (mill_id, season_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_sales_product_idx
  ON public.product_sales (product_id, created_at DESC);

ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_sales_select_tenant ON public.product_sales;

CREATE POLICY product_sales_select_tenant
ON public.product_sales
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_active_mill_role(
    mill_id,
    ARRAY['mill_owner', 'mill_employee']
  )
);

REVOKE ALL ON TABLE public.product_sales
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.product_sales TO authenticated;


-- =========================================================
-- RECORD PRODUCT SALE
-- =========================================================

CREATE OR REPLACE FUNCTION public.record_product_sale_command(
  p_season_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_price numeric DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_product public.products%ROWTYPE;
  v_quantity integer;
  v_price numeric;
  v_total numeric;
  v_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_previous jsonb;
  v_sale uuid;
  v_operation uuid;
  v_stock_movement uuid;
  v_financial uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT mill_id
  INTO v_mill
  FROM public.seasons
  WHERE id = p_season_id;

  IF v_mill IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SEASON_NOT_FOUND';
  END IF;

  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(
       v_mill,
       ARRAY['mill_owner', 'mill_employee']
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_FORBIDDEN';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_INVALID_QUANTITY';
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND mill_id = v_mill
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_NOT_FOUND';
  END IF;

  v_quantity := p_quantity;
  v_price := coalesce(p_unit_price, v_product.default_sale_price);

  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_INVALID_PRICE';
  END IF;

  IF v_product.current_stock < v_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INSUFFICIENT_PRODUCT_STOCK';
  END IF;

  v_previous := private.claim_business_command(
    v_key,
    'record_product_sale',
    v_mill,
    p_season_id
  );

  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  v_total := v_quantity * v_price;

  INSERT INTO public.product_sales (
    mill_id,
    season_id,
    product_id,
    quantity,
    unit_price,
    total_price,
    customer_name,
    notes,
    created_by
  )
  VALUES (
    v_mill,
    p_season_id,
    v_product.id,
    v_quantity,
    v_price,
    v_total,
    nullif(btrim(p_customer_name), ''),
    nullif(btrim(p_notes), ''),
    v_actor
  )
  RETURNING id INTO v_sale;

  INSERT INTO public.business_operations (
    mill_id,
    season_id,
    operation_type,
    source_type,
    source_id,
    created_by
  )
  VALUES (
    v_mill,
    p_season_id,
    'product_sale',
    'product_sale',
    v_sale,
    v_actor
  )
  RETURNING id INTO v_operation;

  UPDATE public.product_sales
  SET operation_id = v_operation
  WHERE id = v_sale;

  INSERT INTO public.product_stock_movements (
    mill_id,
    season_id,
    product_id,
    quantity,
    type,
    reference_type,
    reference_id,
    notes,
    created_by,
    idempotency_key
  )
  VALUES (
    v_mill,
    p_season_id,
    v_product.id,
    -v_quantity,
    'sale',
    'product_sale',
    v_sale,
    coalesce(
      nullif(btrim(p_notes), ''),
      'بيع بضاعة: ' || v_product.name
    ),
    v_actor,
    v_key
  )
  RETURNING id INTO v_stock_movement;

  UPDATE public.products
  SET
    current_stock = current_stock - v_quantity,
    updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO public.financial_transactions (
    created_by,
    mill_id,
    season_id,
    type,
    category,
    amount,
    direction,
    payment_method,
    reference_type,
    reference_id,
    party_name,
    description,
    status,
    operation_id,
    idempotency_key
  )
  VALUES (
    v_actor,
    v_mill,
    p_season_id,
    'product_sale',
    'product_sale',
    v_total,
    'in',
    'cash',
    'product_sale',
    v_sale,
    nullif(btrim(p_customer_name), ''),
    'بيع بضاعة: ' || v_product.name,
    'active',
    v_operation,
    v_key
  )
  RETURNING id INTO v_financial;

  PERFORM private.complete_business_command(
    v_key,
    'record_product_sale',
    jsonb_build_object(
      'success', true,
      'sale_id', v_sale,
      'financial_transaction_id', v_financial,
      'stock_movement_id', v_stock_movement,
      'total', v_total
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale,
    'financial_transaction_id', v_financial,
    'stock_movement_id', v_stock_movement,
    'total', v_total
  );
END;
$$;


-- =========================================================
-- CANCEL PRODUCT SALE
-- =========================================================

CREATE OR REPLACE FUNCTION public.cancel_product_sale_command(
  p_sale_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_sale public.product_sales%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_original_fin public.financial_transactions%ROWTYPE;
  v_previous jsonb;
  v_operation uuid;
  v_stock_reversal uuid;
  v_financial_reversal uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CANCELLATION_REASON_REQUIRED';
  END IF;

  SELECT *
  INTO v_sale
  FROM public.product_sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_NOT_FOUND';
  END IF;

  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(
       v_sale.mill_id,
       ARRAY['mill_owner']
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_CANCEL_FORBIDDEN';
  END IF;

  IF v_sale.status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_ALREADY_CANCELLED';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key,
    'cancel_product_sale',
    v_sale.mill_id,
    v_sale.season_id
  );

  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = v_sale.product_id
    AND mill_id = v_sale.mill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_original_fin
  FROM public.financial_transactions
  WHERE reference_type = 'product_sale'
    AND reference_id = v_sale.id
    AND reversal_of IS NULL
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_LEDGER_EVENT_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.financial_transactions
    WHERE reversal_of = v_original_fin.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_SALE_ALREADY_CANCELLED';
  END IF;

  INSERT INTO public.business_operations (
    mill_id,
    season_id,
    operation_type,
    source_type,
    source_id,
    created_by,
    reverses_operation_id
  )
  VALUES (
    v_sale.mill_id,
    v_sale.season_id,
    'product_sale_cancellation',
    'product_sale_cancellation',
    v_sale.id,
    v_actor,
    v_sale.operation_id
  )
  RETURNING id INTO v_operation;

  INSERT INTO public.product_stock_movements (
    mill_id,
    season_id,
    product_id,
    quantity,
    type,
    reference_type,
    reference_id,
    notes,
    created_by,
    idempotency_key
  )
  VALUES (
    v_sale.mill_id,
    v_sale.season_id,
    v_sale.product_id,
    v_sale.quantity,
    'adjustment',
    'product_sale_cancellation',
    v_sale.id,
    'إلغاء بيع بضاعة: ' || btrim(p_reason),
    v_actor,
    p_idempotency_key
  )
  RETURNING id INTO v_stock_reversal;

  UPDATE public.products
  SET
    current_stock = current_stock + v_sale.quantity,
    updated_at = now()
  WHERE id = v_sale.product_id;

  INSERT INTO public.financial_transactions (
    created_by,
    mill_id,
    season_id,
    type,
    category,
    amount,
    direction,
    payment_method,
    reference_type,
    reference_id,
    party_name,
    description,
    status,
    operation_id,
    idempotency_key,
    reversal_of,
    reversal_reason
  )
  VALUES (
    v_actor,
    v_sale.mill_id,
    v_sale.season_id,
    'adjustment',
    'product_sale_cancellation',
    v_sale.total_price,
    'out',
    'cash',
    'product_sale_cancellation',
    v_sale.id,
    v_sale.customer_name,
    'إلغاء بيع بضاعة',
    'active',
    v_operation,
    p_idempotency_key,
    v_original_fin.id,
    btrim(p_reason)
  )
  RETURNING id INTO v_financial_reversal;

  UPDATE public.business_operations
  SET
    status = 'cancelled',
    cancelled_by = v_actor,
    cancelled_at = now(),
    cancellation_reason = btrim(p_reason)
  WHERE id = v_sale.operation_id;

  UPDATE public.product_sales
  SET
    status = 'cancelled',
    cancelled_by = v_actor,
    cancelled_at = now(),
    cancellation_reason = btrim(p_reason)
  WHERE id = v_sale.id;

  PERFORM private.complete_business_command(
    p_idempotency_key,
    'cancel_product_sale',
    jsonb_build_object(
      'success', true,
      'sale_id', v_sale.id,
      'financial_reversal_id', v_financial_reversal,
      'stock_reversal_id', v_stock_reversal
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale.id,
    'financial_reversal_id', v_financial_reversal,
    'stock_reversal_id', v_stock_reversal
  );
END;
$$;


REVOKE ALL ON FUNCTION public.record_product_sale_command(
  uuid, uuid, integer, numeric, text, text, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.cancel_product_sale_command(
  uuid, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_product_sale_command(
  uuid, uuid, integer, numeric, text, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_product_sale_command(
  uuid, text, uuid
) TO authenticated;
