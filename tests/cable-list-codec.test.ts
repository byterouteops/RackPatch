import { describe, expect, it } from "vitest";
import { decodeCableList, encodeCableList, type CableListRow } from "@/lib/cable-list-codec";

const row = (n: number, over: Partial<CableListRow> = {}): CableListRow => ({
  id: `id${n}`,
  cableId: `SC-${n}`,
  aRack: "S01",
  aDevice: `SRV-${n}`,
  aPort: "eth0",
  zRack: "S01",
  zDevice: "LEAF-S01",
  zPort: `Ethernet1/${n}`,
  cableType: "DAC",
  fabric: null,
  speed: null,
  installStatus: "INSTALLED",
  verificationState: "AWAITING",
  retired: false,
  lengthMeters: null,
  ...over,
});

describe("cable list codec", () => {
  it("round-trips rows, including nulls, booleans and lengths", () => {
    const rows = [
      row(1),
      row(2, { fabric: "BE", speed: "400G", retired: true, lengthMeters: 2.5, installStatus: "BLOCKED", verificationState: "MISMATCH" }),
      row(3, { cableType: null, lengthMeters: 0 }),
    ];
    expect(decodeCableList(encodeCableList(rows))).toEqual(rows);
  });

  it("stores repeated strings once", () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(i));
    const enc = encodeCableList(rows);
    expect(enc.s.filter((v) => v === "LEAF-S01")).toHaveLength(1);
    expect(enc.s.filter((v) => v === "INSTALLED")).toHaveLength(1);
  });

  it("survives JSON serialisation", () => {
    const rows = [row(1, { lengthMeters: 3 }), row(2)];
    expect(decodeCableList(JSON.parse(JSON.stringify(encodeCableList(rows))))).toEqual(rows);
  });
});
