-- attach legacy season-less inventory rows to the user's active season
UPDATE public.inventory i
SET season_id = s.id
FROM public.seasons s
WHERE i.season_id IS NULL
  AND s.user_id = i.user_id
  AND s.status = 'active';

-- remove leftovers that still have no season and no data
DELETE FROM public.inventory
WHERE season_id IS NULL AND total_oil = 0 AND total_cash = 0;

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_user_season_uidx
  ON public.inventory (user_id, season_id);

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- inventory is created per season, nothing to do at signup
  RETURN NEW;
END;
$function$;