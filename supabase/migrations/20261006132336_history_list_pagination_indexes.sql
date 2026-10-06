-- Support tenant/season-scoped history screens ordered newest-first.
CREATE INDEX IF NOT EXISTS invoices_mill_season_created_id_idx
  ON public.invoices (mill_id, season_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS invoices_mill_season_payment_created_id_idx
  ON public.invoices (mill_id, season_id, payment_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS oil_transactions_mill_season_created_id_idx
  ON public.oil_transactions (mill_id, season_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS oil_transactions_mill_season_type_created_id_idx
  ON public.oil_transactions (mill_id, season_id, type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS product_purchases_mill_season_created_id_idx
  ON public.product_purchases (mill_id, season_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS product_purchases_mill_season_payment_created_id_idx
  ON public.product_purchases (mill_id, season_id, payment_method, created_at DESC, id DESC);
