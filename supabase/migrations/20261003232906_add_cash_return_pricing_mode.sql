ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS cash_return_pricing_mode text NOT NULL
  DEFAULT 'fixed_per_produced_kg';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'seasons_cash_return_pricing_mode_check'
      AND conrelid = 'public.seasons'::regclass
  ) THEN
    ALTER TABLE public.seasons
      ADD CONSTRAINT seasons_cash_return_pricing_mode_check
      CHECK (
        cash_return_pricing_mode IN (
          'fixed_per_produced_kg',
          'oil_return_at_buy_price',
          'oil_return_at_sell_price'
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.seasons.cash_return_pricing_mode IS
  'Controls how the cash alternative for milling return is priced. Existing seasons retain fixed-per-produced-kg behavior by default.';

DROP FUNCTION IF EXISTS public.get_public_season_display(uuid);

CREATE FUNCTION public.get_public_season_display(p_season_id uuid)
RETURNS TABLE (
  name text,
  return_percent numeric,
  oil_sell_price numeric,
  oil_buy_price numeric,
  cash_return_cost numeric,
  cash_return_pricing_mode text,
  plastic_container_price numeric,
  metal_container_price numeric,
  display_settings jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.name,
         s.return_percent,
         s.oil_sell_price,
         s.oil_buy_price,
         s.cash_return_cost,
         s.cash_return_pricing_mode,
         s.plastic_container_price,
         s.metal_container_price,
         COALESCE(
           s.display_settings,
           '{
             "show_estimated_time": true,
             "show_oil_prices": true,
             "show_sell_price": true,
             "show_buy_price": true,
             "show_clock": true,
             "show_bags_count": true,
             "show_faqs": true,
             "ticker_text": "",
             "custom_faqs": []
           }'::jsonb
         )
  FROM public.seasons s
  WHERE s.id = p_season_id
$$;

REVOKE ALL ON FUNCTION public.get_public_season_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated, service_role;
