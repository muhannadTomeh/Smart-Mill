DROP POLICY IF EXISTS "platform_admin_select_subscription_payments"
ON public.subscription_payments;

CREATE POLICY "platform_admin_select_subscription_payments"
ON public.subscription_payments
FOR SELECT
TO authenticated
USING ((SELECT public.is_platform_admin((SELECT auth.uid()))));
