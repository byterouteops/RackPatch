import { describe, expect, it } from "vitest";
import {
  computeWorkOrderProgress,
  nextWorkOrderCode,
} from "@/lib/work-orders";

describe("work orders", () => {
  it("computes progress from install statuses", () => {
    const p = computeWorkOrderProgress([
      "INSTALLED",
      "INSTALLED",
      "BLOCKED",
      "PLANNED",
      null,
    ]);
    expect(p.total).toBe(5);
    expect(p.installed).toBe(2);
    expect(p.blocked).toBe(1);
    expect(p.planned).toBe(2);
    expect(p.pct).toBe(40);
  });

  it("allocates next WO code", () => {
    expect(nextWorkOrderCode([])).toBe("WO-1001");
    expect(nextWorkOrderCode(["WO-1005", "misc", "WO-12"])).toBe("WO-1006");
  });
});
