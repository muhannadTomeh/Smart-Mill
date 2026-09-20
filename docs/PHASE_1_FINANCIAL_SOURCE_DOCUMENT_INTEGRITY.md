# Phase 1 — Financial Source Document Integrity

Implemented on 2026-09-15.

Authenticated browser clients have read-only access to historical financial and inventory source documents. Tenant isolation remains enforced by `mill_id` through `check_user_mill_access`, which grants access to an active mill member or the role-backed Platform Admin without requiring Platform Admin membership.

The following tables no longer grant browser `INSERT`, `UPDATE`, or `DELETE` permissions: `invoices`, `invoice_product_lines`, `expenses`, `payables`, `worker_payments`, `product_purchases`, and `oil_transactions`.

Invoice creation remains `create_invoice_lifecycle_command`; cancellation remains `cancel_invoice_lifecycle_command`. Expense creation remains `record_expense_command`; cash expense cancellation remains `void_expense_and_reverse`. These SECURITY DEFINER lifecycle commands retain their required access while direct browser mutation is rejected.

`Customers.tsx` no longer edits invoice accounting or inventory fields, nor can it reassign an invoice's customer. Its correction action informs the user: `لتصحيح القيم المالية ألغِ الفاتورة وأنشئ فاتورة جديدة.`

The invoice cancellation operation uniqueness now includes `operation_type`, so the creation and cancellation of the same invoice can have separate audited `business_operations` records. Invoice and cash-expense cancellation append an opposite financial event and mark the source document voided; they do not delete historical events.

No new cancellation lifecycle was introduced for payables, worker payments, product purchases, or oil transactions in this phase. Direct browser mutation is blocked; their business-aware cancellation workflows remain scoped to their dedicated phases.
