# Smart Mill Product Requirements Document

## 1. Product overview

Smart Mill is an Arabic-first, mobile-friendly operating and financial system for a small olive mill. It combines the queue and milling-service invoice flow with cash drawer control, oil trading, customers, workers, expenses, supplier/product purchasing, liabilities and owner/partner activity. It is a focused operational system, not a general ERP.

## 2. Problem statement, goals and non-goals

Mill teams need to process customers quickly during a busy season without losing the connection between the service performed, oil/cash taken, stock moved and money owed. The product must make the correct path the easy path.

Goals: quick daily operation; correct, traceable financial effects; inventory that is derived from operations; strict mill isolation; responsive RTL UI. Non-goals: general ledger/journal accounting, multi-entity accounting, payroll/tax engine, procurement planning, or a separate owner POS identity.

## 3. Users and roles

| Role | Purpose | Access |
|---|---|---|
| `platform_admin` | SaaS operation/support | Mills, accounts, subscriptions and audit; may have no `mill_id` |
| `mill_owner` | Runs a single mill | Operational workspace; unlocks Admin Workspace with own admin PIN |
| `mill_employee` | Cashier/operator | Operational workspace only |

`CASH-001` **EXISTING**: a cash session is a drawer state, never a role. `AUTH-001` **PARTIAL**: owner and employee use Supabase accounts/memberships; client-side route guards support the intended split, but DB authorization must be the final authority.

## 4. Core journeys

1. Platform admin creates a mill and owner account, activates subscription, and can create/deactivate employee accounts.
2. Owner creates/activates a season, opening cash/oil balances and price settings, then opens a cash session.
3. Operator adds customer to queue, processes the milling charge, creates an invoice, accepts cash/credit/oil return, and completes queue work.
4. Owner records expenses, purchases, worker work/payments, supplier/partner obligations and settlements from the protected Admin Workspace.
5. Cashier closes the actual drawer balance; the system calculates expected balance and records the variance without closing merely because time, logout or browser changes.

## 5. Functional and module requirements

### Authentication, tenancy and administration

- `AUTH-002` **EXISTING**: Supabase Auth is the login identity; `mill_memberships.mill_id` is the intended tenant selector.
- `AUTH-003` **PARTIAL**: inactive memberships/profiles are signed out by the client. Every write must independently validate active membership server-side.
- `AUTH-004` **PARTIAL**: Admin Workspace is owner-only in UI and uses `verify_admin_pin`; it must use a short-lived server-verifiable privilege, not only React state.
- `ADMIN-001` **EXISTING**: platform-admin routes are separate and bypass normal subscription/mill gating.
- `ADMIN-002` **PARTIAL**: account lifecycle is non-destructive, but owner/cashier creation depends on deployed Edge Functions and has unsafe direct-update fallbacks.
- `CRED-001` **EXISTING / HARDEN**: Platform Admin may reveal the current account password or Admin PIN for support only. Values are masked by default and revealed only after an explicit action. Mill owners and employees may never reveal credentials.
- `CRED-002` **PROPOSED**: credential values are AES-256-GCM encrypted server-side; the encryption key exists only in Edge Function secrets. Plaintext must never be persisted in database/frontend storage or logs, and may be returned only by an authorized reveal response.
- `CRED-003` **PROPOSED**: every reveal is audited without the secret value, rate-limited, and automatically hidden in the UI after a short period. No client code may contain a service-role secret.

### Operations, invoices and customers

- `OPS-001` **EXISTING**: queue supports customer intake, position/status, public display and quick invoice flow.
- `INV-001` **PARTIAL**: invoices preserve service values such as cash amount and oil produced; invoice creation RPC atomically inserts the invoice, financial cash event, inventory totals and queue completion. Some UI paths still attempt queue cleanup afterwards, so retries/idempotency and behavior alignment remain required.
- `REC-001` **PARTIAL**: credit sale increases receivable once; a later customer-payment RPC increases cash and records a payment. Require explicit remaining-balance validation and idempotency.

### Cash and finance

- `CASH-002` **EXISTING**: a mill has at most one open session (partial unique index); session opening/closing is RPC based and can span dates.
- `CASH-003` **PARTIAL**: expected drawer cash is calculated from linked financial transactions. Legacy/direct records and transactions omitted from `financial_transactions` can make the result incomplete.
- `FIN-001` **PARTIAL**: `financial_transactions` is the intended financial event ledger (invoice, expense, oil trade, customer/worker/payment, purchase and owner events), but the dashboard/reports still aggregate operational tables directly.
- `EXP-001` **EXISTING**: expense RPC supports cash, credit, and partner-paid expense. Cash reduces cash; credit creates supplier payable; partner payment creates due-to-partner payable. An expense void is audited and reverses cash when safe.
- `PAY-001` **EXISTING**: payable settlement is a payment, not a second expense.
- `PART-001` **PARTIAL**: partner deposits/withdrawals are distinct financial events; model does not yet expose a complete partner balance/reconciliation statement.

### Inventory, oil, suppliers and workers

