import { describe, expect, it } from "vitest";
import { buildTopology, planCsv, DEMO } from "@/lib/demo/ai-hpc/topology";
import { validateTopology, cablesByFabric } from "@/lib/demo/ai-hpc/validate";
import {
  SNAPSHOTS,
  SNAPSHOT_META,
  demoAliases,
  evidenceFiles,
  faultExpectations,
  type Snapshot,
} from "@/lib/demo/ai-hpc/evidence";
import { parseNeighborEvidence } from "@/lib/lldp/parse-neighbor-evidence";
import { parseInterfaceStatus } from "@/lib/lldp/interface-status";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";
import { computeOutcomes, type ComputeImport } from "@/lib/verify/compute";
import { importPlanCsv } from "@/lib/csv/plan-import";
import type { EvidenceFormat } from "@/lib/lldp/types";
import { readFileSync } from "node:fs";
import { fixtureFiles } from "../scripts/gen-ai-hpc-fixtures";

const t = buildTopology();

function runSnapshot(snapshot: Snapshot) {
  const imports: ComputeImport[] = [];
  for (const f of evidenceFiles(snapshot, t).filter((x) => x.importForVerification)) {
    const capture = new Date(f.captureTime);
    const base = { sourceDevice: f.device, sourceDeviceNorm: normalizeDevice(f.device), captureTime: capture, uploadedAt: capture, synthetic: true };
    if (f.kind === "INTERFACE_STATE") {
      const p = parseInterfaceStatus(f.text);
      imports.push({ ...base, kind: "INTERFACE_STATE", parseFailed: p.failed, observations: [], interfaceStates: p.states });
    } else {
      const p = parseNeighborEvidence(f.text, f.formatId as EvidenceFormat);
      imports.push({ ...base, kind: "NEIGHBOR", parseFailed: p.failed, observations: p.observations, interfaceStates: [] });
    }
  }
  const { deviceAliases, portAliases } = demoAliases(t);
  return computeOutcomes({
    links: t.cables.map((c) => ({
      cableId: c.cableId,
      aDevice: c.a.device,
      aPort: c.a.port,
      zDevice: c.z.device,
      zPort: c.z.port,
      aDeviceNorm: normalizeDevice(c.a.device),
      aPortNorm: normalizePort(c.a.port),
      zDeviceNorm: normalizeDevice(c.z.device),
      zPortNorm: normalizePort(c.z.port),
      speed: c.speed,
      media: c.media,
    })),
    aliases: deviceAliases.map((a) => ({ aliasNorm: normalizeDevice(a.alias), deviceNorm: normalizeDevice(a.deviceName) })),
    portAliases: portAliases.map((p) => ({ deviceNorm: normalizeDevice(p.deviceName), aliasNorm: normalizePort(p.alias), portNorm: normalizePort(p.portLabel) })),
    devices: t.devices.map((d) => ({ nameNorm: normalizeDevice(d.name), role: d.role, attributes: { discovery: d.discovery } })),
    imports: imports.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()),
    maxEvidenceAgeDays: 7,
    now: null,
  });
}

const results = Object.fromEntries(SNAPSHOTS.map((s) => [s, runSnapshot(s)])) as Record<Snapshot, ReturnType<typeof runSnapshot>>;
const typeOf = (s: Snapshot, cableId: string) => results[s].links.find((l) => l.cableId === cableId)!.outcome.findingType;

