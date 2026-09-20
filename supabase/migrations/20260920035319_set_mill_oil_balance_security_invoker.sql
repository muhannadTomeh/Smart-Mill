-- Preserve tenant RLS when the canonical balance view is queried through the API.
ALTER VIEW public.mill_oil_balance SET (security_invoker = true);
