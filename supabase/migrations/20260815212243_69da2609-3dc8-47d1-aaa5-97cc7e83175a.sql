-- 1. Add monthly_fee to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC DEFAULT 0;

-- 2. Create subscription_payments table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mill_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    recorded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;

-- 4. Enable RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Only platform_admin)
CREATE POLICY "platform_admins_manage_payments" 
ON public.subscription_payments 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Note: No policy for mill_owner ensures they can't see the data.
