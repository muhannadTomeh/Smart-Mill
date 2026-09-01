CREATE TABLE IF NOT EXISTS public.daily_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE NOT NULL,
    oil_amount numeric DEFAULT 0 NOT NULL,
    cash_amount numeric DEFAULT 0 NOT NULL,
    container_count integer DEFAULT 0 NOT NULL,
    inventory_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, season_id, inventory_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_inventory TO authenticated;
GRANT ALL ON public.daily_inventory TO service_role;

ALTER TABLE public.daily_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own daily inventory"
ON public.daily_inventory
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
