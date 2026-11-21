import {
  ExceptionStatus,
  FindingSeverity,
  FindingType,
  VerificationState,
} from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  kindToVerificationState,
  matchObservationsToPlan,
  type ObservedNeighbor,
  type PlannedEndpoint,
} from "@/lib/verify/match";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";

/**
 * Recompute verification findings for the active revision from latest observations
 * per switch (newer import for one switch does not erase others) + physical checks.
 */
export async function recomputeFindings(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.activeRevisionId) return;

  const revisionId = project.activeRevisionId;
  const links = await prisma.plannedLink.findMany({
    where: { revisionId },
    include: {
      runtime: true,
      physicalChecks: { orderBy: { verifiedAt: "desc" }, take: 1 },
      findings: { where: { revisionId } },
    },
  });

  const aliases = await prisma.deviceAlias.findMany({ where: { projectId } });
  const aliasMap = new Map(aliases.map((a) => [a.aliasNorm, a.deviceNorm]));

  const portAliases = await prisma.portAlias.findMany({ where: { projectId } });
  const portAliasMap = new Map(
    portAliases.map((p) => [`${p.deviceNorm}|${p.aliasNorm}`, p.portNorm]),
  );

  // Latest successful import per source switch
  const imports = await prisma.evidenceImport.findMany({
    where: { projectId, parseFailed: false },
    orderBy: { uploadedAt: "desc" },
    include: { observations: true },
  });

  const seenDevices = new Set<string>();
  const observations: ObservedNeighbor[] = [];
  for (const imp of imports) {
    if (seenDevices.has(imp.sourceDeviceNorm)) continue;
    seenDevices.add(imp.sourceDeviceNorm);
    for (const obs of imp.observations) {
      let remoteNorm = obs.remoteSystemNorm;
      if (remoteNorm && aliasMap.has(remoteNorm)) {
        remoteNorm = aliasMap.get(remoteNorm)!;
      }
      let remotePort = obs.remotePortNorm;
      if (remoteNorm && remotePort) {
        const key = `${remoteNorm}|${remotePort}`;
        if (portAliasMap.has(key)) remotePort = portAliasMap.get(key)!;
      }
      observations.push({
        localDeviceNorm: imp.sourceDeviceNorm,
        localPortNorm: obs.localInterfaceNorm,
        remoteDeviceNorm: remoteNorm,
        remotePortNorm: remotePort,
        localDevice: imp.sourceDevice,
        localPort: obs.localInterface,
        remoteDevice: obs.remoteSystemName,
        remotePort: obs.remotePortId,
        captureTime: imp.captureTime ?? imp.uploadedAt,
        evidenceSource: `LLDP:${imp.sourceDevice}@${(imp.captureTime ?? imp.uploadedAt).toISOString()}`,
      });
    }
  }

  const planned: PlannedEndpoint[] = links.map((l) => ({
    cableId: l.cableId,
    aDeviceNorm: l.aDeviceNorm,
    aPortNorm: l.aPortNorm,
    zDeviceNorm: l.zDeviceNorm,
    zPortNorm: l.zPortNorm,
    aDevice: l.aDevice,
    aPort: l.aPort,
    zDevice: l.zDevice,
    zPort: l.zPort,
  }));

  const matches = matchObservationsToPlan(planned, observations);
  const byCable = new Map(matches.map((m) => [m.cableId, m]));
  const cleared: Array<{
    cableId: string;
    fromState: VerificationState;
    toState: VerificationState;
    previousObserved: string | null;
    newObserved: string | null;
  }> = [];

  for (const link of links) {
    const match = byCable.get(link.cableId)!;
    const mapped = kindToVerificationState(match.kind);
    let state = mapped.state as VerificationState;
    let findingType = mapped.findingType as FindingType;
    let severity = mapped.severity as FindingSeverity;
    let observedSummary = match.observedSummary;
    let nextAction = match.nextAction;
    let evidenceSource = match.evidenceSource;
    const captureTime = match.captureTime;

    const physical = link.physicalChecks[0];
    if (physical) {
      // Physical evidence is separate; conflict with LLDP mismatch → needs review
      if (match.kind === "wrong_endpoint" || match.kind === "conflicting") {
        state = VerificationState.NEEDS_REVIEW;
        findingType = FindingType.PHYSICAL_MISMATCH;
        severity = FindingSeverity.ERROR;
        nextAction =
          "LLDP evidence conflicts with physical verification — review before handover";
        observedSummary = [
          match.observedSummary,
          `Physical OK by verifier at ${physical.verifiedAt.toISOString()}`,
        ]
          .filter(Boolean)
          .join(" | ");
      } else if (match.kind === "no_observation" || match.kind === "exact") {
        state = VerificationState.VERIFIED_PHYSICAL;
        findingType =
          match.kind === "exact" ? FindingType.EXACT_MATCH : FindingType.EXACT_MATCH;
        severity = FindingSeverity.INFO;
        evidenceSource = evidenceSource
          ? `${evidenceSource}; PHYSICAL:${physical.verifierId}`
          : `PHYSICAL:${physical.verifierId}@${physical.verifiedAt.toISOString()}`;
        nextAction = "No action required";
        if (!observedSummary) {
          observedSummary = `Physically verified both ends (${physical.verifiedAt.toISOString()})`;
        }
      }
    }

    const previous = link.findings[0];
    let exceptionStatus = previous?.exceptionStatus ?? ExceptionStatus.OPEN;
    let justCleared = false;
    if (
      state === VerificationState.VERIFIED_LLDP ||
      state === VerificationState.VERIFIED_PHYSICAL
    ) {
      if (
        previous &&
        (previous.state === VerificationState.MISMATCH ||
          previous.state === VerificationState.NEEDS_REVIEW)
      ) {
        exceptionStatus = ExceptionStatus.CLOSED;
        justCleared = true;
      }
    } else if (
      state === VerificationState.MISMATCH ||
      state === VerificationState.NEEDS_REVIEW
    ) {
      if (exceptionStatus === ExceptionStatus.CLOSED) {
        exceptionStatus = ExceptionStatus.OPEN;
      }
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

    await prisma.verificationFinding.upsert({
      where: {
        plannedLinkId_revisionId: { plannedLinkId: link.id, revisionId },
      },
      create: {
        plannedLinkId: link.id,
        revisionId,
        state,
        findingType,
        severity,
        expectedSummary: match.expectedSummary,
        observedSummary,
        evidenceSource,
        captureTime,
        nextAction,
        relatedCableId: match.relatedCableId,
        exceptionStatus,
        closedAt: exceptionStatus === ExceptionStatus.CLOSED ? new Date() : null,
        closedReason:
          exceptionStatus === ExceptionStatus.CLOSED ? "Resolved by new evidence" : null,
      },
      update: {
        state,
        findingType,
        severity,
        expectedSummary: match.expectedSummary,
        observedSummary,
        evidenceSource,
        captureTime,
        nextAction,
        relatedCableId: match.relatedCableId,
        exceptionStatus,
        closedAt:
          exceptionStatus === ExceptionStatus.CLOSED
            ? previous?.closedAt ?? new Date()
            : null,
        closedReason:
          exceptionStatus === ExceptionStatus.CLOSED
            ? previous?.closedReason ?? "Resolved by new evidence"
            : null,
        computedAt: new Date(),
        // Preserve acknowledgment fields
        acknowledgedAt: previous?.acknowledgedAt,
        acknowledgedById: previous?.acknowledgedById,
        acknowledgeNote: previous?.acknowledgeNote,
      },
    });
  }

  if (cleared.length > 0) {
    await recordAudit({
      projectId,
      action: "verify.evidence_cleared",
      summary:
        cleared.length === 1
          ? `Evidence cleared exception on ${cleared[0].cableId}`
          : `Evidence cleared exceptions on ${cleared.map((c) => c.cableId).join(", ")}`,
      metadata: {
        cleared,
        importDevices: Array.from(seenDevices),
      },
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
