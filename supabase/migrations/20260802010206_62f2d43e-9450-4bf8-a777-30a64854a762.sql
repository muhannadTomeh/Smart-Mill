CREATE OR REPLACE FUNCTION public.create_invoice_and_settle(
  p_season_id uuid,
  p_customer_name text,
  p_oil_produced numeric,
  p_container_count integer,
  p_container_type text,
  p_payment_type text,
  p_oil_amount numeric,
  p_cash_amount numeric,
  p_total_display text,
  p_customer_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_invoice_id uuid;
  v_oil_delta numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.seasons s WHERE s.id = p_season_id AND s.user_id = v_user) THEN
    RAISE EXCEPTION 'Season not found for this user';
  END IF;

  INSERT INTO public.invoices (
    user_id, season_id, customer_id, customer_name, oil_produced,
    container_count, container_type, payment_type, oil_amount, cash_amount, total_display
  ) VALUES (
    v_user, p_season_id, p_customer_id, p_customer_name, p_oil_produced,
    p_container_count, p_container_type, p_payment_type, p_oil_amount, p_cash_amount, p_total_display
  ) RETURNING id INTO v_invoice_id;

  v_oil_delta := COALESCE(p_oil_produced, 0) - COALESCE(p_oil_amount, 0);

  UPDATE public.inventory
     SET total_oil = COALESCE(total_oil, 0) + v_oil_delta,
         total_cash = COALESCE(total_cash, 0) + COALESCE(p_cash_amount, 0),
         updated_at = now()
   WHERE user_id = v_user AND season_id = p_season_id;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (user_id, season_id, total_oil, total_cash)
    VALUES (v_user, p_season_id, v_oil_delta, COALESCE(p_cash_amount, 0));
  END IF;

  IF p_queue_id IS NOT NULL THEN
    UPDATE public.queue SET status = 'completed'
     WHERE id = p_queue_id AND user_id = v_user;
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_settle(uuid, text, numeric, integer, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;