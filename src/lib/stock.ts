/**
 * Pure spare-stock ledger rules (Phase 15 CE). Quantity never goes negative.
 * Persistence applies the same rule atomically in SQL (conditional update + CHECK constraint).
 */

export const MAX_STOCK_QUANTITY = 1_000_000_000;
export const MAX_REASON_LENGTH = 200;

export type ApplyTransactionResult =
  | { ok: true; quantityAfter: number; delta: number; reason: string }
  | { ok: false; error: string };

export function applyTransaction(
  quantityOnHand: number,
  delta: number,
  reason: string,
): ApplyTransactionResult {
  if (!Number.isInteger(quantityOnHand) || quantityOnHand < 0) {
    return { ok: false, error: "Invalid current quantity" };
  }
  if (!Number.isInteger(delta)) return { ok: false, error: "Quantity change must be a whole number" };
  if (delta === 0) return { ok: false, error: "Quantity change cannot be zero" };
  const cleanReason = reason.trim().replace(/\s+/g, " ");
  if (!cleanReason) return { ok: false, error: "Reason is required" };
  if (cleanReason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Reason must be at most ${MAX_REASON_LENGTH} characters` };
  }
  const next = quantityOnHand + delta;
  if (next < 0) {
    return {
      ok: false,
      error: `Insufficient stock: ${quantityOnHand} on hand, cannot remove ${Math.abs(delta)}`,
    };
  }
  if (next > MAX_STOCK_QUANTITY) return { ok: false, error: "Quantity exceeds maximum" };
  return { ok: true, quantityAfter: next, delta, reason: cleanReason };
}

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/\s+/g, "-");
}

/** Receiving stock (positive) is a management action; consuming/removing (negative) is a field action. */
export function requiredStockCapability(delta: number): "canManageProject" | "canUpdateInstall" {
  return delta > 0 ? "canManageProject" : "canUpdateInstall";
}

export type LedgerEntry = { delta: number; quantityAfter: number };

/**
 * Replay entries (oldest first) and confirm the running balance matches each recorded
 * quantityAfter, never dips below zero, and ends at `quantityOnHand`.
 */
export function verifyLedger(
  entries: LedgerEntry[],
  quantityOnHand: number,
): { ok: boolean; error?: string } {
  let running = 0;
  for (const [i, e] of entries.entries()) {
    running += e.delta;
    if (running < 0) return { ok: false, error: `Negative balance at entry ${i + 1}` };
    if (running !== e.quantityAfter) {
      return { ok: false, error: `Balance mismatch at entry ${i + 1}` };
    }
  }
  if (running !== quantityOnHand) return { ok: false, error: "Ledger total does not match on-hand" };
  return { ok: true };
}
