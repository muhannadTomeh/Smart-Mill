ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;

-- Update existing profiles if needed (optional, just to keep consistent)
-- UPDATE public.profiles SET country = 'فلسطين' WHERE country IS NULL;
