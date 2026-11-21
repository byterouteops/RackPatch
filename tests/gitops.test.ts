import { describe, expect, it } from "vitest";
import { buildGitOpsDocument, gitOpsToCsv, parseGitOps, serializeGitOps } from "@/lib/gitops";
import { importPlanCsv } from "@/lib/csv/plan-import";

const links = [
  {
    cableId: "C-001",
    aRack: "R01",
    aDevice: "GPU-07",
    aPort: "NIC 2",
    zRack: "R01",
    zDevice: "Leaf-02",
    zPort: "Ethernet17",
    cableType: "DAC",
    notes: "Backend fabric: rail 2",
  },
  {
    cableId: "001",
    aRack: "R02",
    aDevice: "GPU-08",
    aPort: "NIC 2",
    zRack: "R01",
    zDevice: "Leaf-02",
    zPort: "Ethernet18",
    cableType: null,
    notes: null,
  },
];

const doc = buildGitOpsDocument({
  projectName: "Demo",
  site: "DC1",
  revisionNumber: 3,
  exportedAt: new Date("2026-11-21T00:00:00Z"),
  links,
});

describe("gitops serialize/parse", () => {
  it("round-trips through YAML (incl. numeric-looking ids and nulls)", () => {
    const text = serializeGitOps(doc, "yaml");
    expect(text).toContain("apiVersion: rackpatch/v1");
    const parsed = parseGitOps(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document?.cables).toEqual(doc.cables.map((c) => ({ ...c })));
    expect(parsed.import?.errors).toEqual([]);
    expect(parsed.import?.rows.map((r) => r.cableId)).toEqual(["C-001", "001"]);
  });

  it("round-trips through JSON", () => {
    const parsed = parseGitOps(serializeGitOps(doc, "json"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.import?.rows).toHaveLength(2);
  });

  it("is deterministic", () => {
    expect(serializeGitOps(doc, "yaml")).toBe(serializeGitOps(doc, "yaml"));
  });

  it("matches CSV plan import normalization", () => {
    const parsed = parseGitOps(serializeGitOps(doc, "yaml"));
    const csv = gitOpsToCsv(parsed.import!);
    const viaCsv = importPlanCsv(csv);
    expect(viaCsv.errors).toEqual([]);
    expect(viaCsv.rows.map((r) => r.endpointKey)).toEqual(parsed.import!.rows.map((r) => r.endpointKey));
    expect(parsed.import!.rows[0].cableType).toBe("DAC");
  });

  it("surfaces plan-import validation errors (duplicate ids, port conflicts)", () => {
    const text = `apiVersion: rackpatch/v1
kind: CablePlan
cables:
  - {cable_id: A, a_rack: R1, a_device: d1, a_port: e1, z_rack: R1, z_device: d2, z_port: e1}
  - {cable_id: A, a_rack: R1, a_device: d3, a_port: e1, z_rack: R1, z_device: d4, z_port: e1}
  - {cable_id: B, a_rack: R1, a_device: D1, a_port: E1, z_rack: R1, z_device: d5, z_port: e1}
`;
    const parsed = parseGitOps(text);
    expect(parsed.errors).toEqual([]);
    const msgs = parsed.import!.errors.map((e) => e.message).join("\n");
    expect(msgs).toMatch(/Duplicate cable_id/);
    expect(msgs).toMatch(/Port conflict/);
  });

  it("rejects wrong apiVersion/kind, missing fields, unknown fields and bad types", () => {
    expect(parseGitOps("apiVersion: v2\nkind: CablePlan\ncables: []").errors.length).toBeGreaterThan(0);
    expect(parseGitOps("apiVersion: rackpatch/v1\nkind: Other\ncables: []").errors.length).toBeGreaterThan(0);
    expect(
      parseGitOps("apiVersion: rackpatch/v1\nkind: CablePlan\ncables:\n  - {cable_id: A}").errors.length,
    ).toBeGreaterThan(0);
    expect(
      parseGitOps(
        "apiVersion: rackpatch/v1\nkind: CablePlan\ncables:\n  - {cable_id: A, a_rack: R, a_device: d, a_port: p, z_rack: R, z_device: e, z_port: q, extra: 1}",
      ).errors.length,
    ).toBeGreaterThan(0);
    // unquoted numeric id would be silently mangled -> must be rejected
    const numeric = parseGitOps(
      "apiVersion: rackpatch/v1\nkind: CablePlan\ncables:\n  - {cable_id: 001, a_rack: R, a_device: d, a_port: p, z_rack: R, z_device: e, z_port: q}",
    );
    expect(numeric.errors.length).toBeGreaterThan(0);
  });

  it("returns errors (does not throw) for garbage and oversized input", () => {
    expect(parseGitOps("a: [unclosed").errors[0]).toMatch(/Invalid YAML/);
    expect(parseGitOps("just a string").errors.length).toBeGreaterThan(0);
    expect(parseGitOps("x".repeat(5 * 1024 * 1024 + 1)).errors[0]).toMatch(/5 MB/);
  });

  it("limits YAML alias expansion", () => {
    const bomb = `a: &a [x, x, x, x, x, x, x, x, x, x]
b: [${Array.from({ length: 20 }, () => "*a").join(", ")}]
`;
    expect(parseGitOps(bomb).errors.length).toBeGreaterThan(0);
  });
});
