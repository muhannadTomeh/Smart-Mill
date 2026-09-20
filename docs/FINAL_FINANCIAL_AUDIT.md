# Final financial audit — Phase 10

Date: 2026-09-16  
Verdict: **NOT READY**

## Architecture snapshot

| Balance | Canonical source |
|---|---|
| Mill cash | `financial_transactions` through `mill_cash_balance` / `financial_effective_events` |
| Mill oil | `oil_movements` through `mill_oil_balance` |
| Product stock | `product_stock_movements`; `products.current_stock` is the maintained current projection |
| Receivable | `receivable_movements` / invoice lifecycle |
| Payable | `payables` and payable settlement/reversal lifecycle |
| Worker earned/paid | effective `work_records` and `worker_payments` |

Financial and inventory documents are append-only. A source document is cancelled through its source-aware lifecycle command; neither ledger events nor historical stock movements are deleted or edited.

## Reconciliation result

The required equality is currently not provable:

`Git migrations != Supabase migration history`

The live project contains applied Phase 0–9 migration content under different migration versions than the corresponding repository filenames. For example, local `20260912123446_phase0_tenancy_and_credential_hardening.sql` is represented live as `20260912123700_phase0_tenancy_and_credential_hardening`; the same pattern continues through later phases. The local repository also contains older migration files that do not appear in the live history by their original version/name.

This is migration-history drift, not proof that every live definition is wrong. However it prevents a reliable fresh-build comparison and makes replaying or repairing history unsafe without a dedicated reconciliation plan. No old migration was re-run.

## Live checks completed

| Check | Result |
|---|---|
| Phase 9 legacy RPC grants revoked | Pass |
| Direct browser mutation grants on historical ledgers | Pass (zero mutation grants) |
| Cash ledger net vs `mill_cash_balance` (last Phase 8 check) | Pass: 2999.5 = 2999.5 |
| SECURITY DEFINER Advisor findings | Classified: canonical authenticated commands; three intentionally anonymous display/login endpoints |
| Fresh schema equivalence | Blocked by migration-history drift |
| Full new-season E2E | Not run — blocked to avoid a misleading production result |
| Permission matrix and idempotency matrix | Not run — must run against reconciled schema with dedicated test identities |

## Invariant audit status

No new financial data was created. The following required invariant checks remain to be executed after reconciliation: reversal pairing/direction/amount uniqueness, business-operation links, cash/non-cash direction, source-reference integrity, receivable/payable reconciliation, product/oil balances and cancellation pairs, and effective worker totals.

## Required next action

Create a dedicated schema reconciliation plan: capture live DDL/function/view/RLS fingerprints, map each live migration version to its repository source, and generate only additive reconciliation migrations for verified semantic drift. Then create isolated owner, employee, inactive-member and Mill B test identities and execute the full idempotent E2E season scenario.

## Pre-merge correction pass — 2026-09-16

Verdict remains **NOT READY** for merging to `main`. The focused corrections below are implemented and the additive migration `20260915225738_premerge_financial_consistency_fixes.sql` is applied live under the matching migration version.

### Corrections completed

- Period cash flow now reads all active cash events from `financial_transactions`, including reversal rows at their own timestamps. Current cash still comes from `mill_cash_balance`; the misleading repeated period opening-balance row was removed.
- `cancel_expense_lifecycle_command` is now the single UI cancellation path for cash, credit, and partner-funded expenses. It appends an exact financial reversal, cancels an untouched payable with an obligation cancellation movement, and rejects a payable having active settlements with `EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST`.
- Obsolete expense vault/drawer routing and active cash-box wording were removed. Historical nullable session columns and the unused legacy thermal Z-report helper remain compatibility/history only and do not drive current behavior.
- Duplicate container management was removed from Settings. Containers remain products managed from Inventory.
- Worker payment, payment reversal, and work-record cancellation commands are owner/platform-admin only. Employees may only record attendance through `register_worker_session`; the backend records `auth.uid()` rather than trusting the supplied user id.
- Customer, supplier, partner, and product archive actions are available. Archived master data is filtered out of new-operation selectors while historical references remain intact.

