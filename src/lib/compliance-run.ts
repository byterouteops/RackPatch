import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";
import { recomputeFindings } from "@/lib/verify/recompute";
import {
  buildComplianceEmail,
  evaluateCompliance,
  parseNotifyEmails,
  shouldNotify,
  type ComplianceEvaluation,
} from "@/lib/compliance";

export type ComplianceRunResult = {
  projectId: string;
  runId: string;
  status: string;
  summary: string;
  notified: boolean;
  notifyError: string | null;
};

/**
 * Evaluate one project against its CompliancePolicy and persist a ComplianceRun.
 * Emails (Resend) only when issues exist, recipients are configured, and the issue set
 * changed or the 24h cooldown elapsed.
 */
export async function runComplianceCheck(
  projectId: string,
  trigger: "cron" | "manual",
): Promise<ComplianceRunResult | null> {
  const policy = await prisma.compliancePolicy.findUnique({
    where: { projectId },
    include: { project: true },
  });
  if (!policy) return null;
  const project = policy.project;

  let evaluation: ComplianceEvaluation;
  try {
    if (policy.recomputeFindings && project.activeRevisionId) {
      await recomputeFindings(projectId);
    }

    let plannedDevices: string[] = [];
    let mismatchCount = 0;
    let needsReviewCount = 0;

    if (project.activeRevisionId) {
      const links = await prisma.plannedLink.findMany({
        where: { revisionId: project.activeRevisionId },
        select: { aDevice: true, zDevice: true },
      });
      plannedDevices = Array.from(new Set(links.flatMap((l) => [l.aDevice, l.zDevice])));

      const rows = await prisma.verificationFinding.groupBy({
        by: ["state"],
        where: {
          revisionId: project.activeRevisionId,
          state: { in: ["MISMATCH", "NEEDS_REVIEW"] },
          exceptionStatus: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        _count: true,
      });
      for (const r of rows) {
        if (r.state === "MISMATCH") mismatchCount += r._count;
        if (r.state === "NEEDS_REVIEW") needsReviewCount += r._count;
      }
    }

    const imports = await prisma.evidenceImport.findMany({
      where: { projectId },
      select: {
        sourceDevice: true,
        sourceDeviceNorm: true,
        uploadedAt: true,
        captureTime: true,
        parseFailed: true,
      },
      orderBy: { uploadedAt: "desc" },
      take: 1000,
    });

    const staleness = computeEvidenceStaleness({
      imports,
      plannedDevices,
      maxAgeDays: policy.maxEvidenceAgeDays,
    });
    evaluation = evaluateCompliance({ staleness, mismatchCount, needsReviewCount });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Compliance check failed";
    const run = await prisma.complianceRun.create({
      data: {
        projectId,
        trigger,
        status: "ERROR",
        maxEvidenceAgeDays: policy.maxEvidenceAgeDays,
        summary: message.slice(0, 500),
      },
    });
    return {
      projectId,
      runId: run.id,
      status: "ERROR",
      summary: run.summary,
      notified: false,
      notifyError: null,
    };
  }

  const lastNotifiedRun = await prisma.complianceRun.findFirst({
    where: { projectId, notified: true },
    orderBy: { createdAt: "desc" },
    select: { fingerprint: true, createdAt: true },
  });

  const { emails } = parseNotifyEmails(policy.notifyEmails);
  let notified = false;
  let notifyError: string | null = null;

  if (
    shouldNotify({
      evaluation,
      recipientCount: emails.length,
      lastNotified: lastNotifiedRun
        ? { fingerprint: lastNotifiedRun.fingerprint, at: lastNotifiedRun.createdAt }
        : null,
    })
  ) {
    const mail = buildComplianceEmail({
      projectName: project.name,
      evaluation,
      projectUrl: `${getAppUrl()}/app/projects/${projectId}/compliance`,
    });
    const sent = await sendEmail({ to: emails, subject: mail.subject, text: mail.text });
    if (!sent.ok) notifyError = sent.error;
    // Only a real send counts as "notified" (skipped = no RESEND_API_KEY).
    else notified = !sent.skipped;
  }

  const run = await prisma.complianceRun.create({
    data: {
      projectId,
      trigger,
      status: evaluation.status,
      staleDeviceCount: evaluation.staleDeviceCount,
      neverImportedCount: evaluation.neverImportedCount,
      mismatchCount: evaluation.mismatchCount,
      needsReviewCount: evaluation.needsReviewCount,
      maxEvidenceAgeDays: evaluation.maxEvidenceAgeDays,
      fingerprint: evaluation.fingerprint,
      summary: evaluation.summary.slice(0, 1000),
      notified,
      notifyError,
    },
  });

  await recordAudit({
    projectId,
    action: "compliance.run",
    summary: `Compliance ${trigger} run: ${evaluation.status}`,
    metadata: { runId: run.id, notified },
  });

  return {
    projectId,
    runId: run.id,
    status: run.status,
    summary: run.summary,
    notified,
    notifyError,
  };
}

/** Run all enabled policies (optionally one project). */
export async function runAllCompliance(opts: { projectId?: string }) {
  const policies = await prisma.compliancePolicy.findMany({
    where: { enabled: true, ...(opts.projectId ? { projectId: opts.projectId } : {}) },
    select: { projectId: true },
  });
  const results: ComplianceRunResult[] = [];
  for (const p of policies) {
    const r = await runComplianceCheck(p.projectId, "cron");
    if (r) results.push(r);
  }
  return results;
}
