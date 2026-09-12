# Smart Mill Transaction Lifecycle & Reversal Model

## 1. Purpose and invariant

This document is the canonical lifecycle contract for business mutations. The invariant is:

> Every accepted business action creates its source document and every required financial, obligation, inventory and cash-session effect atomically. Every cancellation appends all required opposite effects, preserves history and refuses to proceed while effective dependent actions exist.

No UI button, report or compatibility RPC may reverse only one effect of a multi-effect operation.

## 2. Current architecture audit

### 2.1 Problems found

1. Mutation logic is split between command RPCs, older `_atomic` RPCs, triggers and direct frontend writes.
2. The deployed database still exposes multiple overlapping invoice, expense, oil and purchase functions. Some older mutation functions remain executable by `authenticated`.
3. `void_financial_transaction` can reverse a ledger event without understanding the source document, obligation or inventory effects. `void_expense_and_reverse` blocks payable-backed expenses but no complete payable cancellation workflow exists.
4. `payables` stores mutable paid/remaining totals, but there is no canonical payable-settlement source table or reversible obligation movement ledger.
5. Receivables are represented by `invoices.unpaid_amount`; customer payments are customer-level and not reliably linked to the invoice(s) they settle.
6. Invoices have no lifecycle status or normalized invoice lines. Container/product deduction depends on a special wrapper and summary fields.
7. Product purchases, oil trades, worker payments and customer payments have no consistent cancellation status or reversal link at the source level.
8. `product_stock_movements` and `oil_movements` lack complete reversal constraints. Cached balances can drift from movement ledgers.
9. Reports mix sums from source tables with financial events and do not uniformly exclude cancelled/reversed effects.
10. Direct frontend writes remain for seasons, inventory, customers, queue cleanup, workers, products, categories and container types. Several have historical consequences.
11. Quick invoice and full invoice do not use exactly the same command path.
12. Cash session UI reads source tables and includes time-based fallbacks, while the hardened close command uses the financial ledger. Display and settlement can disagree.
13. Season closure is a direct update and does not enforce closed cash, unresolved workflow checks or read-only behavior in database commands.
14. Raw PostgreSQL messages can reach toast notifications; the user is exposed to internal terminology.
15. Trash icons are used for records that should be cancelled, reversed or archived.

### 2.2 Current path disposition

| Current path | Decision | Target |
|---|---|---|
| `financial_transactions` append-only facts | KEEP/HARDEN | Add operation id and unique reversal; derive effective status |
| `cash_sessions` | KEEP/HARDEN | Ledger-only totals, explicit role policy, cross-session reversal rule |
| `oil_movements` source classification | KEEP/HARDEN | Add operation/reversal linkage; make legacy columns read-only |
| `product_stock_movements` | KEEP/HARDEN | Add operation/reversal linkage and authoritative reconciliation |
| `financial_command_receipts` | REPLACE/GENERALIZE | `business_command_receipts` for every command |
| `record_expense_command` | REPLACE | New lifecycle-aware create command |
| `void_expense_and_reverse` | REPLACE | `cancel_expense_command` traverses all effects |
| `create_invoice_command` variants | REPLACE | One invoice command with normalized lines and settlements |
| `settle_payable_command` | REPLACE | Obligation settlement command with reversible settlement operation |
| `record_product_purchase_atomic` | REPLACE | Idempotent command plus cancellation dependency checks |
| old oil trade/transaction commands | DISABLE | One source-aware command family |
| generic public `void_financial_transaction` | DISABLE/INTERNAL | Module cancellation commands only |
| direct writes to source/history/balance tables | DISABLE | Command RPCs only |
| old source tables and fields | LEGACY READ-ONLY | Retain during cutover, then remove after verification |

## 3. Canonical model

### 3.1 Business operation

`business_operations` is the envelope for one accepted command:

- `id`, `mill_id`, `season_id`
- `operation_type`
- `source_type`, `source_id`
- `status`: `active` or `cancelled`
- `created_by`, `created_at`
- `cancelled_by`, `cancelled_at`, `cancellation_reason`
- `reverses_operation_id` when the operation reverses another operation

Every effect row contains `operation_id`. Source rows also contain `operation_id`. This makes completeness queryable and prevents description-text linking.

### 3.2 Idempotent command receipt

