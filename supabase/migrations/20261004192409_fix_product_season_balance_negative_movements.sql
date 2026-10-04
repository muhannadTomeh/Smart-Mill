CREATE OR REPLACE FUNCTION public.enforce_product_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_STOCK_MOVEMENT_QUANTITY_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.seasons AS season
    WHERE season.id = NEW.season_id
      AND season.mill_id = NEW.mill_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SEASON_MILL_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products AS product
    WHERE product.id = NEW.product_id
      AND product.mill_id = NEW.mill_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_MILL_MISMATCH';
  END IF;

  BEGIN
    -- Insert a neutral row first. Inserting NEW.quantity directly would make a
    -- valid negative movement fail its CHECK before ON CONFLICT can add it to
    -- an existing positive balance.
    INSERT INTO public.product_season_balances (
      mill_id,
      season_id,
      product_id,
      current_stock,
      created_at,
      updated_at
    )
    VALUES (
      NEW.mill_id,
      NEW.season_id,
      NEW.product_id,
      0,
      now(),
      now()
    )
    ON CONFLICT (mill_id, season_id, product_id) DO NOTHING;

    UPDATE public.product_season_balances
    SET current_stock = current_stock + NEW.quantity,
        updated_at = now()
    WHERE mill_id = NEW.mill_id
      AND season_id = NEW.season_id
      AND product_id = NEW.product_id;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INSUFFICIENT_PRODUCT_STOCK';
  END;

  RETURN NEW;
END;
$function$;
