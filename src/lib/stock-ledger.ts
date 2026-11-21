import { prisma } from "@/lib/db";
import { applyTransaction, MAX_STOCK_QUANTITY } from "@/lib/stock";

/**
 * Atomically apply a ledger transaction. Uses a conditional UPDATE so concurrent removals
 * cannot drive stock negative (the DB CHECK constraint is a second guard).
 */
export async function postStockTransaction(input: {
  projectId: string;
  itemId: string;
  delta: number;
  reason: string;
  actorId: string;
}): Promise<{ quantityAfter: number; transactionId: string }> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.stockItem.findFirst({
      where: { id: input.itemId, projectId: input.projectId },
    });
    if (!item) throw new Error("Stock item not found");

    // Pure validation against the observed quantity (reason, bounds, whole numbers).
    const check = applyTransaction(item.quantityOnHand, input.delta, input.reason);
    if (!check.ok) throw new Error(check.error);

    const updated = await tx.stockItem.updateMany({
      where:
        input.delta < 0
          ? { id: item.id, quantityOnHand: { gte: -input.delta } }
          : { id: item.id, quantityOnHand: { lte: MAX_STOCK_QUANTITY - input.delta } },
      data: { quantityOnHand: { increment: input.delta } },
    });
    if (updated.count !== 1) {
      throw new Error("Stock changed concurrently or is insufficient; reload and retry");
    }

    const fresh = await tx.stockItem.findUniqueOrThrow({ where: { id: item.id } });
    const row = await tx.stockTransaction.create({
      data: {
        itemId: item.id,
        delta: input.delta,
        reason: check.reason,
        actorId: input.actorId,
        quantityAfter: fresh.quantityOnHand,
      },
    });
    return { quantityAfter: fresh.quantityOnHand, transactionId: row.id };
  });
}
