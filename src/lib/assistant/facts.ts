import { prisma } from "@/lib/db";
import { computeCapacitySummary } from "@/lib/capacity";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import type { AssistantFacts } from "@/lib/assistant/answer";

/** Retrieve the project facts the assistant is allowed to answer from. Read-only. */
export async function loadAssistantFacts(
  projectId: string,
  activeRevisionId: string | null,
): Promise<AssistantFacts> {
  if (!activeRevisionId) {
    return {
      hasActivePlan: false,
      counts: {
        cables: 0,
        installed: 0,
        verified: 0,
        awaiting: 0,
        mismatches: 0,
        needsReview: 0,
        openExceptions: 0,
      },
      findings: [],
      cableIds: [],
      playbooks: [],
      staleness: null,
      capacity: null,
    };
  }

  const [links, findings, imports] = await Promise.all([
    prisma.plannedLink.findMany({
      where: { revisionId: activeRevisionId },
      include: { runtime: true },
    }),
    prisma.verificationFinding.findMany({
      where: { revisionId: activeRevisionId },
      include: { plannedLink: true },
      orderBy: { computedAt: "desc" },
    }),
    prisma.evidenceImport.findMany({
      where: { projectId },
      select: {
        sourceDevice: true,
        sourceDeviceNorm: true,
        uploadedAt: true,
        captureTime: true,
        parseFailed: true,
      },
      orderBy: { uploadedAt: "desc" },
      take: 500,
    }),
  ]);

  const openFindings = findings.filter(
    (f) =>
      f.exceptionStatus !== "CLOSED" && (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW"),
  );

  const staleness = computeEvidenceStaleness({
    imports,
    plannedDevices: Array.from(new Set(links.flatMap((l) => [l.aDevice, l.zDevice]))),
    maxAgeDays: 7,
  });

  const capacity = computeCapacitySummary(
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

  return {
    hasActivePlan: true,
    counts: {
      cables: links.length,
      installed: links.filter((l) => l.runtime?.installStatus === "INSTALLED").length,
      verified: findings.filter(
        (f) => f.state === "VERIFIED_LLDP" || f.state === "VERIFIED_PHYSICAL",
      ).length,
      awaiting: findings.filter((f) => f.state === "AWAITING").length,
      mismatches: openFindings.filter((f) => f.state === "MISMATCH").length,
      needsReview: openFindings.filter((f) => f.state === "NEEDS_REVIEW").length,
      openExceptions: openFindings.length,
    },
    findings: openFindings.map((f) => ({
      cableId: f.plannedLink.cableId,
      state: f.state,
      findingType: f.findingType,
      expected: f.expectedSummary,
      observed: f.observedSummary,
      relatedCableId: f.relatedCableId,
      exceptionStatus: f.exceptionStatus,
      nextAction: f.nextAction,
    })),
    cableIds: links.map((l) => l.cableId),
    playbooks: buildSwapFixPlaybooks(
      openFindings.map((f) => ({
        cableId: f.plannedLink.cableId,
        relatedCableId: f.relatedCableId,
        findingType: f.findingType,
        state: f.state,
        expectedSummary: f.expectedSummary,
        observedSummary: f.observedSummary,
        aRack: f.plannedLink.aRack,
        zRack: f.plannedLink.zRack,
        aDevice: f.plannedLink.aDevice,
        aPort: f.plannedLink.aPort,
        zDevice: f.plannedLink.zDevice,
        zPort: f.plannedLink.zPort,
        plannedLinkId: f.plannedLinkId,
      })),
    ),
    staleness: {
      maxAgeDays: staleness.maxAgeDays,
      stale: staleness.stale.map((d) => ({
        device: d.sourceDevice,
        ageDays: d.ageDays,
        parseFailed: d.parseFailed,
      })),
      neverImported: staleness.neverImported,
    },
    capacity,
  };
}
