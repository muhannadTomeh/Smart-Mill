-- Remove the final runtime UUID and ownership fallbacks from RLS.

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Platform admins can view audit log"
ON public.admin_audit_log
FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "mill_owner_select_mills" ON public.mills;
CREATE POLICY "active members can select their mill"
ON public.mills
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.mill_memberships mm
    WHERE mm.mill_id = mills.id
      AND mm.user_id = auth.uid()
      AND mm.is_active = true
  )
);
