-- Invoice container lines are the canonical stock source.  The old invoice
-- argument stores only a printable summary and cannot reliably identify a product.
CREATE OR REPLACE FUNCTION public.create_invoice_with_containers_command(
  p_season_id uuid, p_customer_name text, p_oil_produced numeric,
  p_container_count integer, p_container_type text, p_payment_type text,
  p_oil_amount numeric, p_cash_amount numeric, p_total_display text,
  p_customer_id uuid, p_queue_id uuid, p_container_lines jsonb,
  p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_previous jsonb; v_invoice_id uuid; v_line jsonb; v_product public.products%ROWTYPE;
  v_quantity integer; v_total_quantity integer := 0; v_inner_key uuid := gen_random_uuid();
BEGIN
  v_previous := public.claim_financial_command(p_idempotency_key, 'invoice_with_containers');
  IF v_previous IS NOT NULL THEN RETURN (v_previous->>'invoice_id')::uuid; END IF;

  IF jsonb_typeof(coalesce(p_container_lines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Container lines must be an array';
  END IF;

  -- This existing canonical invoice command validates tenant access, cash-session
  -- requirements, financial events, inventory cash and oil settlement movements.
  v_invoice_id := public.create_invoice_command(
    p_season_id, p_customer_name, p_oil_produced, p_container_count,
    p_container_type, p_payment_type, p_oil_amount, p_cash_amount,
    p_total_display, p_customer_id, p_queue_id, v_inner_key
  );

  FOR v_line IN SELECT value FROM jsonb_array_elements(coalesce(p_container_lines, '[]'::jsonb)) LOOP
    v_quantity := nullif(v_line->>'quantity','')::integer;
    IF v_quantity IS NULL OR v_quantity <= 0 OR nullif(btrim(v_line->>'name'),'') IS NULL THEN
      RAISE EXCEPTION 'Each container line requires a positive quantity and product name';
    END IF;
    SELECT * INTO v_product FROM public.products
    WHERE mill_id = (SELECT mill_id FROM public.seasons WHERE id=p_season_id)
      AND name ILIKE btrim(v_line->>'name')
      AND active = true
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Container product not found: %', v_line->>'name'; END IF;
    IF v_product.current_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for container %', v_product.name;
    END IF;
    INSERT INTO public.product_stock_movements (mill_id,season_id,product_id,quantity,type,reference_type,reference_id,notes,created_by)
    VALUES (v_product.mill_id,p_season_id,v_product.id,-v_quantity,'sale','invoice',v_invoice_id,
      'Container issued with invoice ' || p_customer_name,auth.uid());
    UPDATE public.products SET current_stock=current_stock-v_quantity,updated_at=now() WHERE id=v_product.id;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  IF v_total_quantity <> coalesce(p_container_count,0) THEN
    RAISE EXCEPTION 'Container line total does not match invoice container count';
  END IF;
  PERFORM public.complete_financial_command(p_idempotency_key,jsonb_build_object('invoice_id',v_invoice_id));
  RETURN v_invoice_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_invoice_with_containers_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_containers_command(uuid,text,numeric,integer,text,text,numeric,numeric,text,uuid,uuid,jsonb,uuid) TO authenticated, service_role;
