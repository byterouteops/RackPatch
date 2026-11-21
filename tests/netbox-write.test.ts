import { describe, expect, it } from "vitest";
import { parseNetBoxCableId } from "@/lib/netbox-write";
import { parseLabelConfig, serializeLabelConfig } from "@/lib/labels/template";

describe("netbox write helpers", () => {
  it("parses NB-# cable ids", () => {
    expect(parseNetBoxCableId("NB-42")).toBe(42);
    expect(parseNetBoxCableId("nb-7")).toBe(7);
    expect(parseNetBoxCableId("CABLE-1")).toBeNull();
  });
});

describe("label template config", () => {
  it("round-trips defaults", () => {
    const json = serializeLabelConfig(parseLabelConfig(undefined));
    const again = parseLabelConfig(json);
    expect(again.showQr).toBe(true);
    expect(again.columns).toBe(2);
  });
});
