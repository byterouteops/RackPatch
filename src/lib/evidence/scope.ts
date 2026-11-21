import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readDiscoveryProfile } from "@/lib/verify/observability";
import { normalizeDevice } from "@/lib/csv/normalize";

type ScopeProject = { id: string; isDemo: boolean; demoEvidenceSnapshot: string | null };

/**
 * Which evidence imports a project reads. Demo projects in playback read only synthetic imports
 * of the selected snapshot; every other project reads only real (non-synthetic) imports.
 */
export function evidenceScope(project: ScopeProject): Prisma.EvidenceImportWhereInput {
  if (project.isDemo && project.demoEvidenceSnapshot) {
    return { projectId: project.id, synthetic: true, demoSnapshot: project.demoEvidenceSnapshot };
  }
  return { projectId: project.id, synthetic: false };
}

export async function loadEvidenceScope(projectId: string): Promise<Prisma.EvidenceImportWhereInput> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, isDemo: true, demoEvidenceSnapshot: true } });
  return p ? evidenceScope(p) : { projectId, synthetic: false };
}

/**
 * Reference time for evidence age. Synthetic playback is judged against its newest capture so
 * the demo does not drift stale as wall-clock time passes.
 */
export async function evidenceAsOf(project: ScopeProject): Promise<Date> {
  if (!(project.isDemo && project.demoEvidenceSnapshot)) return new Date();
  const newest = await prisma.evidenceImport.findFirst({
    where: { ...evidenceScope(project), parseFailed: false, kind: "NEIGHBOR" },
    orderBy: { captureTime: "desc" },
    select: { captureTime: true, uploadedAt: true },
  });
  return newest?.captureTime ?? newest?.uploadedAt ?? new Date();
}

/** Planned device names that can actually produce neighbor evidence (excludes passive/unsupported). */
export async function collectablePlannedDevices(projectId: string, plannedDevices: string[]): Promise<string[]> {
  const inv = await prisma.deviceInventory.findMany({ where: { projectId }, select: { nameNorm: true, role: true, attributes: true } });
  const blocked = new Set(inv.filter((d) => readDiscoveryProfile(d.role, d.attributes).collectable === false).map((d) => d.nameNorm));
  return plannedDevices.filter((d) => !blocked.has(normalizeDevice(d)));
}
