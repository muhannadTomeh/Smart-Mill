DROP POLICY IF EXISTS "Public can view queue by season" ON public.queue;
DROP POLICY IF EXISTS "Public can view season name" ON public.seasons;

REVOKE SELECT ON public.queue FROM anon;
REVOKE SELECT ON public.seasons FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_queue(p_season_id uuid)
RETURNS TABLE (id uuid, name text, "position" integer, status text, bags integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.name, q."position", q.status, q.bags
  FROM public.queue q
  WHERE q.season_id = p_season_id
    AND q.status IN ('waiting', 'processing')
  ORDER BY q."position" ASC
$$;

CREATE OR REPLACE FUNCTION public.get_public_season_display(p_season_id uuid)
RETURNS TABLE (
  name text,
  oil_buy_price numeric,
  oil_sell_price numeric,
  return_percent numeric,
  plastic_container_price numeric,
  metal_container_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.name, s.oil_buy_price, s.oil_sell_price, s.return_percent,
         s.plastic_container_price, s.metal_container_price
  FROM public.seasons s
  WHERE s.id = p_season_id
$$;

GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_season_display(uuid) TO anon, authenticated;