import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { recomputeFindings } from "@/lib/verify/recompute";
import { SNAPSHOTS, type Snapshot } from "@/lib/demo/ai-hpc/evidence";

export function isSnapshot(v: unknown): v is Snapshot {
  return typeof v === "string" && (SNAPSHOTS as readonly string[]).includes(v);
}

/**
 * Switch which synthetic evidence snapshot a DEMO project reads, then recompute.
 * Real projects are rejected: playback is never presented as a live collection.
 */
export async function applyDemoSnapshot(projectId: string, snapshot: Snapshot, actorId: string | null) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { isDemo: true, demoEvidenceSnapshot: true } });
  if (!project?.isDemo) throw new Error("Evidence playback is only available on demo projects");
  const available = await prisma.evidenceImport.count({ where: { projectId, synthetic: true, demoSnapshot: snapshot } });
  if (available === 0) throw new Error(`No synthetic evidence for snapshot ${snapshot}`);
  const previous = project.demoEvidenceSnapshot;
  await prisma.project.update({ where: { id: projectId }, data: { demoEvidenceSnapshot: snapshot } });
  await recomputeFindings(projectId);
  await recordAudit({
    projectId,
    actorId,
    action: "demo.evidence_snapshot",
    summary: `Demo evidence playback switched ${previous ?? "none"} \u2192 ${snapshot} (synthetic)`,
    metadata: { from: previous, to: snapshot, synthetic: true },
  });
  return { previous, snapshot };
}
