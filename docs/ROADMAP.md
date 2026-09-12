# Smart Mill Implementation Roadmap

| Phase / ID | Work | Why / dependency | Risk | Size | Class |
|---|---|---|---|---|---|
| 0 / SEC-01 | Snapshot/audit production migrations, tables, RLS, grants, functions, Edge deploys and backups | required before changing behavior | unknown deployed drift | M | BLOCKER |
| 0 / TEN-01 | Backfill/validate `mill_id`; enforce membership helper; remove user/owner fallback writes | depends SEC-01 | cross-tenant exposure | L | BLOCKER |
| 0 / AUTH-01 | Replace hard-coded admin identity and recoverable password reveal; harden server account commands | depends SEC-01 | privilege/credential loss | M | BLOCKER |
| 1 / FIN-01 | Define immutable financial event/reversal contract and migrate reports/drawer to it | depends TEN-01 | financial migration | L | REQUIRED |
| 1 / FIN-02 | Add idempotency, locks, tests for invoice, collection, expense, payable, worker, partner and oil commands | depends FIN-01 | duplicate/partial events | L | REQUIRED |
| 1 / CASH-01 | Reconcile all cash events/session stamping; test close, variance and concurrent use | depends FIN-01 | wrong drawer close | M | REQUIRED |
| 2 / INV-01 | Create product sale/invoice line stock OUT and non-negative enforcement | depends FIN-02 | stock correction/backfill | L | REQUIRED |
| 2 / OIL-01 | Separate mill/customer oil movement/ownership and migrate totals | depends FIN-02 | historical classification | L | REQUIRED |
| 2 / INV-02 | Retire/manual-lock daily inventory in favor of derived movement views | depends INV-01 | reporting transition | M | OPTIONAL |
| 3 / OPS-01 | Add idempotency and remove redundant client-side queue cleanup around the existing atomic invoice completion command | depends FIN-02 | duplicate completion | M | REQUIRED |
| 3 / UX-01 | Simplify owner dashboard/workspace and statements using non-accounting Arabic language | depends FIN-01 | user adoption | M | REQUIRED |
| 4 / QA-01 | E2E role/mobile/RTL, RLS and concurrency suites; monitoring/audit dashboards | depends all core phases | regression | L | REQUIRED |
| 5 / TECH-01 | Remove legacy schema/compatibility code after production telemetry and migration cutoff | depends QA-01 | accidental compatibility break | M | TECHNICAL DEBT |
