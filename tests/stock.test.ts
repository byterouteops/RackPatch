import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  MAX_STOCK_QUANTITY,
  normalizeSku,
  requiredStockCapability,
  verifyLedger,
} from "@/lib/stock";

describe("applyTransaction", () => {
  it("adds and removes stock", () => {
    expect(applyTransaction(5, 3, "Received")).toEqual({
      ok: true,
      quantityAfter: 8,
      delta: 3,
      reason: "Received",
    });
    const r = applyTransaction(5, -5, "  used   on C-1 ");
    expect(r).toMatchObject({ ok: true, quantityAfter: 0, reason: "used on C-1" });
  });

  it("never allows negative stock", () => {
    const r = applyTransaction(2, -3, "Use");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Insufficient stock");
    expect(applyTransaction(0, -1, "Use").ok).toBe(false);
  });

  it("rejects zero, fractional, empty-reason and over-max changes", () => {
    expect(applyTransaction(1, 0, "x").ok).toBe(false);
    expect(applyTransaction(1, 1.5, "x").ok).toBe(false);
    expect(applyTransaction(1, 1, "   ").ok).toBe(false);
    expect(applyTransaction(1, 1, "x".repeat(201)).ok).toBe(false);
    expect(applyTransaction(MAX_STOCK_QUANTITY, 1, "x").ok).toBe(false);
    expect(applyTransaction(-1, 1, "x").ok).toBe(false);
  });
});

describe("helpers", () => {
  it("normalizes SKUs", () => {
    expect(normalizeSku("  dac 3m ")).toBe("DAC-3M");
  });

  it("receiving needs management, consuming needs install capability", () => {
    expect(requiredStockCapability(5)).toBe("canManageProject");
    expect(requiredStockCapability(-1)).toBe("canUpdateInstall");
  });
});

describe("verifyLedger", () => {
  it("accepts a consistent ledger", () => {
    expect(
      verifyLedger(
        [
          { delta: 10, quantityAfter: 10 },
          { delta: -4, quantityAfter: 6 },
        ],
        6,
      ),
    ).toEqual({ ok: true });
  });

  it("detects mismatches and negative dips", () => {
    expect(verifyLedger([{ delta: 10, quantityAfter: 9 }], 9).ok).toBe(false);
    expect(verifyLedger([{ delta: -1, quantityAfter: -1 }], -1).ok).toBe(false);
    expect(verifyLedger([{ delta: 2, quantityAfter: 2 }], 3).ok).toBe(false);
  });
});
