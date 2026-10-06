CREATE OR REPLACE FUNCTION public.protect_mill_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF (
      NEW.subscription_type IS DISTINCT FROM OLD.subscription_type
      OR NEW.subscription_fee IS DISTINCT FROM OLD.subscription_fee
      OR NEW.monthly_fee IS DISTINCT FROM OLD.monthly_fee
      OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
      OR NEW.subscription_notes IS DISTINCT FROM OLD.subscription_notes
    )
    AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SUBSCRIPTION_FIELDS_PLATFORM_ADMIN_ONLY';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_mill_subscription_fields()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_mill_subscription_fields_trigger
ON public.mills;

CREATE TRIGGER protect_mill_subscription_fields_trigger
BEFORE UPDATE OF
  subscription_type,
  subscription_fee,
  monthly_fee,
  subscription_status,
  subscription_notes
ON public.mills
FOR EACH ROW
EXECUTE FUNCTION public.protect_mill_subscription_fields();

COMMENT ON FUNCTION public.protect_mill_subscription_fields() IS
  'Trigger-only guard that reserves platform subscription fields for Platform Admin.';
