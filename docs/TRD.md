# Smart Mill Technical Requirements Document

## 1. System overview and current architecture

React 18 + TypeScript + Vite + Tailwind/shadcn UI is deployed as a Vercel SPA. Supabase supplies Auth, PostgreSQL/RLS, Realtime and Edge Functions. TanStack Query is configured globally but most pages issue local effects/direct queries. The browser Supabase client carries a publishable key; no service-role key was found in client code.

The repository has two schema representations: `supabase/schema.sql` is an early user-owned schema and is **not** an authoritative representation of the latest migrations. The chronological `supabase/migrations/` directory adds mill tenancy, finance, cash sessions and credential work. Deployed migration state/RLS policies were not available, so production claims require a database audit.

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

Product truth should be `product_stock_movements`; `products.current_stock` is a cached value updated inside the same locked RPC. Add a non-negative constraint/locked calculation. Oil needs a separate movement ledger with `ownership = mill|customer`; do not use the generic product model for customer oil.

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