describe("AI/HPC demo topology", () => {
  it("has the specified inventory", () => {
    const count = (role: string) => t.devices.filter((d) => d.role === role).length;
    expect(t.racks).toHaveLength(14);
    expect(count("fe-spine")).toBe(2);
    expect(count("fe-leaf")).toBe(4);
    expect(count("border-leaf")).toBe(2);
    expect(count("be-spine")).toBe(2);
    expect(count("be-leaf")).toBe(4);
    expect(count("gpu")).toBe(6);
    expect(count("controller")).toBe(3);
    expect(count("cpu")).toBe(3);
    expect(count("storage")).toBe(3);
    expect(count("router")).toBe(2);
    expect(count("firewall")).toBe(2);
    expect(count("oob")).toBe(2);
    expect(count("console")).toBe(1);
  });

  it("passes structural validation (RU fit/overlap, ports, fabric separation)", () => {
    expect(validateTopology(t)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(planCsv()).toBe(planCsv());
    expect(evidenceFiles("FAULT_INJECTED").map((f) => f.text)).toEqual(evidenceFiles("FAULT_INJECTED").map((f) => f.text));
  });

  it("produces a plan CSV the real importer accepts with no errors", () => {
    const parsed = importPlanCsv(planCsv());
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(t.cables.length);
    expect(parsed.rows.find((r) => r.cableId === t.cables[0].cableId)?.fabric).toBe("FE");
    expect(Object.keys(cablesByFabric(t.cables)).sort()).toEqual(["BE", "EXT", "FE", "OOB", "PATCH", "STORAGE"]);
  });

  it("uses only fictional identities", () => {
    expect(DEMO.emailDomain.endsWith(".local")).toBe(true);
    const all = evidenceFiles("BASELINE").map((f) => f.text).join("\n");
    expect(all).toContain("SYNTHETIC DEMO");
    expect(all).not.toMatch(/\b(?!10\.|192\.0\.2\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});

describe("AI/HPC synthetic evidence through the real parsers + engine", () => {
  it("every imported file parses except the deliberate parser-error capture", () => {
    for (const s of SNAPSHOTS) {
      for (const f of evidenceFiles(s, t).filter((x) => x.formatId)) {
        const failed = f.kind === "INTERFACE_STATE" ? parseInterfaceStatus(f.text).failed : parseNeighborEvidence(f.text, f.formatId as EvidenceFormat).failed;
        const deliberate = s === "FAULT_INJECTED" && f.device === "OOB-SW2" && f.command === "show lldp neighbors detail";
        expect({ s, d: f.device, c: f.command, failed }).toEqual({ s, d: f.device, c: f.command, failed: deliberate });
      }
    }
  });

  it("BASELINE and CORRECTED have no mismatches or review items", () => {
    for (const s of ["BASELINE", "CORRECTED"] as const) {
      const bad = results[s].links.filter((l) => l.outcome.state === "MISMATCH" || l.outcome.state === "NEEDS_REVIEW");
      expect(bad.map((b) => `${b.cableId}:${b.outcome.findingType}`)).toEqual([]);
    }
  });

  it("never marks unobservable links verified", () => {
    for (const s of SNAPSHOTS) {
      for (const l of results[s].links) {
        if (l.observability.observability === "NEITHER_ENDPOINT_OBSERVABLE" || l.observability.observability === "NOT_APPLICABLE") {
          expect(l.outcome.state).not.toBe("VERIFIED_LLDP");
        }
      }
    }
  });

  for (const fx of faultExpectations(t)) {
    it(`scenario ${fx.id}: ${fx.title}`, () => {
      for (const [cableId, type] of Object.entries(fx.expected)) expect([cableId, typeOf("FAULT_INJECTED", cableId)]).toEqual([cableId, type]);
      for (const [cableId, type] of Object.entries(fx.corrected)) expect([cableId, typeOf("CORRECTED", cableId)]).toEqual([cableId, type]);
    });
  }

  it("FAULT_INJECTED only flags the injected faults (plus parser-error BMC links on OOB-SW2)", () => {
    const expected = new Set(faultExpectations(t).flatMap((f) => Object.entries(f.expected).filter(([, v]) => v !== "EXACT_MATCH" && v !== "UNOBSERVABLE").map(([k]) => k)));
    const flagged = results.FAULT_INJECTED.links.filter((l) => l.outcome.state === "MISMATCH" || l.outcome.state === "NEEDS_REVIEW" || l.outcome.findingType === "LINK_DOWN" || l.outcome.findingType === "MISSING_NEIGHBOR");
    const unexpected = flagged.filter((l) => !expected.has(l.cableId) && l.outcome.findingType !== "PARSER_ERROR");
    expect(unexpected.map((u) => `${u.cableId}:${u.outcome.findingType}:${u.match.observedSummary}`)).toEqual([]);
    const parser = flagged.filter((l) => l.outcome.findingType === "PARSER_ERROR");
    expect(parser.length).toBeGreaterThan(0);
    expect(parser.every((p) => p.match.expectedSummary.includes("OOB-SW2"))).toBe(true);
  });

  it("swap findings name the partner cable", () => {
    const fe = faultExpectations(t)[1];
    const [a, b] = fe.cableIds;
    expect(results.FAULT_INJECTED.links.find((l) => l.cableId === a)!.match.relatedCableId).toBe(b);
  });

  it("snapshot capture times are ordered", () => {
    expect(new Date(SNAPSHOT_META.BASELINE.capture) < new Date(SNAPSHOT_META.FAULT_INJECTED.capture)).toBe(true);
    expect(new Date(SNAPSHOT_META.FAULT_INJECTED.capture) < new Date(SNAPSHOT_META.CORRECTED.capture)).toBe(true);
  });
});

describe("plan fixtures (scenario 7)", () => {
  const files = fixtureFiles();
  it("committed fixtures match the generator", () => {
    for (const [name, text] of Object.entries(files)) expect(readFileSync(`fixtures/demos/ai-hpc/${name}`, "utf8").replace(/\r\n/g, "\n"), name).toBe(text);
  });
  it("valid plan imports cleanly", () => {
    expect(importPlanCsv(files["pod-a-plan.csv"]).errors).toEqual([]);
  });
  it("duplicate cable ID and port conflict are rejected with line numbers", () => {
    const dup = importPlanCsv(files["pod-a-duplicate-cable-id.csv"]).errors;
    expect(dup.some((e) => e.severity === "error" && e.lineNumber === 7 && /Duplicate cable_id/.test(e.message))).toBe(true);
    const conflict = importPlanCsv(files["pod-a-port-conflict.csv"]).errors;
    expect(conflict.some((e) => e.severity === "error" && e.lineNumber === 9 && /Port conflict/.test(e.message))).toBe(true);
  });
});
