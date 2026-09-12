# Smart Mill Technical Requirements Document

## 1. System overview and current architecture

React 18 + TypeScript + Vite + Tailwind/shadcn UI is deployed as a Vercel SPA. Supabase supplies Auth, PostgreSQL/RLS, Realtime and Edge Functions. TanStack Query is configured globally but most pages issue local effects/direct queries. The browser Supabase client carries a publishable key; no service-role key was found in client code.

The repository has two schema representations: `supabase/schema.sql` is an early user-owned schema and is **not** an authoritative representation of the latest migrations. The chronological `supabase/migrations/` directory adds mill tenancy, finance, cash sessions and credential work. The live Supabase project was inspected on 2026-09-12, including schema, grants, RLS policies, triggers and `SECURITY DEFINER` functions; chronological repository migrations remain the canonical source for version-controlled database behavior, with live drift called out explicitly in the transaction-lifecycle audit.

## 2. Current frontend

`App.tsx` wires `AuthProvider → RoleProvider → SubscriptionProvider → SeasonProvider → CashSessionProvider → AdminWorkspaceProvider`. Operational routes are queue, invoice, history, oil trading, daily closing and display. Admin-gated owner routes cover dashboard, expense, payable, partner, inventory, report, worker, customer, season and settings. Platform routes are `/admin` and `/admin/mill/:id`.

Auth resolves `auth.uid() → mill_memberships → mills.id`, with legacy fallback to `mills.owner_user_id`; `SeasonContext` similarly falls back from `mill_id` to `user_id`. `parent_mill_id`, `employee_owner_id`, and cached mill name remain compatibility residue. They must never be authorization inputs. A platform admin UUID is hard-coded in several paths: migrate this to server-side role data/configuration.

## 3. Current data model

| Area | Tables / source of truth intent |
|---|---|
| Identity/tenant | `profiles`, `user_roles`, `mills`, `mill_memberships`, `seasons` |
| Operation | `customers`, `queue`, `invoices`, `oil_transactions` |
| Finance | `financial_transactions`, `customer_payments`, `expenses`, `payables`, `worker_payments`, `cash_sessions` |
| Stock | `inventory`, `daily_inventory`, `products`, `product_purchases`, `product_stock_movements`, `container_types` |
| People | `workers`, `work_records`, `partners`, `suppliers` |
| Platform | `subscription_payments`, `system_settings`, `admin_audit_log`, `credential_vault` |

## 4. Target architecture

Canonical boundary: `mills.id`. All business rows must contain non-null `mill_id`, and normally `season_id`; `created_by`/legacy `user_id` is actor attribution only. Authorize every read/write through active `mill_memberships`, with a narrowly defined platform-admin exception. Do not infer tenancy from query parameters, local storage or owner id.

Use command RPCs for every financial/stock-changing operation; commands resolve tenant from the authenticated caller and referenced season/records, lock affected rows, validate all invariants, write operation + financial/stock event(s), and commit as one transaction. Return stable ids and use client-generated idempotency keys. Read models/reports may derive from immutable ledgers.

## 5. Financial and inventory architecture

`financial_transactions` should be append-only financial event ledger with `type`, `direction`, `payment_method`, party/reference data, `cash_session_id`, status and reversal linkage. Do not mutate cash as an independent business truth; `inventory.total_cash` is currently a mutable denormalized balance and requires reconciler/constraints until replaced by a derived/cached balance.

Product truth should be `product_stock_movements`; `products.current_stock` is a cached value updated inside the same locked RPC. Add a non-negative constraint/locked calculation. Oil uses `oil_movements` with `movement_type` and `source_type`; all recorded oil movements affect sellable mill inventory, while source classification explains where the balance came from. The trade UI must not expose an ownership selector.

Important target data flows:

```text
Create expense → auth + membership + season → validate funding → expense
 → financial event → cash session/cash balance OR payable → commit
Product purchase → validate supplier/product/funding → purchase + stock IN
 → financial event + payable/cash effect → commit
Credit sale → invoice + revenue + receivable (no cash) → commit
Collection → validate receivable → customer payment + cash IN + financial event → commit
```

## 6. Cash session architecture

Current migrations create `cash_sessions`, one open row per mill, active-session RPCs, a close RPC, timestamps and a closing record. Later triggers stamp/enforce sessions on invoices, expenses, oil, wage/customer/financial records and prevent modification after close. Sessions are date-independent.