### Transactional live tests

The following tests ran against the live schema inside explicit transactions that ended with `ROLLBACK`, so production business rows were unchanged:

| Scenario | Result |
|---|---|
| Cash expense cancellation | Pass: cash increased by the exact expense amount; expense was voided; opposite `IN` event was created |
| Unsettled credit expense cancellation | Pass: cash unchanged; payable became cancelled/zero; `cancelled` obligation movement and `none` financial reversal were created |
| Settled partner expense cancellation | Pass: rejected with `EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST` |
| Platform Admin expense cancellation without mill membership | Pass |
| Employee attendance entry | Pass: allowed explicitly |
| Employee worker pay/reverse/work-record cancel | Pass: all rejected by backend owner-only checks |
| Owner worker pay then reverse | Pass: cash and `total_paid` changed by -1/+1 and returned exactly to starting values |

### Static command/effect review

| Operation | Canonical expected effects confirmed in command design |
|---|---|
| Cash/deferred milling invoice and collection | Source invoice; cash or receivable effect; oil/product movements only when applicable; queue lifecycle |
| Cash/credit/partner expense and cancellation | Cash `OUT` or payable opening; cancellation appends exact opposite and never deletes history |
| Payable settlement/reversal | Payable movement plus cash `OUT`/`IN`; no duplicate expense |
| Worker pay/reversal | `total_paid` and cash move in exact opposite directions |
| Oil cash/credit purchase, sale, cancellation | Oil ledger plus cash/payable effect; cancellation is source-aware |
| Product cash/credit/partner purchase and cancellation | Stock ledger plus cash/payable effect; insufficient-stock and settlement dependencies are enforced |
| Partner contribution/withdrawal/reversal | Cash-only owner movements; not classified as revenue/expense |
| Opening cash | Cash opening event; not revenue |

No frontend direct mutation of `financial_transactions`, `oil_movements`, `product_stock_movements`, `obligation_movements`, `receivable_movements`, or `business_operations` was found. No active source file requires a cash session. `useInventory.total_oil` is derived from `mill_oil_balance`; legacy `inventory.total_cash/total_oil` columns are not used as canonical balances.

### Live invariant query results

Zero failures were returned for reversal amount/direction/payment pairing, duplicate reversals, invalid cash/non-cash directions, missing operation links, payable bounds, product projection mismatch, negative product/oil balances, oil balance reconciliation, and `worker.total_paid > total_earned`.

Six historical worker-payment ledger sources remain physically orphaned from old cascade behavior, but all six have an existing reversal/reconciliation event. Effective cash is therefore reconciled; the original rows remain append-only audit history.

### Validation result

- `npx tsc --noEmit`: pass.
- `npm run build`: pass; Vite emitted only the existing large-chunk warning.
- `npm run lint`: fail on the repository baseline with 407 findings (348 errors, 59 warnings), dominated by pre-existing `no-explicit-any`, empty-block, and hook-dependency findings across unrelated modules. No claim is made that lint passes, and a repository-wide lint cleanup was intentionally outside this focused financial correction.

## Known issues

1. Migration history/version drift blocks the fresh database equivalence acceptance criterion.
2. Full financial E2E and permission/idempotency acceptance tests have not run because of item 1.
3. The pre-existing Supabase Advisor still reports intentionally exposed, internally authorized canonical `SECURITY DEFINER` commands and three documented anonymous display/login endpoints; the new commands are not executable by `anon`.

## 2026-09-20 — Oil opening balance removal

- The oil opening-balance workflow was removed from the product and database model.
- New oil inventory can enter only through canonical milling settlements, oil purchases, or an explicitly documented adjustment. Cash opening balance remains unchanged.
- `record_oil_opening_balance_command` was revoked and dropped, and `oil_movements.source_type` no longer accepts `opening_balance`.
- The canonical oil balance view now exposes `adjustments` instead of `opening_and_adjustments` and runs with invoker security so existing tenant RLS remains effective.
- The live database contained no oil opening-balance movements or operations before removal. Oil-ledger reconciliation remained exact after the migration.
