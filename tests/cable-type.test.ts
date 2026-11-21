import { describe, expect, it } from "vitest";
import { cableTypeLabel, normalizeCableType } from "@/lib/cable-type";

describe("normalizeCableType", () => {
  it("maps common aliases", () => {
    expect(normalizeCableType("cat6")).toBe("Cat6");
    expect(normalizeCableType("DAC")).toBe("DAC");
    expect(normalizeCableType("400G DAC")).toBe("DAC");
    expect(normalizeCableType("single-mode")).toBe("SMF");
    expect(normalizeCableType("OM4")).toBe("MMF");
  });

  it("returns null for empty and Other for unknown", () => {
    expect(normalizeCableType(null)).toBeNull();
    expect(normalizeCableType("  ")).toBeNull();
    expect(normalizeCableType("mystery-cable")).toBe("Other");
  });

  it("labels empty as dash", () => {
    expect(cableTypeLabel(undefined)).toBe("—");
  });
});
