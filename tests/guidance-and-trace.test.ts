import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { guideFor, hintForField } from "@/lib/help/hints";
import { tracePath, type FabricLink } from "@/lib/fabric/load";

const APP_DIR = join(process.cwd(), "src", "app", "(app)", "app");

function pageRoutes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pageRoutes(full);
    if (name !== "page.tsx") return [];
    const rel = relative(APP_DIR, dir).split(sep).filter(Boolean);
    const segs = rel.map((s) => (s === "[projectId]" || s === "[workspaceId]" ? "cmabc123def456ghi789jkl0" : s.replace(/^\[(.+)\]$/, "x-$1")));
    return ["/app" + (segs.length ? "/" + segs.join("/") : "")];
  });
}

describe("page guidance", () => {
  const routes = pageRoutes(APP_DIR);
  it("finds the app routes", () => {
    expect(routes.length).toBeGreaterThan(40);
  });
  it.each(routes)("has a guide for %s", (route) => {
    expect(guideFor(route), route).not.toBeNull();
  });
});

describe("field hints", () => {
  it("never returns an empty hint", () => {
    for (const [keys, type] of [
      [["email"], "email"],
      [["cableId"], "text"],
      [[null, undefined], "text"],
      [["zz_unknown_field"], "select-one"],
      [[], "checkbox"],
    ] as const) {
      expect(hintForField([...keys], type).trim().length, JSON.stringify(keys)).toBeGreaterThan(0);
    }
  });
});

function link(cableId: string, a: string, z: string, fabric: string): FabricLink {
  return {
    id: cableId, cableId, fabric, rail: null, speed: null, media: null, lengthM: null,
    aRack: "R1", aDevice: a, aPort: "p1", zRack: "R2", zDevice: z, zPort: "p2",
    installStatus: "INSTALLED", state: "NONE", findingType: null,
  } as unknown as FabricLink;
}

describe("tracePath", () => {
  const links = [
    link("C1", "GPU-01", "LEAF-01", "BE"),
    link("C2", "LEAF-01", "SPINE-01", "BE"),
    link("C3", "GPU-01", "OOB-SW1", "OOB"),
    link("C4", "OOB-SW1", "SPINE-01", "OOB"),
  ];
  it("finds the shortest data path", () => {
    expect(tracePath(links, "gpu-01", "SPINE-01")?.map((l) => l.cableId)).toEqual(["C1", "C2"]);
  });
  it("never transits the OOB network on a data path", () => {
    const noUplink = links.filter((l) => l.cableId !== "C2");
    expect(tracePath(noUplink, "GPU-01", "SPINE-01")).toBeNull();
    expect(tracePath(noUplink, "GPU-01", "SPINE-01", "oob")?.map((l) => l.cableId)).toEqual(["C3", "C4"]);
  });
  it("allows a direct OOB hop", () => {
    expect(tracePath(links, "GPU-01", "OOB-SW1")?.map((l) => l.cableId)).toEqual(["C3"]);
  });
  it("returns an empty path for the same device", () => {
    expect(tracePath(links, "GPU-01", "gpu-01")).toEqual([]);
  });
});
