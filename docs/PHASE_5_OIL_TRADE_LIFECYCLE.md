# Phase 5 — Oil Trade Lifecycle

## Source document model

- `oil_transactions` is an immutable source document after creation. It now records `payment_method`, optional `payable_id`, and lifecycle status (`active` or `cancelled`).
- Purchase and sale create their oil movement and financial ledger event atomically through `record_oil_trade_command`.
- Cash purchase: `oil_purchase` IN + cash OUT.
- Credit purchase: `oil_purchase` IN + non-cash financial recognition + a supplier payable. The creditor name is required and is stored on that payable.
- Sale is cash-only in the MVP. Credit sales are rejected with `OIL_SALE_CREDIT_UNSUPPORTED` because they require a receivable lifecycle.

## Cancellation

- `cancel_oil_trade_command` is append-only and requires a reason.
- It marks the source document cancelled, creates the exact opposite oil movement and financial event, and never deletes the trade, oil movement, or financial ledger row.
- A credit purchase cannot be cancelled while its payable has an effective settlement (`DEPENDENT_SETTLEMENT_EXISTS`). The settlement must be reversed first.
- A purchase cancellation is rejected when its opposite OUT movement would make the canonical oil balance negative.

## UI

- Oil Trading shows payment method and active/cancelled status.
- Active rows offer **إلغاء العملية** only; there is no delete action.
- The UI maps lifecycle errors to Arabic messages and refreshes the cash and oil read models after a successful cancellation.

## Migrations

- `20260915200713_phase5_oil_trade_lifecycle.sql`
- `20260915201247_phase5_oil_trade_payment_method.sql`
- `20260915201435_phase5_backfill_oil_trade_payment_method.sql`
- `20260915202037_phase5_revoke_legacy_oil_trade_commands.sql`
