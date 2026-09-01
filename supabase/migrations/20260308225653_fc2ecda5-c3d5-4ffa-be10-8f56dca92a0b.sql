
CREATE TABLE public.container_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.container_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own container_types" ON public.container_types
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
