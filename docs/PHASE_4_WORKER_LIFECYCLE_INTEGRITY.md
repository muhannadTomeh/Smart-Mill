# Phase 4 — Worker Lifecycle Integrity

- Workers are archived with `active = false`; they are never deleted by the frontend.
- `work_records.worker_id` and `worker_payments.worker_id` now use `ON DELETE RESTRICT`.
- Archived workers remain in history but are excluded from new work and payment selection.
- Worker payments have `active` / `reversed` status. `reverse_worker_payment_command` is idempotent, requires a reason, preserves the payment row, restores cash through an opposite financial event, and decrements `total_paid`.
- Payments exceeding effective earned wages are rejected. Work-record cancellation is explicit and rejected if it would make paid wages exceed earned wages.
- Legacy cascade-deletion orphan worker-payment ledger rows were reconciled append-only with offsetting financial events; none remain unreconciled.