Every command requires a client-generated UUID. `business_command_receipts` has a unique `(actor_user_id, idempotency_key)` constraint, command name, state and result. Repeating an already completed command returns the same result. A retry can never create a second document or reversal.

### 3.3 Financial effects

`financial_transactions` remains an immutable event ledger. A correction is another row with `reversal_of` pointing to the original. A unique partial index on `reversal_of` prevents two effective reversals of the same event. Source lifecycle commands, not the frontend, create reversals.

Financial events describe monetary value and payment method. Physical drawer effects require `payment_method=cash` and a verified `cash_session_id`. Credit and partner-funded recognition uses no cash direction/session.

### 3.4 Obligations

Use one `obligations` table for:

- `customer_receivable`
- `supplier_payable`
- `partner_due`

Each obligation links to its originating operation and party. `obligation_movements` stores signed lifecycle facts:

- `increase`
- `settlement`
- `settlement_reversal`
- `cancellation`

The balance is the signed sum. `open`, `partial`, `settled`, and `voided` are derived or transactionally cached states. Each settlement has its own operation and may be reversed once.

### 3.5 Inventory effects

Product stock uses signed `product_stock_movements`; oil uses signed `oil_movements`. Both receive `operation_id`, optional `reversal_of`, and a unique reversal constraint. A cancellation appends the opposite quantity. Historical movements are never edited or deleted.

`products.current_stock`, `inventory.total_oil`, and `inventory.total_cash` are transitional caches. Commands lock and update caches together with ledgers. Reconciliation views compare cache and ledger; any difference is an error, not an alternative balance.

### 3.6 Cash sessions

One physical drawer session may be open per mill. Expected balance is:

```text
opening balance + effective session cash IN - effective session cash OUT
```

Only financial cash events feed that calculation. Source tables are not added again.

Closed-session reversal policy:

- if the original session remains open, the opposite cash event uses it;
- if the original session is closed, a current open session for the same mill is required;
- the reversal is posted to the current session and links to the original event;
- no row or total in the closed session is changed;
- without a current open session, the command returns `CASH_SESSION_REQUIRED`.

This preserves both accounting net and physical drawer history.

## 4. Dependency graph

```text
Business operation
├── Source document
├── Financial event(s)
├── Obligation movement(s)
├── Product movement(s)
├── Oil movement(s)
└── Cash-session assignment for physical cash

Expense
└── Payable / partner due
    └── Settlement operation(s)
        └── Settlement reversal

Invoice
├── Receivable
│   └── Customer collection operation(s)
│       └── Collection reversal
├── Product stock OUT
└── Milling settlement oil IN

Product purchase
├── Product stock IN
└── Cash payment / supplier payable / partner due

Oil purchase
├── Oil stock IN
└── Cash payment / supplier payable / partner due

Product or oil sale
├── Stock OUT
└── Cash receipt / customer receivable
```

A parent operation may be cancelled only after all effective child settlement/collection/reimbursement operations have been reversed. Stock cancellation also requires that its opposite movement cannot make stock negative.

## 5. Business event catalog and reversal rules

### 5.1 Milling/service invoice

Meaning: completion of customer milling service. Source: invoice plus normalized service/product lines and settlement allocation.

- oil settlement: oil `IN / milling_settlement` for the quantity transferred to the mill;
- cash settlement: revenue/cash `IN`, current cash session;
- mixed settlement: both effects, once each;
- container line: product stock `OUT` independent of oil stock;
- credit remainder: customer receivable increase.

Cancellation reverses revenue/cash, cancels untouched receivable, returns product stock and appends opposite oil movements. If any collection exists, reverse collections first. If the original cash session is closed, the cash opposite posts to the current session.

### 5.2 Cash invoice

Meaning: invoice settled completely with physical cash. Creates invoice, revenue and cash `IN`; product/oil effects depend on lines. Cancellation appends cash `OUT`, reverses revenue and restores stock. It requires sufficient current cash and an open session when cash must leave the drawer.

### 5.3 Credit invoice

Meaning: recognized sale/service not yet collected. Creates invoice, revenue recognition and receivable increase; cash unchanged. Cancellation is allowed only when no effective collection exists, then cancels receivable, reverses revenue and restores stock.

### 5.4 Customer payment

Meaning: collection against one or more receivables. Creates a payment allocation, obligation settlement movement, financial cash `IN`, and session assignment. Reversal appends cash `OUT` and settlement reversal, restoring the receivable. It must identify exact allocations; customer-level description matching is forbidden.

