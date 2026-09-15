# Phase 2 — Canonical Inventory and Cash Read Models

Implemented on 2026-09-15.

`Inventory.tsx` no longer constructs cash or oil movements from invoices, expenses, worker payments, or oil transaction source documents.

- The cash balance is read through `useCashBalance` from `mill_cash_balance`.
- The cash history is read from `financial_effective_events`, including the original category, description, party, `IN`/`OUT`/no-cash direction, amount, and reversal status.
- The oil balance is read through `useInventory` from `mill_oil_balance`.
- The oil history is read directly from `oil_movements`, including its actual `source_type`, direction, quantity, party, notes, and reversal indication.
- Product balances continue to use the canonical `products.current_stock` cache, while the product movement table is read from `product_stock_movements`.

Cash and oil history are now separate UI sections. A credit or partner-funded transaction can be visible in cash history with `direction = none`, but never appears as a cash outflow. Only oil movements change mill oil balance; invoice production quantities are not used to derive it.

The live reconciliation on the implementation mill verified:

- net `financial_effective_events` = `mill_cash_balance` (`1899.50`);
- net `oil_movements` = `mill_oil_balance` (`200.0191304347826` kg);
- no product `current_stock` cache mismatch against `product_stock_movements`.
