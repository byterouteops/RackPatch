-- Phase 15 CE: spare stock ledger (never negative; transactions immutable)
CREATE TABLE "stock_item" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_item_quantity_nonnegative" CHECK ("quantityOnHand" >= 0)
);

CREATE UNIQUE INDEX "stock_item_projectId_sku_key" ON "stock_item"("projectId", "sku");
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_transaction" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_transaction_delta_nonzero" CHECK ("delta" <> 0),
    CONSTRAINT "stock_transaction_after_nonnegative" CHECK ("quantityAfter" >= 0)
);

CREATE INDEX "stock_transaction_itemId_createdAt_idx" ON "stock_transaction"("itemId", "createdAt");
ALTER TABLE "stock_transaction" ADD CONSTRAINT "stock_transaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ledger rows are append-only: reject UPDATE (cascade DELETE from item/project is still allowed).
CREATE OR REPLACE FUNCTION stock_transaction_reject_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_transaction rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_transaction_immutable
  BEFORE UPDATE ON "stock_transaction"
  FOR EACH ROW EXECUTE FUNCTION stock_transaction_reject_update();
