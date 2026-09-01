-- Check if table exists, if not create it (it seems it might exist based on AdminIndex.tsx)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

-- Ensure correct GRANTs
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read system settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage system settings" ON public.system_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Initialize default values if they don't exist
INSERT INTO public.system_settings (key, value) VALUES 
('contact_email', 'muhannad.tomeh22@gmail.com'),
('contact_phone', '0569945677'),
('contact_whatsapp', '+972594596906')
ON CONFLICT (key) DO NOTHING;
