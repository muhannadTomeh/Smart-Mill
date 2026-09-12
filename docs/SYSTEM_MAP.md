# Smart Mill System Map

```text
Supabase Auth user
  ├─ platform_admin → user_roles → Platform Admin UI (no tenant required)
  └─ mill member → mill_memberships (role, active, mill_id) → mills.id
       → active season → operational/Admin Workspace modules
       → command RPCs → operation records + financial/stock effects
```

## Module dependency map

| Module | Frontend | Database/RPC | Dependencies and side effects |
|---|---|---|---|
| Auth/tenant | Auth, contexts, credentialVault | Auth, profiles, roles, mills, memberships | resolves role/mill; subscription gating |
| Seasons | Seasons, SeasonSetup, context | `seasons`, `inventory` | determines operating period and defaults |
| Queue/milling | Queue, displays, QuickInvoice | `queue`, public queue RPCs | feeds invoice/customer flow |
| Invoices | Invoices, history | `create_invoice_and_settle`, invoices | atomically creates invoice, cash ledger event/inventory update and queue completion; needs idempotency and complete receivable semantics |
| Cash session | banner, guard, DailyClosing | cash session RPCs/triggers | stamps cash events, computes reconciliation |
| Expenses/payables | Expenses, Payables | expense/settlement/void RPCs | expense, cash out or payable, financial event |
| Partners | Partners | partner transaction RPC | contribution/withdrawal and financial event |
| Products/suppliers | Inventory, Payables | products/purchases/movements, purchase RPC | stock in, cash/payable, financial event |
| Oil | OilTrading, Inventory | oil transaction RPC/inventory | oil and cash effect; ownership inadequate |
| Workers | Workers | work records/payment RPCs | wage balance/cash out/financial event |
| Reporting | Dashboard, Reports, DailyClosing | mostly direct aggregate queries | currently not exclusively financial-ledger based |
| Platform | admin pages/functions | subscriptions, audit, account functions | account/mill lifecycle |

## Effect map

| Event | Cash | Receivable/payable | Inventory | Ledger/session |
|---|---|---|---|---|
| Cash service sale | + | — | oil/service as configured | financial IN + session |
| Credit sale | — | receivable + | — | revenue event, no session |
| Customer collection | + | receivable − | — | financial IN + session |
| Cash expense/purchase/wage | − | — | purchase stock + where applicable | financial OUT + session |
| Credit expense/purchase | — | supplier payable + | purchase stock + | financial non-cash |
| Partner-paid expense/purchase | — | due-to-partner + | purchase stock + | financial non-cash |
| Payable reimbursement | − | payable − | — | settlement, not expense |
| Partner contribution/withdrawal | +/- | partner capital/due model | — | owner event + session |

## Legacy/dependency findings

`mills.owner_user_id` and record `user_id` remain actor/compatibility values; `AuthContext`/`SeasonContext` still use them as fallbacks. `profiles.parent_mill_id` is legacy. `employee_owner_id` only appears in local-storage cleanup. `daily_inventory` and `container_types` overlap newer product/stock design. `schema.sql` is legacy bootstrap material and should not drive production changes.
