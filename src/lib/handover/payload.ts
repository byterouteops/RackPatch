import { prisma } from "@/lib/db";

/** Full handover dataset for a project. Callers must authorize first (requireProjectAccess). */
export async function buildHandoverPayload(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      activeRevision: true,
    },
  });
  if (!project.activeRevisionId) throw new Error("No active revision");

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: project.activeRevisionId },
    include: {
      runtime: { include: { installer: true } },
      findings: { where: { revisionId: project.activeRevisionId } },
      physicalChecks: { orderBy: { verifiedAt: "desc" }, take: 1, include: { verifier: true } },
    },
    orderBy: [{ aRack: "asc" }, { cableId: "asc" }],
  });

  const findings = links.map((l) => l.findings[0]).filter(Boolean);
  const unresolved = findings.filter(
    (f) =>
      (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") &&
      f.exceptionStatus !== "CLOSED",
  );
  const awaiting = findings.filter((f) => f.state === "AWAITING");

  return {
    project: {
      id: project.id,
      name: project.name,
      customerName: project.customerName,
      site: project.site,
      timeZone: project.timeZone,
    },
    revision: {
      id: project.activeRevision!.id,
      number: project.activeRevision!.revisionNumber,
      publishedAt: project.activeRevision!.publishedAt.toISOString(),
    },
    counts: {
      links: links.length,
      installed: links.filter((l) => l.runtime?.installStatus === "INSTALLED").length,
      blocked: links.filter((l) => l.runtime?.installStatus === "BLOCKED").length,
      verifiedLldp: findings.filter((f) => f.state === "VERIFIED_LLDP").length,
      verifiedPhysical: findings.filter((f) => f.state === "VERIFIED_PHYSICAL").length,
      mismatch: findings.filter((f) => f.state === "MISMATCH").length,
      needsReview: findings.filter((f) => f.state === "NEEDS_REVIEW").length,
      awaiting: awaiting.length,
      unresolvedExceptions: unresolved.length,
    },
    links: links.map((l) => {
      const f = l.findings[0];
      return {
        cableId: l.cableId,
        aRack: l.aRack,
        aDevice: l.aDevice,
        aPort: l.aPort,
        zRack: l.zRack,
        zDevice: l.zDevice,
        zPort: l.zPort,
        cableType: l.cableType,
        installStatus: l.runtime?.installStatus ?? "PLANNED",
        blockedReason: l.runtime?.blockedReason,
        installerEmail: l.runtime?.installer?.email ?? null,
        verificationState: f?.state ?? "AWAITING",
        expected: f?.expectedSummary ?? null,
        observed: f?.observedSummary ?? null,
        evidenceSource: f?.evidenceSource ?? null,
        captureTime: f?.captureTime?.toISOString() ?? null,
        exceptionStatus: f?.exceptionStatus ?? null,
        physicalVerifier: l.physicalChecks[0]?.verifier.email ?? null,
      };
    }),
    unresolvedExceptions: unresolved.map((f) => ({
      expected: f.expectedSummary,
      observed: f.observedSummary,
      state: f.state,
      nextAction: f.nextAction,
      relatedCableId: f.relatedCableId,
      evidenceSource: f.evidenceSource,
      captureTime: f.captureTime?.toISOString() ?? null,
      acknowledgeNote: f.acknowledgeNote,
    })),
    awaitingVerification: awaiting.map((f) => f.expectedSummary),
  };
}