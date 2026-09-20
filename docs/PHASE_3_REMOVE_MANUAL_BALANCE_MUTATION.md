# Phase 3 — Remove Manual Cash/Oil Balance Mutation

## Canonical balances

- Cash is read from `public.mill_cash_balance`, derived from the financial ledger.
- Oil is read from `public.mill_oil_balance`, derived from `public.oil_movements`.
- `public.inventory.total_cash` and `public.inventory.total_oil` remain only as non-authoritative transitional cache columns. No current frontend, MCP tool, report, dashboard, or inventory read model treats them as the source of truth.

## Write protection

Authenticated browser clients retain `SELECT` access to `public.inventory` but have no `INSERT`, `UPDATE`, or `DELETE` grant. Its RLS policy is read-only. Canonical commands continue to write their own ledgers and do not depend on writing the cache.

## Opening balances

- `record_cash_opening_balance_command` records a one-time cash opening balance as an active financial transaction with `type = adjustment`, `category = opening_balance`, and `direction = in`. It is not revenue.
- There is no oil opening-balance workflow. Mill oil enters inventory only through milling settlement, oil purchase, or a documented adjustment.
- The cash-opening command is atomic, idempotent, owner-membership-only, and creates a `business_operations` record. Platform Admin does not bypass this owner-only rule.
- The UI exposes only the cash opening balance to a Mill Owner on the inventory page; there is no oil-opening action.

## MCP / Edge read path

The `get_inventory` MCP tool and deployed MCP Edge bundle return cash from `mill_cash_balance` and oil from `mill_oil_balance`; their legacy field names are retained only for response compatibility.

## Migrations

- `20260915200000_phase3_remove_manual_balance_mutation.sql`
- `20260915200100_phase3_owner_only_opening_authorization.sql`
