-- Bring the canonical ledger into agreement with the pre-ledger inventory cache.
-- One immutable reconciliation row is added only for seasons with a non-zero gap.
WITH ledger AS (
  SELECT mill_id, season_id,
    coalesce(sum(CASE WHEN movement_type='IN' THEN quantity ELSE -quantity END), 0) AS ledger_quantity
  FROM public.oil_movements
  GROUP BY mill_id, season_id
), gaps AS (
  SELECT i.mill_id, i.season_id, i.total_oil - coalesce(l.ledger_quantity, 0) AS quantity_gap
  FROM public.inventory i
  LEFT JOIN ledger l ON l.mill_id=i.mill_id AND l.season_id=i.season_id
)
INSERT INTO public.oil_movements (
  mill_id, season_id, ownership, direction, movement_type, source_type,
  quantity, amount, unit_price, notes, reference_type, created_by
)
SELECT mill_id, season_id, 'mill',
  CASE WHEN quantity_gap >= 0 THEN 'in' ELSE 'out' END,
  CASE WHEN quantity_gap >= 0 THEN 'IN' ELSE 'OUT' END,
  CASE WHEN quantity_gap >= 0 THEN 'opening_balance' ELSE 'adjustment' END,
  abs(quantity_gap), abs(quantity_gap), 0,
  'Phase 2 canonical ledger reconciliation', 'phase2_reconciliation',
  (SELECT mm.user_id FROM public.mill_memberships mm WHERE mm.mill_id=gaps.mill_id AND mm.is_active=true ORDER BY CASE mm.role WHEN 'mill_owner' THEN 0 ELSE 1 END LIMIT 1)
FROM gaps
WHERE quantity_gap <> 0;
