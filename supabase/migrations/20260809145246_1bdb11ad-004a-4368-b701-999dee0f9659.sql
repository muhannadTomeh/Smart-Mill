-- Revoke EXECUTE from public (anon) and authenticated roles for security definer functions
-- to prevent manual abuse via the API while keeping them available for RLS/Triggers.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

-- Also check other security definer functions that might have been flagged
REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_public_season_display(uuid) FROM public;