### 5.5 Cash expense

Meaning: expense paid from mill drawer. Creates expense, financial expense/cash `OUT`, cash cache reduction and session assignment. Cancellation marks expense cancelled, appends financial/cash `IN`, and uses the closed-session rule.

### 5.6 Credit expense / supplier payable

Meaning: expense owed to a supplier/creditor. Creates expense, expense recognition and supplier payable increase; cash unchanged. If untouched, cancellation voids the obligation and expense and reverses recognition. If partially or fully settled, all settlements must be reversed first.

### 5.7 Partner-paid expense / partner due

Meaning: a partner funded an expense outside mill cash. Creates expense recognition and partner-due increase; mill cash/session unchanged. Reimbursement is an obligation settlement. Cancellation is blocked until reimbursements are reversed, then cancels the due and expense.

### 5.8 Payable/partner-due settlement

Meaning: payment that reduces an obligation; it is not a second expense. Cash settlement creates cash `OUT` in an open session. Non-cash settlement records its explicit method without drawer effect. Reversal restores the obligation and reverses cash in the appropriate session.

### 5.9 Worker payment

Meaning: cash payment against earned worker balance or an explicit wage expense. It must identify the worker obligation/work records it settles. Reversal restores the worker balance and appends cash `IN`. A standalone payment without traceable debt allocation is not canonical.

### 5.10 Product purchase

Meaning: acquisition of product units. Creates purchase and stock `IN`, plus exactly one funding effect: cash `OUT`, supplier payable, or partner due. Full cancellation appends stock `OUT` and reverses funding. Reject if available stock is below the purchased quantity or if dependent settlements exist. Partial return is a separate future operation, not a silent partial cancellation.

### 5.11 Product sale

Meaning: sale of a product/container through a normalized invoice line. Creates stock `OUT` and cash or receivable effect. Cancellation/return appends stock `IN` and reverses cash/receivable. A partial customer return is a separate return document.

### 5.12 Oil purchase

Meaning: oil transferred to sellable mill inventory. Creates `oil_purchase / IN` and cash `OUT`, supplier payable or partner due. Cancellation appends `oil_purchase / OUT` reversal and reverses funding. Reject if current oil stock is insufficient or dependent settlements exist.

### 5.13 Oil sale

Meaning: sale from sellable mill oil. Creates `oil_sale / OUT` and cash `IN` or receivable. Cancellation appends oil `IN` and reverses cash/receivable. No ownership selector is shown.

### 5.14 Owner contribution and withdrawal

Contribution creates financial cash `IN` and optionally reduces/records an owner equity/due account according to explicit business intent. Withdrawal creates cash `OUT`. Their reversals append opposite cash events; closed-session rules apply. These are never mislabeled as revenue or expense.

### 5.15 Adjustments

Product, oil and cash adjustments are explicit owner-only operations with a mandatory reason. Product/oil adjustment creates a signed movement and enforces no negative stock. Cash adjustment creates a financial adjustment in the open session. Reversal is another linked adjustment, once only.

## 6. Status transitions

```text
Source document: active -> cancelled
Obligation: open -> partial -> settled
                     \-> voided (only by parent cancellation with no effective settlement)
Settlement: active -> reversed
Financial/stock/oil effect: effective -> reversed (derived from linked reversal)
Cash session: open -> closed (terminal)
Season: draft -> active -> closing -> closed (closed is read-only)
```

No transition returns a closed cash session or closed season to an editable state. Corrections are new operations.

## 7. UI behavior

### 7.1 User-facing actions

- cash expense: `إلغاء المصروف`
- credit/partner expense: `إلغاء المصروف والذمة`
- settled obligation: `عكس دفعة السداد`
- invoice: `إلغاء الفاتورة`
- product/oil transaction: `إلغاء العملية`
- master data with history: `أرشفة`
- explicit correction: `تسوية مخزون` or `تسوية كاش`

The action dialog previews every effect: cash, debt, product and oil. It asks for a reason and shows whether an open drawer is required.

### 7.2 Eligibility messages

The backend returns stable codes and metadata. Examples:

