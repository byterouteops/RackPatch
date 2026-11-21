import { createHash, timingSafeEqual } from "node:crypto";
import type { StalenessReport } from "@/lib/evidence-staleness";

/**
 * Pure helpers for the continuous compliance engine (Phase 11 CE).
 * Scheduling is external (cron calling the internal route); nothing here talks to the DB.
 */

export const COMPLIANCE_NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTIFY_EMAILS = 10;

export type ComplianceStatus = "OK" | "ISSUES" | "ERROR";

export type ComplianceEvaluation = {
  status: ComplianceStatus;
  staleDeviceCount: number;
  neverImportedCount: number;
  mismatchCount: number;
  needsReviewCount: number;
  maxEvidenceAgeDays: number;
  fingerprint: string | null;
  summary: string;
  lines: string[];
};

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Parse comma/semicolon/newline separated emails; lowercase, de-dupe, drop invalid. */
export function parseNotifyEmails(input: string | string[] | null | undefined): {
  emails: string[];
  invalid: string[];
} {
  const parts = Array.isArray(input)
    ? input.flatMap((s) => s.split(/[,;\n]/))
    : (input ?? "").split(/[,;\n]/);
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e) || e.length > 254) {
      invalid.push(raw.trim());
      continue;
    }
    if (seen.has(e)) continue;
    seen.add(e);
    emails.push(e);
  }
  return { emails: emails.slice(0, MAX_NOTIFY_EMAILS), invalid };
}

/** Constant-time comparison of the cron header against COMPLIANCE_CRON_SECRET. */
export function verifyComplianceSecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const exp = expected?.trim() ?? "";
  if (!exp || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(exp).digest();
  return timingSafeEqual(a, b);
}

export function evaluateCompliance(input: {
  staleness: StalenessReport;
  mismatchCount: number;
  needsReviewCount: number;
}): ComplianceEvaluation {
  const { staleness } = input;
  const staleDeviceCount = staleness.stale.length;
  const neverImportedCount = staleness.neverImported.length;
  const { mismatchCount, needsReviewCount } = input;

  const lines: string[] = [];
  if (staleDeviceCount > 0) {
    lines.push(
      `${staleDeviceCount} device(s) with stale or failed evidence (> ${staleness.maxAgeDays} days): ${staleness.stale
        .slice(0, 10)
        .map((d) => d.sourceDevice)
        .join(", ")}${staleDeviceCount > 10 ? ", ..." : ""}`,
    );
  }
  if (neverImportedCount > 0) {
    lines.push(
      `${neverImportedCount} planned device(s) never imported: ${staleness.neverImported
        .slice(0, 10)
        .join(", ")}${neverImportedCount > 10 ? ", ..." : ""}`,
    );
  }
  if (mismatchCount > 0) lines.push(`${mismatchCount} open mismatch finding(s)`);
  if (needsReviewCount > 0) lines.push(`${needsReviewCount} finding(s) needing review`);

  const hasIssues = lines.length > 0;
  const fingerprint = hasIssues
    ? createHash("sha256")
        .update(
          JSON.stringify({
            stale: staleness.stale.map((d) => d.sourceDeviceNorm).sort(),
            never: [...staleness.neverImported].sort(),
            mismatchCount,
            needsReviewCount,
          }),
        )
        .digest("hex")
        .slice(0, 32)
    : null;

  return {
    status: hasIssues ? "ISSUES" : "OK",
    staleDeviceCount,
    neverImportedCount,
    mismatchCount,
    needsReviewCount,
    maxEvidenceAgeDays: staleness.maxAgeDays,
    fingerprint,
    summary: hasIssues ? lines.join("; ") : "No compliance issues",
    lines,
  };
}

/**
 * Email only when issues exist and (issue set changed OR cooldown elapsed since last notification).
 */
export function shouldNotify(opts: {
  evaluation: Pick<ComplianceEvaluation, "status" | "fingerprint">;
  recipientCount: number;
  lastNotified: { fingerprint: string | null; at: Date } | null;
  now?: Date;
  cooldownMs?: number;
}): boolean {
  if (opts.evaluation.status !== "ISSUES") return false;
  if (opts.recipientCount === 0) return false;
  const last = opts.lastNotified;
  if (!last) return true;
  if (last.fingerprint !== opts.evaluation.fingerprint) return true;
  const now = opts.now ?? new Date();
  return now.getTime() - last.at.getTime() >= (opts.cooldownMs ?? COMPLIANCE_NOTIFY_COOLDOWN_MS);
}

export function buildComplianceEmail(opts: {
  projectName: string;
  evaluation: ComplianceEvaluation;
  projectUrl: string;
}): { subject: string; text: string } {
  const { evaluation } = opts;
  return {
    subject: `[RackPatch] Compliance issues: ${opts.projectName}`,
    text: [
      `RackPatch compliance check found issues for "${opts.projectName}".`,
      "",
      ...evaluation.lines.map((l) => `- ${l}`),
      "",
      `Open the project: ${opts.projectUrl}`,
    ].join("\n"),
  };
}
