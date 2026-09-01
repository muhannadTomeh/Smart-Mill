
-- Create seasons table
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  return_percent numeric NOT NULL DEFAULT 6,
  oil_sell_price numeric NOT NULL DEFAULT 25,
  oil_buy_price numeric NOT NULL DEFAULT 23,
  cash_return_cost numeric NOT NULL DEFAULT 1.5,
  plastic_container_price numeric NOT NULL DEFAULT 10,
  metal_container_price numeric NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own seasons" ON public.seasons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add season_id to all data tables
ALTER TABLE public.queue ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.invoices ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.customers ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.workers ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.work_records ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.worker_payments ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.expenses ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.oil_transactions ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.container_types ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.inventory ADD COLUMN season_id uuid REFERENCES public.seasons(id);
