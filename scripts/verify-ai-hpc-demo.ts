/**
 * Verify the seeded AI/HPC demo against the database (read-mostly; playback is restored).
 *
 * Usage: npm run demo:verify:ai-hpc [-- --json docs/demo/.verify.json]
 *
 * Checks isolation (synthetic evidence only in the demo project; other workspaces unchanged
 * by a reseed), deterministic playback outcomes for all 12 CDP/LLDP fault scenarios, and
 * record-derived counts.
 */
import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { DEMO, buildTopology } from "../src/lib/demo/ai-hpc/topology";
import { SNAPSHOTS, faultExpectations, type Snapshot } from "../src/lib/demo/ai-hpc/evidence";
import { applyDemoSnapshot } from "../src/lib/demo/playback";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` \u2014 ${detail}` : ""}`);
};

async function otherCounts(demoWorkspaceId: string) {
  const where = { workspaceId: { not: demoWorkspaceId } };
  const [projects, links, imports, findings, users] = await Promise.all([
    prisma.project.count({ where }),
    prisma.plannedLink.count({ where: { revision: { project: where } } }),
    prisma.evidenceImport.count({ where: { project: where } }),
    prisma.verificationFinding.count({ where: { revision: { project: where } } }),
    prisma.user.count({ where: { NOT: { email: { endsWith: `@${DEMO.emailDomain}` } } } }),
  ]);
  return { projects, links, imports, findings, users };
}

async function findingTypes(revisionId: string) {
  const rows = await prisma.verificationFinding.findMany({ where: { revisionId }, select: { findingType: true, state: true, plannedLink: { select: { cableId: true } } } });
  return new Map(rows.map((r) => [r.plannedLink.cableId, r]));
}

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { slug: DEMO.workspaceSlug } });
  if (!ws) throw new Error("Demo workspace not seeded. Run DEMO_SEED=ai-hpc npm run demo:seed:ai-hpc first.");
  check("demo workspace is flagged isDemo", ws.isDemo);
  const project = await prisma.project.findFirstOrThrow({ where: { workspaceId: ws.id, name: DEMO.projectName } });
  check("demo project is flagged isDemo", project.isDemo);
  const original = project.demoEvidenceSnapshot as Snapshot | null;
  const t = buildTopology();

  const [links, devices, racks, realInDemo, syntheticElsewhere] = await Promise.all([
    prisma.plannedLink.count({ where: { revisionId: project.activeRevisionId! } }),
    prisma.deviceInventory.count({ where: { projectId: project.id } }),
    prisma.rack.count({ where: { projectId: project.id } }),
    prisma.evidenceImport.count({ where: { projectId: project.id, synthetic: false } }),
    prisma.evidenceImport.count({ where: { synthetic: true, project: { isDemo: false } } }),
  ]);
  check("cable count matches topology", links === t.cables.length, `${links}/${t.cables.length}`);
  check("device count matches topology", devices === t.devices.length, `${devices}/${t.devices.length}`);
  check("rack count is 14", racks === 14, String(racks));
  check("demo evidence is all synthetic", realInDemo === 0, `${realInDemo} non-synthetic imports`);
  check("no synthetic evidence in non-demo projects", syntheticElsewhere === 0, `${syntheticElsewhere} found`);

  const fx = faultExpectations(t);
  const results: Record<string, Record<string, string>> = {};
  for (const snapshot of SNAPSHOTS) {
    await applyDemoSnapshot(project.id, snapshot, null);
    const types = await findingTypes(project.activeRevisionId!);
    results[snapshot] = Object.fromEntries([...types].map(([k, v]) => [k, v.findingType]));
    const bad = [...types.values()].filter((v) => v.state === "MISMATCH" || v.state === "NEEDS_REVIEW").map((v) => `${v.plannedLink.cableId}:${v.findingType}`);
    if (snapshot !== "FAULT_INJECTED") {
      const nonPhysical = bad.filter((b) => !b.endsWith("PHYSICAL_MISMATCH"));
      check(`${snapshot}: no LLDP mismatches/review items`, nonPhysical.length === 0, nonPhysical.join(", ") || `${bad.length} QC rejection(s) only`);
    }
  }
  for (const f of fx) {
    const want = (snap: Snapshot, exp: Record<string, string>) => Object.entries(exp).filter(([cableId, type]) => results[snap][cableId] !== type);
    const wrongFault = want("FAULT_INJECTED", f.expected);
    const wrongCorrected = want("CORRECTED", f.corrected);
    check(
      `scenario ${String(f.id).padStart(2, "0")} ${f.title}`,
      wrongFault.length === 0 && wrongCorrected.length === 0,
      [...wrongFault.map(([c, ty]) => `FAULT ${c} want ${ty} got ${results.FAULT_INJECTED[c]}`), ...wrongCorrected.map(([c, ty]) => `CORRECTED ${c} want ${ty} got ${results.CORRECTED[c]}`)].join("; ") || undefined,
    );
  }

  // Reseed isolation: a --refresh must not change any other workspace.
  const before = await otherCounts(ws.id);
  const run = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed-ai-hpc.ts"], { env: { ...process.env, DEMO_SEED: "ai-hpc" }, encoding: "utf8" });
  check("idempotent reseed is a no-op", run.status === 0 && /nothing to do/.test(run.stdout), run.stdout.split("\n")[0]);
  const after = await otherCounts(ws.id);
  check("other workspaces unchanged by reseed", JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));

  if (original) await applyDemoSnapshot(project.id, original, null);
  check("playback restored", (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).demoEvidenceSnapshot === original, original ?? "none");

  const jsonIdx = process.argv.indexOf("--json");
  if (jsonIdx > 0) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ ranAt: new Date().toISOString(), checks }, null, 2));
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