Target expected balance = opening balance + active cash-in financial events − active cash-out financial events for the session. Avoid double counting source tables and financial events. Reconciliation is an immutable close event with actual count, variance/reason, closer and time. Decide owner/employee permissions in database policy, not sidebar visibility.

## 7. Security, RLS and credentials

RLS must be enabled on every exposed table. Policies must use active membership predicates for both `USING` and `WITH CHECK`; direct owner/user-based policies from the old schema are incompatible with employees sharing a mill. `SECURITY DEFINER` RPCs must set a safe search path, check `auth.uid()`, validate referenced rows belong to the resolved mill, revoke PUBLIC execution, and grant only intended roles.

`credential-vault` is an intentional support feature: it AES-256-GCM encrypts the current account password and Admin PIN server-side, with the encryption key available only as an Edge Function secret. Reveal is a Platform Admin-only action; it returns the plaintext only in the authorized response, after an explicit user action, and must be masked by default then automatically hidden after a short period. Never store plaintext in database rows, browser storage, logs, analytics, audit records, or rendered markup outside the temporary reveal view. Audit actor, target, credential type, time and request outcome—never the value. Apply rate limits and abuse protection before decrypting; verify platform-admin status server-side; do not trust client role state. The endpoint self-store behavior and Auth password synchronization require review. The client must never receive a service-role secret; remove identity-related direct-update fallbacks once server commands are reliable.

## 8. Edge functions, deployment, performance and testing

Functions: `admin-manage-user`, `admin-create-mill-account`, `credential-vault`, and `mcp`. Review deploy status: existing audit notes report `admin-manage-user` was previously undeployed. Vercel rewrites all routes to `index.html`; `supabase/config.toml` only records project id.

Add database integration tests for RLS matrix, cross-mill attempts, each command/reversal, concurrent stock/cash writes, session closing and idempotency. Add E2E mobile tests for owner/employee/admin paths. Add indexes for every tenant/season/status/time query (several exist for new tables); use paginated report queries and avoid loading all invoices in admin views.

## 9. Migration and production readiness

Use additive migration phases, backfill tenant ids, validate orphan/duplicate data, switch reads, then deny legacy writes. Keep compatibility fields only while measured reads require them. Before production: compare `supabase migration list` with database history, inspect advisors/policies/functions/grants, deploy Edge Functions, rotate any leaked/old secrets, build/test from clean install, and maintain backup/restore and monitoring runbooks.

## 10. Transaction Lifecycle & Reversal Model

### 10.1 Canonical operation envelope

Introduce `business_operations` as the stable identity for every business command. It records `id`, `mill_id`, `season_id`, `operation_type`, `source_type`, `source_id`, `status`, `created_by`, `created_at`, optional `cancelled_by/at/reason`, and optional `reverses_operation_id`. Source tables remain domain-specific and reference the operation id. Effect tables reference the same operation id, so completeness can be asserted without parsing descriptions or polymorphic text alone.

`business_command_receipts` replaces the finance-only meaning of `financial_command_receipts`. Its unique key is `(actor_user_id, idempotency_key)` and it records command type, processing/completed state and stable result. Every create, settle, cancel, reverse, return and adjustment command uses it.

### 10.2 Effect ledgers

- `financial_transactions`: immutable money/revenue/expense event; add `operation_id`, enforce a unique `reversal_of`, and derive effective status from reversal existence.
- `obligations`: one receivable, supplier payable or partner due with original party/source identity.
- `obligation_movements`: immutable `increase`, `settlement`, `settlement_reversal`, or `cancellation` movements with `operation_id` and reversal linkage. Balance is the signed sum.
- `product_stock_movements`: immutable signed quantity; add `operation_id`, `reversal_of`, idempotency and a unique reversal constraint.
- `oil_movements`: immutable signed quantity with `movement_type`, `source_type`, `operation_id` and `reversal_of`; legacy `ownership`, `direction` and `amount` become compatibility-only.
- `cash_sessions`: immutable after close. Physical cash is not a separate editable total; it is the sum of effective cash financial events tagged with the session.

Cached fields such as `inventory.total_cash`, `inventory.total_oil`, `products.current_stock`, and obligation remaining amounts may be retained temporarily, but only command RPCs may update them and reconciliation views/tests must compare them with their ledgers.

