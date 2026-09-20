ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS queue_customer_id_idx ON public.queue(customer_id) WHERE customer_id IS NOT NULL;

-- Historical fallback only: recover an old embedded identifier where it is valid.
UPDATE public.queue q SET customer_id=c.id
FROM public.customers c
WHERE q.customer_id IS NULL
  AND q.notes ~ '\\[cust_id:[0-9a-fA-F-]{36}\\]'
  AND c.id=(substring(q.notes FROM '\\[cust_id:([^\\]]+)\\]'))::uuid;

REVOKE DELETE ON TABLE public.customers, public.suppliers, public.partners, public.products FROM PUBLIC, anon, authenticated;
