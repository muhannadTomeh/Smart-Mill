# Smart Mill Canonical Transaction Matrix

`+` increases a balance, `-` decreases it, and `—` means no effect. Every row represents one atomic, idempotent business command. Monetary recognition and physical cash are distinct effects.

| Operation | Source Document | Financial Effect | Cash Effect | Receivable | Payable | Partner Due | Product Stock | Oil Stock | Cash Session | Cancellation Rule |
|---|---|---|---|---|---|---|---|---|---|---|
| Milling/service invoice — oil | Invoice + settlement | Service revenue/value recognition | — | — | — | — | Container lines `OUT` | `milling_settlement IN` | — | Reverse oil and product effects; block if dependent collection exists |
| Milling/service invoice — cash | Invoice + settlement | Revenue | `IN` | — | — | — | Container lines `OUT` | — | Current open session | Reverse revenue/cash and restore products; closed-session rule |
| Milling/service invoice — mixed | Invoice + settlements | Revenue | Cash part `IN` | Optional credit remainder `+` | — | — | Container lines `OUT` | Oil part `milling_settlement IN` | Cash part only | Reverse every settlement/effect; collections first |
| Cash invoice/product sale | Invoice + invoice lines | Revenue | `IN` | — | — | — | Sold lines `OUT` | Optional oil sale `OUT` | Current open session | Require cash available for refund; append stock/oil returns |
| Credit invoice | Invoice + invoice lines | Revenue, non-cash | — | `+` | — | — | Sold lines `OUT` | Optional oil sale `OUT` | — | Block while collections exist; cancel receivable and restore stock |
| Customer payment | Payment + allocations | Settlement event | `IN` when cash | `-` allocated amount | — | — | — | — | Required for cash | Reverse allocations and cash; restore receivable |
| Cash expense | Expense | Expense | `OUT` | — | — | — | — | — | Current open session | Append cash `IN`, reverse expense, mark cancelled |
| Credit expense | Expense | Expense, non-cash | — | — | Supplier payable `+` | — | — | — | — | If untouched, void payable and expense; otherwise reverse settlements first |
| Partner-paid expense | Expense | Expense, non-cash | — | — | — | Partner due `+` | — | — | — | If untouched, void due and expense; otherwise reverse reimbursements first |
| Supplier payable creation | Originating purchase/expense | Already recognized by parent | — | — | `+` | — | Parent-defined | Parent-defined | — | Cancel only through parent lifecycle |
| Partner due creation | Originating purchase/expense | Already recognized by parent | — | — | — | `+` | Parent-defined | Parent-defined | — | Cancel only through parent lifecycle |
| Payable settlement | Settlement + allocation | Liability settlement | `OUT` when cash | — | `-` | — | — | — | Required for cash | Append settlement reversal; cash opposite follows session rule |
| Partner reimbursement | Settlement + allocation | Liability settlement | `OUT` when cash | — | — | Partner due `-` | — | — | Required for cash | Reverse reimbursement before cancelling parent |
| Worker payment | Worker payment + allocations | Wage/debt settlement | `OUT` | — | Worker obligation `-` if modeled | — | — | — | Current open session | Restore allocation/debt and append cash `IN` |
| Product purchase — cash | Purchase | Purchase/asset value | `OUT` | — | — | — | `IN` | — | Current open session | Stock must still cover full reversal; append `OUT` and cash `IN` |
| Product purchase — credit | Purchase | Purchase/asset value, non-cash | — | — | Supplier payable `+` | — | `IN` | — | — | Reverse settlements first; stock must be available |
| Product purchase — partner | Purchase | Purchase/asset value, non-cash | — | — | — | Partner due `+` | `IN` | — | — | Reverse reimbursements first; stock must be available |
| Product sale — cash | Invoice line/sale | Revenue | `IN` | — | — | — | `OUT` | — | Current open session | Return stock and cash; require current drawer for closed-session refund |
| Product sale — credit | Invoice line/sale | Revenue, non-cash | — | `+` | — | — | `OUT` | — | — | Collections first, then restore stock/cancel receivable |
| Product return | Return document | Revenue reversal | `OUT` if refunded | Receivable `-` if credit | — | — | `IN` | — | Required if cash refund | Reversal of return allowed once if stock remains available |
| Oil purchase — cash | Oil purchase | Purchase/asset value | `OUT` | — | — | — | — | `oil_purchase IN` | Current open session | Require oil available; append oil `OUT` and cash `IN` |
| Oil purchase — credit | Oil purchase | Purchase/asset value, non-cash | — | — | Supplier payable `+` | — | — | `oil_purchase IN` | — | Settlements first; require oil available |
| Oil purchase — partner | Oil purchase | Purchase/asset value, non-cash | — | — | — | Partner due `+` | — | `oil_purchase IN` | — | Reimbursements first; require oil available |
| Oil sale — cash | Oil sale | Revenue | `IN` | — | — | — | — | `oil_sale OUT` | Current open session | Append oil `IN` and cash `OUT`; current drawer required if original closed |
| Oil sale — credit | Oil sale | Revenue, non-cash | — | `+` | — | — | — | `oil_sale OUT` | — | Collections first, then restore oil/cancel receivable |
| Milling settlement in oil | Invoice settlement | Service revenue/value allocation | — | — | — | — | — | `milling_settlement IN` | — | Opposite movement linked to invoice cancellation |
| Milling settlement in cash | Invoice settlement | Service revenue | `IN` | — | — | — | — | — | Current open session | Opposite cash event linked to invoice cancellation |
| Owner contribution | Owner transaction | Contribution, not revenue | `IN` | — | — | Optional owner account effect | — | — | Current open session | Append withdrawal/reversal once |
| Owner withdrawal | Owner transaction | Withdrawal, not expense | `OUT` | — | — | Optional owner account effect | — | — | Current open session | Append contribution/reversal once |
| Product stock adjustment | Adjustment document | — | — | — | — | — | Signed adjustment | — | — | Owner-only reason; append opposite if safe |
| Oil adjustment | Adjustment document | — | — | — | — | — | — | `adjustment IN/OUT` | — | Owner-only reason; append opposite if stock stays non-negative |
| Opening oil balance | Season opening | — | — | — | — | — | — | `opening_balance IN` | — | Correct with adjustment; never edit historical opening movement |
| Cash adjustment | Adjustment document | Financial adjustment | `IN/OUT` | — | — | — | — | — | Current open session | Owner-only reason; append opposite once |
| Transaction reversal | Reversal operation | Exact opposite linked by `reversal_of` | Method-dependent | Parent-dependent | Parent-dependent | Parent-dependent | Parent-dependent | Parent-dependent | Current/open-session rule | Never exposed as generic UI action for multi-effect operations |
| Settlement reversal | Reversal operation | Opposite settlement cash event | Opposite if cash | Restore receivable | Restore payable | Restore partner due | — | — | Current/open-session rule | One reversal per settlement; enables parent cancellation |
| Invoice cancellation | Cancellation operation | Reverse revenue/effects | Opposite cash effect | Cancel untouched balance | — | — | Restore product lines | Reverse oil effects | Current/open-session rule | Block until collections reversed |
| Expense cancellation | Cancellation operation | Reverse expense effect | Cash `IN` if originally cash | — | Void untouched payable | Void untouched partner due | — | — | Current/open-session rule | Block until settlements/reimbursements reversed |
| Purchase cancellation | Cancellation operation | Reverse purchase/funding | Opposite cash effect | — | Void untouched payable | Void untouched partner due | Product `OUT` if product purchase | Oil `OUT` if oil purchase | Current/open-session rule | Block for settlement dependencies or insufficient stock |
| Sale cancellation/return | Cancellation or return | Reverse revenue | Refund if cash | Reduce/cancel receivable | — | — | Product `IN` | Oil `IN` | Current/open-session rule | Collections must be reversed; partial return uses separate document |

