-- Allow platform admins to update all profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Platform admin can update all profiles'
    ) THEN
        CREATE POLICY "Platform admin can update all profiles" ON public.profiles
        FOR UPDATE
        USING (public.has_role(auth.uid(), 'platform_admin'))
        WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
    END IF;
END $$;
