# Smart Mill Gap Analysis

| Requirement | Expected vs current behavior | Status | Impact | Recommendation | Priority |
|---|---|---|---|---|---|
| Canonical tenancy | `mills.id` + membership; client still has owner/user fallbacks and old schema policies | Partial | cross-tenant risk | complete backfill, remove fallbacks after telemetry | P0 Critical |
| Production DB truth | live migrations, schema, RLS, grants and functions were audited on 2026-09-13; `schema.sql` remains stale | Monitored | future drift can invalidate guarantees | rerun live audit/advisors after every lifecycle step | P0 Critical |
| Financial source of truth | operation envelope and effective financial view are live; module source documents and reports still require staged cutover | Partial | inconsistent cash/profit until Steps B–H | migrate each module to linked effects, then switch reports | P0 Critical |
| Cash sessions | supports persistent sessions and close variance; triggering/coverage must be tested | Partial | drawer mismatch | test every cash event/reversal and close concurrency | P1 Must Fix Before Delivery |
| Atomic operations | new expense/purchase/oil/wage/payment RPCs are transactional; queue/invoice completion and master edits remain client sequences | Partial | partial state/duplicates | command RPC + idempotency for all material flows | P1 Must Fix Before Delivery |
| Product sales | product purchase ledger exists; invoice lines do not visibly decrement product stock | Missing | negative/drifting product stock | model invoice product lines and atomic sale command | P1 Must Fix Before Delivery |
| Oil movement sources | sellable mill oil is classified as milling settlement, purchase, sale, opening balance or adjustment; full cancellation linkage is pending | Partial | reversal/report drift until Step E | add operation/reversal links and source-based effective reports | P1 Must Fix Before Delivery |
| Receivables | customer payment command exists, but complete balance/settlement model not evident | Partial | revenue/cash duplicate or wrong balances | explicit receivable allocation and statement | P1 Must Fix Before Delivery |
| Admin PIN | owner-only UI plus PIN RPC; React state alone is not server authorization | Partial | privilege bypass if endpoint unprotected | issue server-side scoped privilege/authorize sensitive RPCs by owner role | P1 Must Fix Before Delivery |
| Credential vault | Platform Admin must retain current password/Admin PIN reveal; encryption and audit exist but required reveal controls are not fully evidenced | Partial | high-impact credential exposure | retain reveal; enforce Edge-secret AES-256-GCM, Platform Admin-only server authorization, explicit/masked/time-limited UI, rate limits, audit without secret and no client service-role secret | P1 Must Fix Before Delivery |
| Account functions | Edge Function exists in repo, prior audit says undeployed; direct fallbacks exist | Partial | broken onboarding or escalation | deploy/test server command; remove fallbacks | P1 Must Fix Before Delivery |
| Daily inventory | manual `daily_inventory` parallel to operational balances | Partial | duplicate workflow | derive daily report from movements | P2 Important |
| RLS/functions | live policies/functions were inspected; Platform Admin checks are role-backed with no fixed UUID; legacy callable mutation surfaces remain during staged replacement | Partial | old generic commands can bypass source lifecycle | revoke each legacy path immediately after its source-aware replacement is verified | P0 Critical |
| Workers | payment atomic; create/edit/delete direct and no durable wage liability statement | Partial | historical/integrity risk | archive workers, derive earned/paid balance | P2 Important |
| Mobile/RTL | RTL shell and responsive primitives exist; no visual/mobile test evidence | Partial | seasonal usability risk | test critical forms/receipt/display at phone widths | P2 Important |
| Observability | immutable operation audit foundation is live; business-module details and application error monitoring are pending | Partial | incomplete source-level incident reconstruction | emit module lifecycle events in Steps B–F and add monitoring | P3 Improvement |
## Step B closure (2026-09-13)

Expense creation, cancellation, payable settlement, and settlement reversal no longer use the old UI command paths. The generic `void_financial_transaction` remains transitional for modules outside Step B only; the Step B UI does not call it.

## Step C live foundation (2026-09-14)

Invoices now have immutable links to their cash and oil effects; source cancellation and invoice-specific collection reversal are tested. Creating a new invoice with an outstanding customer receivable still needs an explicit product/UI decision, so Step C remains in progress.