## Required state and linkage

| Entity | Stored/derived states | Required links |
|---|---|---|
| Business operation | `active`, `cancelled` | source id, reverse operation id, actor and tenant |
| Expense | `active`, `cancelled` | operation id, originating obligation id when non-cash |
| Invoice | `active`, `cancelled` | operation id, normalized lines and settlements |
| Purchase/sale | `active`, `cancelled` | operation id, funding/receipt obligation if applicable |
| Obligation | `open`, `partial`, `settled`, `voided` | origin operation, party, movement ledger |
| Settlement/payment | `active`, `reversed` | operation id, exact obligation allocations, reversal operation |
| Financial event | effective/reversed derived | operation id, unique `reversal_of`, cash session when cash |
| Product movement | effective/reversed derived | operation id, product id, unique `reversal_of` |
| Oil movement | effective/reversed derived | operation id, source type, unique `reversal_of` |
| Cash session | `open`, `closed` | opener/closer, season/mill, immutable close snapshot |
| Season | `draft`, `active`, `closing`, `closed` | mill id, closing operation/report |

## Regression scenarios

| ID | Scenario | Required result |
|---|---|---|
| A | Cash expense 30, then cancel | Cash `-30`, then `+30`; net expense/cash effect zero |
| B | Credit expense 200, cancel before payment | Payable balance zero/voided; expense cancelled |
| C | Credit expense 200, settle 50, cancel | Cancellation blocked; reverse 50; payable restored to 200; then cancellation succeeds |
| D | Partner expense 100, reimburse 40, cancel | Block; reverse reimbursement; due restored; cancellation voids due |
| E | Credit invoice 500, collect 200, cancel | Block; reverse collection; receivable 500; cancellation makes zero |
| F | Purchase 10, cancel | Stock `+10`, then `-10`; net zero |
| G | Purchase 10, sell/use 4, cancel | Reject full cancellation because only 6 remain |
| H | Product sale 2, cancel | Stock `-2`, then `+2` |
| I | Milling settlement oil 6 | One `milling_settlement / IN / 6` movement |
| J | Oil purchase 20 | One `oil_purchase / IN / 20` movement |
| K | Oil sale 5 | One `oil_sale / OUT / 5` movement |
| L | Reverse oil purchase 20 | Linked opposite `OUT / 20`; net oil zero |
| M | Reverse prior closed-session cash expense | Closed session unchanged; reversal `IN` belongs to current session; financial net zero |
| N | Double-submit each command/reversal | Same stable result; exactly one set of effects |

All scenarios also assert tenant isolation, role permissions, source/effect linkage and report totals.
