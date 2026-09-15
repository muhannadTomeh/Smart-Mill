-- Sync inventory.total_oil with canonical oil_movements and enable realtime updates

-- 1. Sync existing inventory total_oil from oil_movements
UPDATE public.inventory i
SET total_oil = COALESCE((
  SELECT COALESCE(SUM(CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END), 0)
  FROM public.oil_movements m
  WHERE m.mill_id = i.mill_id AND m.season_id = i.season_id
), 0),
updated_at = now();

-- 2. Ensure mill_oil_balance has both current_balance and oil_balance aliases
CREATE OR REPLACE VIEW public.mill_oil_balance
WITH (security_invoker = true) AS
SELECT mill_id, season_id,
  coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END),0) AS current_balance,
  coalesce(sum(quantity) FILTER (WHERE source_type='milling_settlement' AND movement_type='IN'),0) AS milling_settlements,
  coalesce(sum(quantity) FILTER (WHERE source_type='oil_purchase' AND movement_type='IN'),0) AS oil_purchased,
  coalesce(sum(quantity) FILTER (WHERE source_type='oil_sale' AND movement_type='OUT'),0) AS oil_sold,
  coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END) FILTER (WHERE source_type IN ('opening_balance','adjustment')),0) AS opening_and_adjustments,
  coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END),0) AS oil_balance
FROM public.oil_movements GROUP BY mill_id,season_id;

GRANT SELECT ON public.mill_oil_balance TO authenticated;

-- 3. Automatic Trigger to keep inventory.total_oil always synced with oil_movements
CREATE OR REPLACE FUNCTION public.sync_oil_inventory_from_movements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_mill uuid := COALESCE(NEW.mill_id, OLD.mill_id);
  target_season uuid := COALESCE(NEW.season_id, OLD.season_id);
  new_total numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END), 0)
  INTO new_total
  FROM public.oil_movements
  WHERE mill_id = target_mill AND season_id = target_season;

  UPDATE public.inventory
  SET total_oil = new_total,
      updated_at = now()
  WHERE mill_id = target_mill AND season_id = target_season;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_oil_inventory ON public.oil_movements;
CREATE TRIGGER trg_sync_oil_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.oil_movements
FOR EACH ROW
EXECUTE FUNCTION public.sync_oil_inventory_from_movements();

-- This is trigger-only infrastructure. It must not be callable through the API.
REVOKE ALL ON FUNCTION public.sync_oil_inventory_from_movements() FROM PUBLIC, anon, authenticated;

-- 4. Enable Realtime on the tables used by the dashboard and inventory.  Each
-- block is idempotent so this migration is safe on an already-configured live
-- project as well as a new project.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['oil_movements', 'inventory', 'queue', 'invoices', 'oil_transactions']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
