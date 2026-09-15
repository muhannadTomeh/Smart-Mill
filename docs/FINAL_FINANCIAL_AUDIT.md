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

## Known issues

1. Migration history/version drift blocks the fresh database equivalence acceptance criterion.
2. Full financial E2E and permission/idempotency acceptance tests have not run because of item 1.
