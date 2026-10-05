-- Product definitions are mill-scoped. Whether a product is offered as an
-- invoice line is a separate concern from its descriptive product type.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_in_invoices boolean NOT NULL DEFAULT false;

-- Preserve the behavior of products that were explicitly defined as containers.
UPDATE public.products
SET available_in_invoices = true
WHERE active = true
  AND (product_type = 'container' OR name ILIKE '%تنك%')
  AND available_in_invoices = false;

CREATE INDEX IF NOT EXISTS products_invoice_catalog_idx
  ON public.products (mill_id, created_at)
  WHERE active = true AND available_in_invoices = true;

COMMENT ON COLUMN public.products.available_in_invoices IS
  'Owner-controlled invoice catalog flag. Stock remains season-scoped in product_season_balances.';

CREATE OR REPLACE FUNCTION public.set_product_invoice_availability_command(
  p_product_id uuid,
  p_available boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mill_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT mill_id
  INTO v_mill_id
  FROM public.products
  WHERE id = p_product_id
    AND active = true
  FOR UPDATE;

  IF v_mill_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_NOT_FOUND';
  END IF;

  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner'])
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_INVOICE_AVAILABILITY_FORBIDDEN';
  END IF;

  UPDATE public.products
  SET available_in_invoices = coalesce(p_available, false),
      updated_at = now()
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'available_in_invoices', coalesce(p_available, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_product_invoice_availability_command(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_invoice_availability_command(uuid, boolean)
  TO authenticated, service_role;

-- Enforce owner-only changes even if a browser client attempts a direct table
-- update instead of using the command above.
CREATE OR REPLACE FUNCTION public.enforce_product_invoice_availability_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mill_id uuid;
  v_changed boolean;
BEGIN
  v_mill_id := NEW.mill_id;
  v_changed := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.available_in_invoices
    ELSE OLD.available_in_invoices IS DISTINCT FROM NEW.available_in_invoices
  END;

  IF v_changed
     AND NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_mill_id, ARRAY['mill_owner'])
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_INVOICE_AVAILABILITY_FORBIDDEN';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_product_invoice_availability_owner()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_invoice_availability_owner
  ON public.products;
CREATE TRIGGER trg_products_invoice_availability_owner
BEFORE UPDATE OF available_in_invoices ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_invoice_availability_owner();

DROP TRIGGER IF EXISTS trg_products_invoice_availability_insert_owner
  ON public.products;
CREATE TRIGGER trg_products_invoice_availability_insert_owner
BEFORE INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_invoice_availability_owner();

-- Keep invoice creation atomic while validating against the canonical,
-- season-scoped stock projection. The movement trigger remains the final
-- non-negative stock guard.
CREATE OR REPLACE FUNCTION public.create_invoice_lifecycle_command(
  p_season_id uuid,
  p_customer_name text,
  p_oil_produced numeric DEFAULT 0,
  p_container_count integer DEFAULT 0,
  p_container_type text DEFAULT '',
  p_payment_type text DEFAULT 'cash',
  p_oil_amount numeric DEFAULT 0,
  p_cash_amount numeric DEFAULT 0,
  p_total_display text DEFAULT '',
  p_customer_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL,
  p_container_lines jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_previous jsonb;
  v_operation uuid;
  v_invoice uuid;
  v_financial uuid;
  v_oil uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_qty integer;
  v_price numeric;
  v_available_stock integer;
  v_total_qty integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='AUTHENTICATION_REQUIRED';
  END IF;

  SELECT mill_id INTO v_mill
  FROM public.seasons
  WHERE id = p_season_id;

  IF v_mill IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SEASON_NOT_FOUND';
  END IF;

  IF NOT public.is_platform_admin(v_actor)
     AND NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner','mill_employee'])
  THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INVOICE_CREATE_FORBIDDEN';
  END IF;

  IF coalesce(p_cash_amount, 0) < 0
     OR coalesce(p_oil_amount, 0) < 0
     OR jsonb_typeof(coalesce(p_container_lines, '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INVOICE_INVALID';
  END IF;

  v_previous := private.claim_business_command(
    p_idempotency_key,
    'create_invoice',
    v_mill,
    p_season_id
  );
  IF v_previous IS NOT NULL THEN
    RETURN v_previous;
  END IF;

  INSERT INTO public.business_operations(
    mill_id, season_id, operation_type, source_type, created_by
  ) VALUES (
    v_mill, p_season_id, 'invoice', 'invoice', v_actor
  )
  RETURNING id INTO v_operation;

  INSERT INTO public.invoices(
    user_id, mill_id, season_id, customer_id, customer_name,
    oil_produced, container_count, container_type, payment_type,
    oil_amount, cash_amount, total_display, unpaid_amount
  ) VALUES (
    v_actor, v_mill, p_season_id, p_customer_id,
    coalesce(nullif(btrim(p_customer_name), ''), 'زبون'),
    coalesce(p_oil_produced, 0), coalesce(p_container_count, 0),
    coalesce(p_container_type, ''), coalesce(p_payment_type, 'cash'),
    coalesce(p_oil_amount, 0), coalesce(p_cash_amount, 0),
    coalesce(p_total_display, ''), 0
  )
  RETURNING id INTO v_invoice;

  UPDATE public.business_operations
  SET source_id = v_invoice
  WHERE id = v_operation;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(coalesce(p_container_lines, '[]'::jsonb))
  LOOP
    v_qty := nullif(v_line->>'quantity', '')::integer;
    IF v_qty IS NULL
       OR v_qty <= 0
       OR nullif(v_line->>'product_id', '') IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE='P0001',
        MESSAGE='INVOICE_PRODUCT_LINES_INVALID';
    END IF;

    SELECT *
    INTO v_product
    FROM public.products
    WHERE id = (v_line->>'product_id')::uuid
      AND mill_id = v_mill
      AND active = true
      AND available_in_invoices = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PRODUCT_NOT_FOUND';
    END IF;

    SELECT current_stock
    INTO v_available_stock
    FROM public.product_season_balances
    WHERE mill_id = v_mill
      AND season_id = p_season_id
      AND product_id = v_product.id
    FOR UPDATE;

    IF coalesce(v_available_stock, 0) < v_qty THEN
      RAISE EXCEPTION USING
        ERRCODE='P0001',
        MESSAGE='INSUFFICIENT_PRODUCT_STOCK';
    END IF;

    v_price := coalesce(
      nullif(v_line->>'unit_price', '')::numeric,
      v_product.default_sale_price,
      0
    );

    INSERT INTO public.invoice_product_lines(
      mill_id, season_id, invoice_id, product_id,
      product_name_snapshot, quantity, unit_price_snapshot, line_total
    ) VALUES (
      v_mill, p_season_id, v_invoice, v_product.id,
      v_product.name, v_qty, v_price, v_qty * v_price
    );

    INSERT INTO public.product_stock_movements(
      mill_id, season_id, product_id, quantity, type,
      reference_type, reference_id, notes, created_by, idempotency_key
    ) VALUES (
      v_mill, p_season_id, v_product.id, -v_qty, 'sale',
      'invoice', v_invoice, 'صنف مضاف ضمن فاتورة عصر', v_actor,
      gen_random_uuid()
    );

    -- Transitional mill-wide cache only. Canonical reads use
    -- product_season_balances/product_stock_movements.
    UPDATE public.products
    SET current_stock = greatest(current_stock - v_qty, 0),
        updated_at = now()
    WHERE id = v_product.id;

    v_total_qty := v_total_qty + v_qty;
  END LOOP;

  IF v_total_qty <> coalesce(p_container_count, 0) THEN
    RAISE EXCEPTION USING
      ERRCODE='P0001',
      MESSAGE='INVOICE_PRODUCT_LINES_MISMATCH';
  END IF;

  IF coalesce(p_cash_amount, 0) > 0 THEN
    INSERT INTO public.financial_transactions(
      created_by, mill_id, season_id, type, category, amount,
      direction, payment_method, reference_type, reference_id,
      party_type, party_id, party_name, description, status,
      operation_id, idempotency_key
    ) VALUES (
      v_actor, v_mill, p_season_id, 'income', 'invoice', p_cash_amount,
      'in', 'cash', 'invoice', v_invoice, 'customer', p_customer_id,
      p_customer_name, 'فاتورة عصر نقدية', 'active', v_operation,
      p_idempotency_key
    )
    RETURNING id INTO v_financial;
  END IF;

  IF coalesce(p_oil_amount, 0) > 0 THEN
    INSERT INTO public.oil_movements(
      mill_id, season_id, ownership, direction, movement_type,
      source_type, quantity, amount, unit_price, party_name, notes,
      reference_type, reference_id, created_by, idempotency_key
    ) VALUES (
      v_mill, p_season_id, 'mill', 'in', 'IN', 'milling_settlement',
      p_oil_amount, p_oil_amount, 0, p_customer_name, 'رد من عملية عصر',
      'invoice', v_invoice, v_actor, p_idempotency_key
    )
    RETURNING id INTO v_oil;
  END IF;

  INSERT INTO public.invoice_effect_links(
    invoice_id, mill_id, season_id, operation_id,
    cash_financial_transaction_id, settlement_oil_movement_id
  ) VALUES (
    v_invoice, v_mill, p_season_id, v_operation, v_financial, v_oil
  );

  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue
    SET status = 'completed'
    WHERE id = p_queue_id
      AND mill_id = v_mill
      AND season_id = p_season_id;
  END IF;

  PERFORM private.complete_business_command(
    p_idempotency_key,
    'create_invoice',
    jsonb_build_object(
      'success', true,
      'invoice_id', v_invoice,
      'operation_id', v_operation
    ),
    v_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice,
    'operation_id', v_operation
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice_lifecycle_command(
  uuid, text, numeric, integer, text, text, numeric, numeric,
  text, uuid, uuid, jsonb, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_lifecycle_command(
  uuid, text, numeric, integer, text, text, numeric, numeric,
  text, uuid, uuid, jsonb, uuid
) TO authenticated, service_role;