- `PROD-001` **PARTIAL**: products, suppliers, purchases and stock movement ledger exist; purchase RPC increases stock and records funding. Product sale is not yet connected to invoice creation, so product stock cannot yet be claimed as end-to-end correct.
- `PROD-002` **PARTIAL**: `products.current_stock` is mutable alongside stock movements; one authoritative balance/constraint is required to prevent drift and negatives.
- `OIL-001` **PARTIAL**: sellable mill oil uses source-classified movements. Milling settlement and oil purchase are separate `IN` sources; oil sale is `OUT`. The normal trade UI never asks the operator to choose oil ownership.
- `WORK-001` **PARTIAL**: workers, work records and cash wage payment exist. Workers can still be created/edited/deleted directly from the UI; historical worker/debt rules need protection.
- `INV-002` **PARTIAL**: `inventory` holds seasonal total oil/cash and `daily_inventory` remains a manual/legacy parallel store. Daily movement must become a derived view rather than a synchronization task.

## 6. Business rules

- `FIN-002` **PROPOSED**: each economic event has exactly one immutable financial event or a linked explicit reversal; voids never delete history.
- `FIN-003` **PROPOSED**: distinguish mill cash, drawer cash, revenue, expense, receivable, supplier payable, partner due, contribution and withdrawal in labels and reports.
- `INV-003` **PROPOSED**: all oil in sellable mill inventory is traced by source (`milling_settlement`, `oil_purchase`, `opening_balance`, or `adjustment`); a sale creates `oil_sale / OUT`. Customer oil that is not transferred to the mill is not an inventory movement.
- `INV-004` **PROPOSED**: no stock may fall below zero; invoice lines retain price, description and quantity at the time of sale.
- `CASH-004` **PROPOSED**: only cash events that physically affect the drawer receive `cash_session_id`; credit/partner-funded events must not.
- `CASH-005` **EXISTING**: opening a second session fails; closing records expected, actual and difference.

## 7. Permissions matrix

| Capability | Platform admin | Owner | Employee |
|---|---:|---:|---:|
| Platform/mill subscription management | Yes | No | No |
| Queue, invoices, oil operation | Support-only | Yes | Yes |
| Open/close cash drawer | Support-only | Yes | Yes, if policy permits |
| Expenses, products, supplier/partner/payable, workers | Support-only | Admin PIN | No |
| Customer/master settings/seasons/reports | Support-only | Admin PIN | No |
| Reveal current password/Admin PIN | Yes, explicit audited support action | No | No |

## 8. UX, reporting and validation

- `UX-001` **EXISTING**: app shell is RTL and has mobile sidebar patterns; all primary flows must be tested at 320–430px widths.
- `UX-002` **PROPOSED**: use Arabic operational terms and show a single next action: open drawer, process queue customer, or reconcile drawer.
- `REP-001` **PARTIAL**: reports and daily closing exist but use calendar-day queries. They must report drawer/session totals separately from date/season performance.
- `VAL-001` **PROPOSED**: validate membership, season status, party relationship, positive amounts, cash sufficiency, inventory availability, oil source classification and duplicate-submit key at the backend.

## 9. Acceptance criteria and scope

Before delivery: no cross-mill read/write; all material money/stock movements atomic and idempotent; session reconciliation uses the same authoritative ledger; no negative stock; owner admin PIN cannot elevate employee; product stock ownership and oil source classification are clear; deployment contains the migrations/functions tested against production-like data.

Out of scope: full double-entry accounting, bank reconciliation, tax filing, multi-mill owner switching, payroll taxation and advanced forecasting. Future considerations: receipts/printer reliability, offline queue capture with conflict handling, barcode input, accounting export, notifications and audit search.

## 10. Transaction Lifecycle & Reversal Model

`TXN-001`: every business mutation is a database command with one idempotency key and one immutable operation identity. The command validates role, active membership, season state and all dependent balances before writing any effect.

`TXN-002`: a source document and all of its effects are created atomically:

```text
Business operation
  -> source document
  -> financial event(s)
  -> obligation movement(s)
  -> product/oil movement(s)
  -> cash-session association when physical cash moves
```

`TXN-003`: no frontend flow may directly create or mutate financial events, obligations, inventory balances, oil balances, settlements, cancellations or season closure. Master data writes must also move to reviewed commands where historical references exist.

`TXN-004`: history is never physically deleted. A cancellation updates the source document to `cancelled` and appends opposite effects linked to the original effects. An original effect is considered reversed when a unique reversal row references it.

`TXN-005`: cancellation is dependency-aware. A parent document cannot be cancelled while a dependent settlement, collection, reimbursement, return or later stock consumption remains effective. The UI explains the required preceding action in Arabic.

`TXN-006`: cash reversals preserve drawer history. If the original event belongs to an open session, its opposite event uses that session. If the original session is closed, the opposite physical cash event requires the current open session and is posted there; the closed session is never recalculated.

`TXN-007`: canonical obligations cover customer receivables, supplier payables and partner dues. Obligation balances are derived from immutable increase, settlement, settlement-reversal and cancellation movements.

`TXN-008`: product and oil balances are derived/reconciled from immutable movement ledgers. Cached balances may exist for performance but are updated only by the same locked command and must reconcile to the ledger.

`TXN-009`: reports use effective operations/effects and exclude cancelled or fully reversed impact without deleting the audit trail. They do not independently sum overlapping source tables and financial events.

`TXN-010`: supported user actions use business language: `إلغاء المصروف`, `إلغاء المصروف والذمة`, `عكس دفعة السداد`, `إلغاء الفاتورة`, `إرجاع بيع`, and `أرشفة`. Raw database errors and generic delete icons are not user-facing behavior.

The complete event catalog, dependency rules, status transitions and implementation boundaries are defined in `TRANSACTION_LIFECYCLE.md` and `TRANSACTION_MATRIX.md`.
