import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateProjectRead } from "@/lib/api-auth";
import { computeCapacitySummary } from "@/lib/capacity";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";
import { loadEvidenceScope } from "@/lib/evidence/scope";
import { normalizeDevice } from "@/lib/csv/normalize";

export const dynamic = "force-dynamic";

/** Read-only project summary (Phase 19 CE). Session or Bearer API token. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authenticateProjectRead(request, projectId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { siteRef: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let capacity = null;
  const findings = { verified: 0, mismatch: 0, awaiting: 0 };
  let staleness = null;

  if (project.activeRevisionId) {
    const links = await prisma.plannedLink.findMany({
      where: { revisionId: project.activeRevisionId },
      include: { runtime: true },
    });
    capacity = computeCapacitySummary(
      links.map((l) => ({
        aRack: l.aRack,
        zRack: l.zRack,
        aDevice: l.aDevice,
        zDevice: l.zDevice,
        aPort: l.aPort,
        zPort: l.zPort,
        cableType: l.cableType,
        installStatus: l.runtime?.installStatus ?? null,
        retiredAt: l.runtime?.retiredAt ?? null,
      })),
    );

    const findingRows = await prisma.verificationFinding.groupBy({
      by: ["state"],
      where: { revisionId: project.activeRevisionId },
      _count: true,
    });
    for (const row of findingRows) {
      if (row.state === "VERIFIED_LLDP" || row.state === "VERIFIED_PHYSICAL") {
        findings.verified += row._count;
      } else if (row.state === "MISMATCH" || row.state === "NEEDS_REVIEW") {
        findings.mismatch += row._count;
      } else if (row.state === "AWAITING") {
        findings.awaiting += row._count;
      }
    }

    const devices = Array.from(
      new Set(links.flatMap((l) => [l.aDevice, l.zDevice])),
    );
    const imports = await prisma.evidenceImport.findMany({
      where: { ...(await loadEvidenceScope(projectId)), kind: "NEIGHBOR" },
      select: {
        sourceDevice: true,
        sourceDeviceNorm: true,
        uploadedAt: true,
        captureTime: true,
        parseFailed: true,
      },
      orderBy: { uploadedAt: "desc" },
      take: 500,
    });
    staleness = computeEvidenceStaleness({
      imports,
      plannedDevices: devices.map((d) => normalizeDevice(d)),
      maxAgeDays: 7,
    });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      site: project.site,
      siteId: project.siteId,
      customerName: project.customerName,
      activeRevisionId: project.activeRevisionId,
    },
    capacity,
    findings,
    evidenceStaleness: staleness
      ? {
          maxAgeDays: staleness.maxAgeDays,
          staleCount: staleness.stale.length,
          neverImportedCount: staleness.neverImported.length,
          staleDevices: staleness.stale.slice(0, 50).map((s) => ({
            device: s.sourceDevice,
            ageDays: s.ageDays,
            parseFailed: s.parseFailed,
          })),
        }
      : null,
    authVia: auth.via,
  });
}
