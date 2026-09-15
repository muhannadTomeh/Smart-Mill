-- Phase 7: keep master records that have historical references and make the
-- queue/customer link a real tenant-scoped relationship.
CREATE OR REPLACE FUNCTION public.validate_queue_customer_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = NEW.customer_id
      AND c.mill_id IS NOT DISTINCT FROM NEW.mill_id
      AND c.season_id IS NOT DISTINCT FROM NEW.season_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'QUEUE_CUSTOMER_TENANT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_customer_tenant_guard ON public.queue;
CREATE TRIGGER queue_customer_tenant_guard
  BEFORE INSERT OR UPDATE OF customer_id, mill_id, season_id ON public.queue
  FOR EACH ROW EXECUTE FUNCTION public.validate_queue_customer_tenant();

CREATE OR REPLACE FUNCTION public.archive_master_data_command(p_entity text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mill uuid;
  v_updated integer := 0;
BEGIN
  IF v_actor IS NULL OR p_entity NOT IN ('customer', 'supplier', 'partner', 'product') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MASTER_DATA_ARCHIVE_FORBIDDEN';
  END IF;

  CASE p_entity
    WHEN 'customer' THEN SELECT mill_id INTO v_mill FROM public.customers WHERE id = p_id FOR UPDATE;
    WHEN 'supplier' THEN SELECT mill_id INTO v_mill FROM public.suppliers WHERE id = p_id FOR UPDATE;
    WHEN 'partner' THEN SELECT mill_id INTO v_mill FROM public.partners WHERE id = p_id FOR UPDATE;
    WHEN 'product' THEN SELECT mill_id INTO v_mill FROM public.products WHERE id = p_id FOR UPDATE;
  END CASE;
  IF v_mill IS NULL OR (NOT public.is_platform_admin(v_actor) AND NOT public.has_active_mill_role(v_mill, ARRAY['mill_owner'])) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MASTER_DATA_ARCHIVE_FORBIDDEN';
  END IF;

  CASE p_entity
    WHEN 'customer' THEN UPDATE public.customers SET active = false, updated_at = now() WHERE id = p_id AND active;
    WHEN 'supplier' THEN UPDATE public.suppliers SET active = false, updated_at = now() WHERE id = p_id AND active;
    WHEN 'partner' THEN UPDATE public.partners SET active = false, updated_at = now() WHERE id = p_id AND active;
    WHEN 'product' THEN UPDATE public.products SET active = false, updated_at = now() WHERE id = p_id AND active;
  END CASE;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'archived', v_updated = 1);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_master_data_command(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_master_data_command(text, uuid) TO authenticated;