- `DEPENDENT_SETTLEMENTS_EXIST`: `لا يمكن الإلغاء قبل عكس دفعات السداد.`
- `DEPENDENT_COLLECTIONS_EXIST`: `تم تحصيل مبلغ من هذه الفاتورة. اعكس التحصيل أولاً.`
- `INSUFFICIENT_STOCK`: `لا يمكن إلغاء الشراء لأن جزءاً من الكمية تم استخدامه أو بيعه.`
- `CASH_SESSION_REQUIRED`: `افتح الصندوق لإتمام الحركة النقدية العكسية.`
- `ALREADY_CANCELLED`: show the existing cancellation result, not an error.
- `SEASON_CLOSED`: `الموسم مغلق ومتاح للعرض فقط.`

No raw database exception is displayed directly.

### 7.3 Delete icon review

Financial documents, payments, stock/oil movements, invoices and reports never show a trash action. Suppliers, products, customers, partners and workers with history are archived/inactivated. Queue drafts with no dependent invoice may be deleted; a processed queue row is completed/cancelled, not deleted.

## 8. Reporting rules

Reports read canonical effective views:

- financial results: original events plus effective reversals, once;
- cash: effective cash events grouped by cash session;
- obligations: signed obligation movements;
- product/oil: signed movement ledgers;
- expenses/invoices: source documents filtered by lifecycle state, with cancellation shown separately;
- worker/partner statements: allocated obligation and settlement movements.

No report adds a source-table cash amount to the financial ledger amount for the same operation.

## 9. Required test matrix

Automated database integration tests cover the A-N scenarios in `TRANSACTION_MATRIX.md`, plus owner/employee/platform-admin/anonymous permissions, cross-mill access, closed seasons, insufficient cash/stock, concurrent commands and duplicate idempotency requests. Every test asserts the source state, all linked effects, derived balance and absence of orphan rows.

## 10. Migration and implementation sequence

Current non-admin business data is disposable, but the Platform Admin Auth user, profile, role and Credential Vault behavior are preserved. Work is split into separately tested commits:

### Step A — Financial lifecycle foundation

Add operation/command/audit foundations, effect linkage, reversal uniqueness, effective views and revoke unsafe raw/legacy mutation paths after replacements are ready.

### Step B — Expenses and obligations

Implement cash/credit/partner expense creation, obligation settlement and reversal, dependency-aware expense cancellation and Arabic UI actions.

### Step C — Invoices and receivables

Normalize invoice lines/settlements, implement receivables, allocations, payment reversal and full invoice cancellation.

### Step D — Product inventory, purchases and sales

Unify purchases/sales with stock movements, funding obligations and cancellation/return rules. Enforce non-negative balances and archive master data.

### Step E — Oil movements

Move all oil create/reverse paths onto the source-based ledger and validate reconciliation.

### Step F — Cash-session reversal semantics

Implement current-session posting for reversals of closed-session cash events; unify Z report and close calculation on financial events only.

### Step G — UI cleanup

Replace generic trash/reversal controls with eligibility-aware Arabic actions and effect previews; remove raw error messages and duplicate mutation paths.

### Step H — Reports

Switch reports to effective read models and add reconciliation/exception views.

### Step I — E2E regression

Run the full A-N matrix, permissions/cross-tenant tests, build/typecheck and production-like browser tests. Each step receives its own migration(s), test evidence and commit.

## 11. Risks and mitigations

- **Scope size:** isolate steps behind versioned commands and cut over one module at a time.
- **Duplicate effects during cutover:** one UI path per operation, command receipts, and temporary reconciliation assertions.
- **Closed drawer corrections:** require current open session; never rewrite closed session rows.
- **Stock consumed after purchase:** lock product/oil balances and reject unsafe full cancellation.
- **Untraceable legacy receivables/settlements:** disposable business data permits a clean reset; do not invent links from descriptions.
- **Platform Admin loss:** every reset/migration has pre/post preservation assertions and does not require mill membership.
- **Security-definer surface:** safe search path, internal helpers revoked from all API roles, public commands authenticate and authorize internally, advisors reviewed.
- **Report drift:** move reports only after effect reconciliation views show zero differences.

## 12. Reusable implementation

Reuse the tenant helpers and active membership model; Platform Admin role checks; cash-session table and one-open constraint; financial immutability/reversal columns; command receipt/idempotency pattern; product stock negative guard; oil source ledger; RLS tenant read policies; inventory realtime refresh; and existing Arabic operational screens as layout shells.

Reuse validation logic selectively from existing commands, but do not preserve their public signatures when those signatures cannot express normalized lines, allocations, dependencies or complete reversal results.
