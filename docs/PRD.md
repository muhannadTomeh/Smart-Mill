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
- `OIL-001` **PARTIAL**: oil transactions have an atomic RPC and `inventory.total_oil`; ownership class (mill-owned versus customer-owned) is not represented clearly enough.
- `WORK-001` **PARTIAL**: workers, work records and cash wage payment exist. Workers can still be created/edited/deleted directly from the UI; historical worker/debt rules need protection.
- `INV-002` **PARTIAL**: `inventory` holds seasonal total oil/cash and `daily_inventory` remains a manual/legacy parallel store. Daily movement must become a derived view rather than a synchronization task.

## 6. Business rules

- `FIN-002` **PROPOSED**: each economic event has exactly one immutable financial event or a linked explicit reversal; voids never delete history.
- `FIN-003` **PROPOSED**: distinguish mill cash, drawer cash, revenue, expense, receivable, supplier payable, partner due, contribution and withdrawal in labels and reports.
- `INV-003` **PROPOSED**: only mill-owned oil is saleable inventory; customer oil is custody/settlement information, not mill stock.
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
| Reveal credentials | Avoid; break-glass only | No | No |

## 8. UX, reporting and validation

- `UX-001` **EXISTING**: app shell is RTL and has mobile sidebar patterns; all primary flows must be tested at 320–430px widths.
- `UX-002` **PROPOSED**: use Arabic operational terms and show a single next action: open drawer, process queue customer, or reconcile drawer.
- `REP-001` **PARTIAL**: reports and daily closing exist but use calendar-day queries. They must report drawer/session totals separately from date/season performance.
- `VAL-001` **PROPOSED**: validate membership, season status, party ownership, positive amounts, cash sufficiency, inventory availability and duplicate-submit key at the backend.

## 9. Acceptance criteria and scope

Before delivery: no cross-mill read/write; all material money/stock movements atomic and idempotent; session reconciliation uses the same authoritative ledger; no negative stock; owner admin PIN cannot elevate employee; product/oil ownership is clear; deployment contains the migrations/functions tested against production-like data.

Out of scope: full double-entry accounting, bank reconciliation, tax filing, multi-mill owner switching, payroll taxation and advanced forecasting. Future considerations: receipts/printer reliability, offline queue capture with conflict handling, barcode input, accounting export, notifications and audit search.
