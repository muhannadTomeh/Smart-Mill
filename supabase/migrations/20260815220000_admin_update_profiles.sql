-- Allow platform admins to update all profiles
CREATE POLICY "Platform admin can update all profiles" ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
