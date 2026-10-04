-- Product definitions remain mill-scoped, while quantities are isolated by season.
-- product_stock_movements stays the append-only source of truth. This table is a
-- protected projection used by commands and read models for atomic balance checks.
CREATE TABLE public.product_season_balances (
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  current_stock integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_season_balances_pkey
    PRIMARY KEY (mill_id, season_id, product_id),
  CONSTRAINT product_season_balances_current_stock_nonnegative
    CHECK (current_stock >= 0)
);

CREATE INDEX product_season_balances_season_idx
  ON public.product_season_balances (season_id, product_id);

ALTER TABLE public.product_season_balances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_season_balances FROM anon, authenticated;
GRANT SELECT ON TABLE public.product_season_balances TO authenticated;

CREATE POLICY product_season_balances_tenant_read
  ON public.product_season_balances
  FOR SELECT
  TO authenticated
  USING (public.check_user_mill_access(mill_id));

COMMENT ON TABLE public.product_season_balances IS
  'Protected season-scoped projection of product_stock_movements. Browser clients have read-only access.';

COMMENT ON COLUMN public.products.current_stock IS
  'Legacy mill-wide aggregate cache. Non-authoritative; current seasonal stock is product_season_balances/product_stock_movements.';

-- Rebuild the projection from the canonical ledger without copying balances from
-- one season to another. A season with no movements intentionally has zero stock.
INSERT INTO public.product_season_balances (
  mill_id,
  season_id,
  product_id,
  current_stock,
  created_at,
  updated_at
)
SELECT
  movements.mill_id,
  movements.season_id,
  movements.product_id,
  sum(movements.quantity)::integer,
  now(),
  now()
FROM public.product_stock_movements AS movements
GROUP BY movements.mill_id, movements.season_id, movements.product_id;

-- The previous trigger checked the mill-wide legacy cache. Replace it with an
-- atomic season-scoped projection update. Any later failure in the source command
-- rolls the trigger update back in the same transaction.
DROP TRIGGER IF EXISTS trg_enforce_product_stock_movement
  ON public.product_stock_movements;

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
      NEW.quantity,
      now(),
      now()
    )
    ON CONFLICT (mill_id, season_id, product_id)
    DO UPDATE SET
      current_stock = public.product_season_balances.current_stock + EXCLUDED.current_stock,
      updated_at = now();
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INSUFFICIENT_PRODUCT_STOCK';
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_product_stock_movement() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_product_stock_movement
AFTER INSERT ON public.product_stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_stock_movement();
