CREATE POLICY "Public can view season name"
  ON public.seasons
  FOR SELECT
  TO anon
  USING (true);