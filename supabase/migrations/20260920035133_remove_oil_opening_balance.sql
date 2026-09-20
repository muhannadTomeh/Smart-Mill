-- Oil inventory must be created by real oil movements (milling settlement,
-- purchase, sale reversal, or an explicit adjustment). There is no opening-oil
-- workflow in the product.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.oil_movements WHERE source_type = 'opening_balance'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LEGACY_OIL_OPENING_BALANCE_REQUIRES_RECONCILIATION';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_oil_opening_balance_command(uuid, numeric, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.record_oil_opening_balance_command(uuid, numeric, text, uuid);

ALTER TABLE public.oil_movements
  DROP CONSTRAINT oil_movements_source_type_check,
  ADD CONSTRAINT oil_movements_source_type_check
  CHECK (source_type IN ('milling_settlement', 'oil_purchase', 'oil_sale', 'adjustment'));

CREATE OR REPLACE VIEW public.mill_oil_balance AS
SELECT
  mill_id,
  season_id,
  coalesce(sum(CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END), 0) AS current_balance,
  coalesce(sum(quantity) FILTER (WHERE source_type = 'milling_settlement' AND movement_type = 'IN'), 0) AS milling_settlements,
  coalesce(sum(quantity) FILTER (WHERE source_type = 'oil_purchase' AND movement_type = 'IN'), 0) AS oil_purchased,
  coalesce(sum(quantity) FILTER (WHERE source_type = 'oil_sale' AND movement_type = 'OUT'), 0) AS oil_sold,
  coalesce(sum(CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END)
    FILTER (WHERE source_type = 'adjustment'), 0) AS opening_and_adjustments,
  coalesce(sum(CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END), 0) AS oil_balance
FROM public.oil_movements
GROUP BY mill_id, season_id;

ALTER VIEW public.mill_oil_balance
  RENAME COLUMN opening_and_adjustments TO adjustments;

GRANT SELECT ON public.mill_oil_balance TO authenticated;
