import {
  ExceptionStatus,
  FindingSeverity,
  FindingType,
  VerificationState,
  type Prisma,
} from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { computeOutcomes } from "@/lib/verify/compute";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";

const WRITE_CHUNK = 150;

/**
 * Recompute verification findings for the active revision from the latest evidence per device
 * (a newer import for one device does not erase others) + physical checks.
 *
 * Demo projects with `demoEvidenceSnapshot` set read only synthetic imports of that snapshot;
 * real projects never read synthetic evidence.
 */
export async function recomputeFindings(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { compliancePolicy: true },
  });
  if (!project?.activeRevisionId) return;
  const revisionId = project.activeRevisionId;
  const snapshot = project.isDemo ? project.demoEvidenceSnapshot : null;

  const [links, aliases, portAliases, devices, imports] = await Promise.all([
    prisma.plannedLink.findMany({
      where: { revisionId },
      include: {
        physicalChecks: { orderBy: { verifiedAt: "desc" }, take: 1 },
        findings: { where: { revisionId } },
      },
    }),
    prisma.deviceAlias.findMany({ where: { projectId } }),
    prisma.portAlias.findMany({ where: { projectId } }),
    prisma.deviceInventory.findMany({ where: { projectId }, select: { nameNorm: true, role: true, attributes: true } }),
    prisma.evidenceImport.findMany({
      where: snapshot ? { projectId, synthetic: true, demoSnapshot: snapshot } : { projectId, synthetic: false },
      orderBy: { uploadedAt: "desc" },
      include: { observations: true, interfaceStates: true },
    }),
  ]);

  // Staleness only when the project has an enabled compliance policy. Synthetic playback is judged
  // relative to its own newest capture so the demo is deterministic.
  const policy = project.compliancePolicy;
  const computed = computeOutcomes({
    links,
    aliases,
    portAliases,
    devices,
    imports,
    maxEvidenceAgeDays: policy?.enabled ? policy.maxEvidenceAgeDays : null,
    now: snapshot ? null : new Date(),
  });
  const byCable = new Map(computed.links.map((c) => [c.cableId, c]));
  const cleared: Array<{
    cableId: string;
    fromState: VerificationState;
    toState: VerificationState;
    previousObserved: string | null;
    newObserved: string | null;
  }> = [];
  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const link of links) {
    const { match, observability: obs, outcome } = byCable.get(link.cableId)!;

    let state = outcome.state as VerificationState;
    let findingType = outcome.findingType as FindingType;
    let severity = outcome.severity as FindingSeverity;
    let observedSummary = outcome.observedSummary;
    let nextAction = outcome.nextAction;
    let evidenceSource = match.evidenceSource;
    const captureTime = match.captureTime;

    const physical = link.physicalChecks[0];
    if (physical && physical.aConfirmed && physical.zConfirmed) {
      if (state === VerificationState.MISMATCH || findingType === FindingType.CONFLICTING_OBSERVATIONS) {
        state = VerificationState.NEEDS_REVIEW;
        findingType = FindingType.PHYSICAL_MISMATCH;
        severity = FindingSeverity.ERROR;
        nextAction = "LLDP evidence conflicts with physical verification — review before handover";
        observedSummary = [match.observedSummary, `Physical OK by verifier at ${physical.verifiedAt.toISOString()}`]
          .filter(Boolean)
          .join(" | ");
      } else if (state === VerificationState.AWAITING || state === VerificationState.VERIFIED_LLDP) {
        state = VerificationState.VERIFIED_PHYSICAL;
        findingType = FindingType.EXACT_MATCH;
        severity = FindingSeverity.INFO;
        evidenceSource = evidenceSource
          ? `${evidenceSource}; PHYSICAL:${physical.verifierId}`
          : `PHYSICAL:${physical.verifierId}@${physical.verifiedAt.toISOString()}`;
        nextAction = "No action required";
        if (!observedSummary) observedSummary = `Physically verified both ends (${physical.verifiedAt.toISOString()})`;
      }
    } else if (physical && (!physical.aConfirmed || !physical.zConfirmed)) {
      state = VerificationState.MISMATCH;
      findingType = FindingType.PHYSICAL_MISMATCH;
      severity = FindingSeverity.ERROR;
      nextAction = `Independent verifier rejected the installation (${!physical.aConfirmed ? "A" : ""}${!physical.zConfirmed ? "Z" : ""} end not confirmed); correct and re-verify`;
      observedSummary = [match.observedSummary, physical.note ? `QC: ${physical.note}` : null].filter(Boolean).join(" | ") || null;
    }

    const previous = link.findings[0];
    let exceptionStatus = previous?.exceptionStatus ?? ExceptionStatus.OPEN;
    let justCleared = false;
    if (state === VerificationState.VERIFIED_LLDP || state === VerificationState.VERIFIED_PHYSICAL) {
      if (previous && (previous.state === VerificationState.MISMATCH || previous.state === VerificationState.NEEDS_REVIEW)) {
        exceptionStatus = ExceptionStatus.CLOSED;
        justCleared = true;
      }
    } else if (state === VerificationState.MISMATCH || state === VerificationState.NEEDS_REVIEW) {
      if (exceptionStatus === ExceptionStatus.CLOSED) exceptionStatus = ExceptionStatus.OPEN;
    }

    if (justCleared && previous) {
      cleared.push({
        cableId: link.cableId,
        fromState: previous.state,
        toState: state,
        previousObserved: previous.observedSummary,
        newObserved: observedSummary ?? null,
      });
    }

    const data = {
      state,
      findingType,
      severity,
      expectedSummary: match.expectedSummary,
      observedSummary,
      evidenceSource,
      captureTime,
      nextAction,
      relatedCableId: match.relatedCableId,
      observedSides: match.observedSides,
      observability: obs.observability,
      exceptionStatus,
    };

    if (
      previous &&
      previous.state === data.state &&
      previous.findingType === data.findingType &&
      previous.severity === data.severity &&
      previous.observedSummary === data.observedSummary &&
      previous.nextAction === data.nextAction &&
      previous.relatedCableId === data.relatedCableId &&
      previous.observedSides === data.observedSides &&
      previous.observability === data.observability &&
      previous.exceptionStatus === data.exceptionStatus &&
      previous.evidenceSource === data.evidenceSource
    ) {
      continue;
    }

    writes.push(
      prisma.verificationFinding.upsert({
        where: { plannedLinkId_revisionId: { plannedLinkId: link.id, revisionId } },
        create: {
          plannedLinkId: link.id,
          revisionId,
          ...data,
          closedAt: exceptionStatus === ExceptionStatus.CLOSED ? new Date() : null,
          closedReason: exceptionStatus === ExceptionStatus.CLOSED ? "Resolved by new evidence" : null,
        },
        update: {
          ...data,
          closedAt: exceptionStatus === ExceptionStatus.CLOSED ? previous?.closedAt ?? new Date() : null,
          closedReason:
            exceptionStatus === ExceptionStatus.CLOSED ? previous?.closedReason ?? "Resolved by new evidence" : null,
          computedAt: new Date(),
        },
      }),
    );
  }

  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    await prisma.$transaction(writes.slice(i, i + WRITE_CHUNK));
  }

  if (cleared.length > 0) {
    await recordAudit({
      projectId,
      action: "verify.evidence_cleared",
      summary:
        cleared.length === 1
          ? `Evidence cleared exception on ${cleared[0].cableId}`
          : `Evidence cleared exceptions on ${cleared.map((c) => c.cableId).join(", ")}`,
      metadata: { cleared, importDevices: computed.neighborDevices, snapshot },
    });
  }
}

export function applyAliasNorm(device: string, aliases: Map<string, string>) {
  const n = normalizeDevice(device);
  return aliases.get(n) ?? n;
}

export function applyPortNorm(deviceNorm: string, port: string, aliases: Map<string, string>) {
  const p = normalizePort(port);
  return aliases.get(`${deviceNorm}|${p}`) ?? p;
}
