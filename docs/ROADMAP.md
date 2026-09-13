# Smart Mill Implementation Roadmap

| Phase / ID | Work | Why / dependency | Risk | Size | Class |
|---|---|---|---|---|---|
| 0 / SEC-01 | Snapshot/audit production migrations, tables, RLS, grants, functions, Edge deploys and backups | required before changing behavior | unknown deployed drift | M | BLOCKER |
| 0 / TEN-01 | Backfill/validate `mill_id`; enforce membership helper; remove user/owner fallback writes | depends SEC-01 | cross-tenant exposure | L | BLOCKER |
| 0 / AUTH-01 | Replace hard-coded admin identity; harden Platform Admin-only Credential Vault reveal and server account commands | depends SEC-01 | privilege/credential exposure | M | BLOCKER |
| 0 / CRED-01 | Verify AES-256-GCM Edge Function-only encryption, secret configuration, no plaintext persistence/logging, no client service-role secret, explicit/masked/time-limited reveal, audit-without-secret, and rate limiting | depends AUTH-01 | credential disclosure | M | BLOCKER |
| 1 / FIN-01 | Define immutable financial event/reversal contract and migrate reports/drawer to it | depends TEN-01 | financial migration | L | REQUIRED |
| 1 / FIN-02 | Add idempotency, locks, tests for invoice, collection, expense, payable, worker, partner and oil commands | depends FIN-01 | duplicate/partial events | L | REQUIRED |
| 1 / CASH-01 | Reconcile all cash events/session stamping; test close, variance and concurrent use | depends FIN-01 | wrong drawer close | M | REQUIRED |
| 2 / INV-01 | Create product sale/invoice line stock OUT and non-negative enforcement | depends FIN-02 | stock correction/backfill | L | REQUIRED |
| 2 / OIL-01 | Classify sellable mill-oil movements by source and migrate totals; never ask for ownership in normal trade UI | depends FIN-02 | historical classification | L | REQUIRED |
| 2 / INV-02 | Retire/manual-lock daily inventory in favor of derived movement views | depends INV-01 | reporting transition | M | OPTIONAL |
| 3 / OPS-01 | Add idempotency and remove redundant client-side queue cleanup around the existing atomic invoice completion command | depends FIN-02 | duplicate completion | M | REQUIRED |
| 3 / UX-01 | Simplify owner dashboard/workspace and statements using non-accounting Arabic language | depends FIN-01 | user adoption | M | REQUIRED |
| 4 / QA-01 | E2E role/mobile/RTL, RLS and concurrency suites; monitoring/audit dashboards | depends all core phases | regression | L | REQUIRED |
| 5 / TECH-01 | Remove legacy schema/compatibility code after production telemetry and migration cutoff | depends QA-01 | accidental compatibility break | M | TECHNICAL DEBT |

## Canonical transaction lifecycle program

This program supersedes incremental reversal patches. The earlier phase IDs remain a capability map; execution and review now follow the dependency-safe steps below.

| Step | Scope | Status | Exit condition |
|---|---|---|---|
| A | Operation envelope, command/audit foundation, financial effect linkage and effective read model | **COMPLETE — 2026-09-13** | all financial events linked; tenant RLS verified; role-only Platform Admin; build/typecheck pass |
| B | Expenses, supplier payables and partner dues | NEXT | create/settle/reverse/cancel flows pass dependency matrix |
| C | Invoices, receivables and collections | Not started | normalized lines/allocations and full cancellation pass |
| D | Product purchases, sales and returns | Not started | signed stock ledger and non-negative cancellation rules pass |
| E | Oil purchases, sales and milling settlement | Not started | all sources use one movement/reversal model |
| F | Closed/open cash-session reversal semantics | Not started | closed sessions remain immutable and reversals post to current drawer |
| G | Lifecycle-aware Arabic UI cleanup | Not started | no generic delete/reversal or raw database errors |
| H | Effective reports and reconciliation views | Not started | no source/ledger double counting and zero reconciliation drift |
| I | Full E2E A–N, permissions and concurrency regression | Not started | production-like evidence for every matrix scenario |
