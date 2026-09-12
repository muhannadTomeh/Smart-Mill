# Smart Mill Gap Analysis

| Requirement | Expected vs current behavior | Status | Impact | Recommendation | Priority |
|---|---|---|---|---|---|
| Canonical tenancy | `mills.id` + membership; client still has owner/user fallbacks and old schema policies | Partial | cross-tenant risk | complete backfill, remove fallbacks after telemetry | P0 Critical |
| Production DB truth | migration history/deployed RLS unknown; `schema.sql` stale | Missing | cannot certify behavior | audit live schema/functions/grants before release | P0 Critical |
| Financial source of truth | ledger intended; reports aggregate source tables and cash balance is mutable | Partial | inconsistent cash/profit | define ledger/read models and reconciliation | P0 Critical |
| Cash sessions | supports persistent sessions and close variance; triggering/coverage must be tested | Partial | drawer mismatch | test every cash event/reversal and close concurrency | P1 Must Fix Before Delivery |
| Atomic operations | new expense/purchase/oil/wage/payment RPCs are transactional; queue/invoice completion and master edits remain client sequences | Partial | partial state/duplicates | command RPC + idempotency for all material flows | P1 Must Fix Before Delivery |
| Product sales | product purchase ledger exists; invoice lines do not visibly decrement product stock | Missing | negative/drifting product stock | model invoice product lines and atomic sale command | P1 Must Fix Before Delivery |
| Oil ownership | oil total exists, but customer vs mill-owned oil is not explicit | Missing | selling customer property risk | distinct ownership/movement model | P1 Must Fix Before Delivery |
| Receivables | customer payment command exists, but complete balance/settlement model not evident | Partial | revenue/cash duplicate or wrong balances | explicit receivable allocation and statement | P1 Must Fix Before Delivery |
| Admin PIN | owner-only UI plus PIN RPC; React state alone is not server authorization | Partial | privilege bypass if endpoint unprotected | issue server-side scoped privilege/authorize sensitive RPCs by owner role | P1 Must Fix Before Delivery |
| Credential vault | Platform Admin must retain current password/Admin PIN reveal; encryption and audit exist but required reveal controls are not fully evidenced | Partial | high-impact credential exposure | retain reveal; enforce Edge-secret AES-256-GCM, Platform Admin-only server authorization, explicit/masked/time-limited UI, rate limits, audit without secret and no client service-role secret | P1 Must Fix Before Delivery |
| Account functions | Edge Function exists in repo, prior audit says undeployed; direct fallbacks exist | Partial | broken onboarding or escalation | deploy/test server command; remove fallbacks | P1 Must Fix Before Delivery |
| Daily inventory | manual `daily_inventory` parallel to operational balances | Partial | duplicate workflow | derive daily report from movements | P2 Important |
| RLS/functions | newer helper uses membership; old policies/function definitions remain history | Partial | authorization ambiguity | inspect live policies, PUBLIC grants, SECURITY DEFINER checks | P0 Critical |
| Workers | payment atomic; create/edit/delete direct and no durable wage liability statement | Partial | historical/integrity risk | archive workers, derive earned/paid balance | P2 Important |
| Mobile/RTL | RTL shell and responsive primitives exist; no visual/mobile test evidence | Partial | seasonal usability risk | test critical forms/receipt/display at phone widths | P2 Important |
| Observability | audit log exists for some admin actions only | Partial | hard incident recovery | audit business commands and add error monitoring | P3 Improvement |
