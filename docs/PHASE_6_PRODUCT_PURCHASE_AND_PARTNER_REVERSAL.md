# Phase 6 — Product Purchase and Partner Transaction Reversal

- `cancel_product_purchase_command` creates opposite stock and financial events, keeps the purchase document, and cancels an unpaid linked payable.
- It rejects insufficient stock, a settled payable, duplicate cancellation, and non-owner callers.
- `reverse_partner_transaction_command` is owner-only, reason-required, idempotent, and creates an opposite cash event without classifying a contribution as revenue or a withdrawal as expense.
- Inventory shows purchase history with funding, status, amount, supplier/partner and cancellation action.