### 10.3 Statuses

Source documents use `active` and `cancelled`; documents with fulfillment may additionally expose `partial` and `settled` as derived states. Obligations expose `open`, `partial`, `settled`, and `voided`, derived from movements where possible. Effect rows are append-only; `effective`, `reversed`, and `reversal` are read-model states, not arbitrary client updates.

### 10.4 Command contract

Every command must:

1. require `auth.uid()` and a non-null idempotency key;
2. resolve `mill_id` from referenced records and active membership, never client storage;
3. validate role and active-season state;
4. lock the source, obligation, inventory and session rows in a stable order;
5. validate dependencies and available stock/cash;
6. insert the operation, source document and all effects in one transaction;
7. append audit metadata and return stable ids/result codes;
8. revoke `PUBLIC`/`anon`, grant only intended authenticated roles, and keep raw table writes unavailable.

Business validation failures return stable codes such as `DEPENDENT_SETTLEMENTS_EXIST`, `INSUFFICIENT_STOCK`, `CASH_SESSION_REQUIRED`, or `SEASON_CLOSED`. The frontend maps those codes to Arabic explanations; it does not display raw PostgreSQL messages.

### 10.5 Reversal and closed-session semantics

Cancellation commands never call a generic financial reversal as their complete implementation. They traverse the operation effects and append all required opposites. A unique reversal constraint makes retries safe.

For a physical cash reversal:

- original session still open: post the reversal to that session;
- original session closed: require the current open session for the same mill and post the reversal there;
- no current session: block with `CASH_SESSION_REQUIRED`;
- never update a closed session or restamp its historical totals.

The original and reversal remain linked across sessions. Financial reports net them; each Z report retains the physical drawer activity of its own session.

### 10.6 Canonical command API

Target public mutation API:

```text
create_expense_command / cancel_expense_command
create_invoice_command / cancel_invoice_command
record_customer_payment_command / reverse_customer_payment_command
settle_obligation_command / reverse_obligation_settlement_command
record_product_purchase_command / cancel_product_purchase_command
record_product_sale_command / cancel_product_sale_command
record_oil_purchase_command / record_oil_sale_command / reverse_oil_transaction_command
pay_worker_command / reverse_worker_payment_command
record_partner_transaction_command / reverse_partner_transaction_command
adjust_product_stock_command / adjust_oil_command / adjust_cash_command
open_cash_session_command / close_cash_session_command
close_season_command
```

Generic `void_financial_transaction` is internal-only because reversing one effect without its source lifecycle is unsafe.

### 10.7 Current implementation disposition

| Current component | Decision | Reason |
|---|---|---|
| `financial_transactions`, reversal link and immutability trigger | KEEP/HARDEN | Strong ledger foundation; add operation linkage and unique reversal semantics |
| `cash_sessions` and one-open-session constraint | KEEP/HARDEN | Correct drawer identity; change closed-session reversal placement and permissions |
| `financial_command_receipts` | REPLACE/GENERALIZE | Idempotency is useful but applies to all business commands, not finance only |
| `oil_movements` source model and balance view | KEEP/HARDEN | Correct source-based oil model; add operation/reversal linkage |
| `product_stock_movements` and non-negative guard | KEEP/HARDEN | Correct movement foundation; add reversal linkage and remove raw balance writes |
| Current create/settle command RPCs | REPLACE IN STEPS | Useful validation can be reused, but effects and dependencies are inconsistent |
| `void_expense_and_reverse` and public `void_financial_transaction` | REPLACE/DISABLE | They reverse a subset and cannot safely traverse obligations/stock |
| `_atomic`, old oil, and legacy invoice RPCs | DISABLE | Duplicate mutation paths remain deployed; retain only for migration/read compatibility |
| Direct frontend writes to inventory, seasons, queue cleanup and financial master/history rows | REPLACE | Bypass command invariants and idempotency |
| Operational source tables | LEGACY READ-ONLY, THEN ADAPT | Keep for UI/history during phased migration; new writes use canonical commands |
| Existing reports that sum source tables | REPLACE | Risk of double counting and ignoring reversals |

Full lifecycle rules and the migration sequence are in `TRANSACTION_LIFECYCLE.md`; the effect-by-operation contract is in `TRANSACTION_MATRIX.md`.
