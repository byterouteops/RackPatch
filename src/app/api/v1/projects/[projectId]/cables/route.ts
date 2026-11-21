import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateProjectRead } from "@/lib/api-auth";
import { normalizeCableType } from "@/lib/cable-type";

export const dynamic = "force-dynamic";

/** Read-only active-plan cables (Phase 19 CE). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authenticateProjectRead(request, projectId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!project.activeRevisionId) {
    return NextResponse.json({ cables: [], revisionId: null });
  }

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: project.activeRevisionId },
    include: {
      runtime: true,
      findings: {
        where: { revisionId: project.activeRevisionId },
        take: 1,
      },
    },
    orderBy: { cableId: "asc" },
  });

  return NextResponse.json({
    revisionId: project.activeRevisionId,
    cables: links.map((l) => ({
      id: l.id,
      cableId: l.cableId,
      a: { rack: l.aRack, device: l.aDevice, port: l.aPort },
      z: { rack: l.zRack, device: l.zDevice, port: l.zPort },
      cableType: l.cableType,
      cableTypeNormalized: normalizeCableType(l.cableType),
      installStatus: l.runtime?.installStatus ?? "PLANNED",
      assetSerial: l.runtime?.assetSerial ?? null,
      lengthMeters: l.runtime?.lengthMeters ?? null,
      retiredAt: l.runtime?.retiredAt ?? null,
      verificationState: l.findings[0]?.state ?? "AWAITING",
    })),
    authVia: auth.via,
  });
}
