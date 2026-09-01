CREATE POLICY "Public can view queue by season"
  ON public.queue
  FOR SELECT
  TO anon
  USING (true);