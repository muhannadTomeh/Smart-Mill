-- Add system_settings table to store global configurations
CREATE TABLE public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

-- Grant access to system_settings
GRANT SELECT ON public.system_settings TO authenticated;
GRANT SELECT ON public.system_settings TO anon;
GRANT ALL ON public.system_settings TO service_role;

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read system settings" ON public.system_settings
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage system settings" ON public.system_settings
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'platform_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Seed default contact setting
INSERT INTO public.system_settings (key, value)
VALUES ('contact_link', 'https://wa.me/970598326014?text=مرحباً، أريد الاشتراك بنظام Smart Mill')
ON CONFLICT (key) DO NOTHING;
