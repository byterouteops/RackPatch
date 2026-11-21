# Phase 15 Implementation Report

**Updated:** 2026-11-21  
**Status:** PARTIAL - link asset fields + retire, plus a per-project spare stock ledger (no procurement / work orders)

## Delivered

| Capability | Status |
|------------|--------|
| Install / block lifecycle | Implemented (prior) |
| Asset serial / length on `LinkRuntime` | Implemented |
| Retire cable (timestamp + note) | Implemented |
| `StockItem` (sku, description, unit, quantityOnHand) | Implemented |
| Immutable `StockTransaction` ledger (delta, reason, actor, quantityAfter) | Implemented |
| Stock never negative (pure rule + conditional SQL update + DB CHECK) | Implemented |
| `/app/projects/[id]/spares` page + subnav link | Implemented |
| Procurement / purchase orders / work orders | Not built |

## Behavior

- Quantity changes only via `postStockTransaction`; there is no update/delete action for transactions, and a DB trigger rejects UPDATE on `stock_transaction` (cascade delete with the project still works).
- Receiving stock (positive delta) requires `canManageProject`; removing stock (negative delta) requires `canUpdateInstall`.
- Initial quantity on item creation is recorded as an "Initial stock" transaction.
- Stock is not linked to cables automatically; consumption is a manual ledger entry.

## Evidence

- Schema/migration: `prisma/migrations/20261121200000_spare_stock_ledger`
- Lib: `src/lib/stock.ts` (pure), `src/lib/stock-ledger.ts` (transactional persistence)
- Actions/UI: `src/app/actions/spares.ts`, `src/app/(app)/app/projects/[projectId]/spares/page.tsx`, `src/components/spare-adjust-form.tsx`
- Tests: `tests/stock.test.ts`
- Local DB check (manual, not in the suite): concurrent over-withdrawal allowed only one of two, UPDATE on a transaction and a negative quantity were both rejected by the database.
