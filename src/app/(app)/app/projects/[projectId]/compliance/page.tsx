import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { CompliancePolicyForm } from "@/components/compliance-policy-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, Card, EmptyState } from "@/components/ui";

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="You do not have access to this project."
      />
    );
  }

  const [policy, runs] = await Promise.all([
    prisma.compliancePolicy.findUnique({ where: { projectId } }),
    prisma.complianceRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const cronConfigured = Boolean(process.env.COMPLIANCE_CRON_SECRET?.trim());
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Compliance"
        title="Compliance"
        description="Scheduled evidence-freshness and mismatch checks with optional email alerts."
        actions={
          <>
            <Badge tone={cronConfigured ? "success" : "warning"}>
              Cron {cronConfigured ? "configured" : "not configured"}
            </Badge>
            <Badge tone={emailConfigured ? "success" : "neutral"}>
              Email {emailConfigured ? "configured" : "not configured"}
            </Badge>
          </>
        }
      />

      <div className="space-y-6">
        <Card
          title="Policy"
          description={`Cron endpoint: ${cronConfigured ? "configured" : "COMPLIANCE_CRON_SECRET not set"} - Email: ${
            emailConfigured ? "Resend configured" : "RESEND_API_KEY not set (alerts logged only)"
          }`}
        >
          <CompliancePolicyForm
            projectId={projectId}
            hasPolicy={Boolean(policy)}
            canEdit={access.canManageProject}
            initial={{
              enabled: policy?.enabled ?? true,
              maxEvidenceAgeDays: policy?.maxEvidenceAgeDays ?? 7,
              notifyEmails: (policy?.notifyEmails ?? []).join(", "),
              recomputeFindings: policy?.recomputeFindings ?? false,
            }}
          />
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-fg)]">
            Schedule with an external cron:{" "}
            <code className="rp-mono rounded bg-[var(--muted)] px-1 py-0.5">
              POST /api/internal/compliance-check
            </code>{" "}
            with header <code className="rp-mono rounded bg-[var(--muted)] px-1 py-0.5">x-compliance-secret</code>.
          </p>
        </Card>

        <Card title="Recent runs" description="Latest 20 compliance checks." flush>
          {runs.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted-fg)]">No compliance runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Summary</th>
                    <th className="text-right">Stale</th>
                    <th className="text-right">Never imported</th>
                    <th className="text-right">Mismatch</th>
                    <th className="text-right">Review</th>
                    <th className="text-right">Max age</th>
                    <th className="text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            tone={
                              r.status === "OK"
                                ? "success"
                                : r.status === "ERROR"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {r.status}
                          </Badge>
                          <Badge tone="neutral">{r.trigger}</Badge>
                          {r.notified && <Badge tone="info">Emailed</Badge>}
                        </div>
                      </td>
                      <td>
                        <p>{r.summary}</p>
                        {r.notifyError && (
                          <p className="mt-1 text-xs text-[var(--danger)]">
                            Email error: {r.notifyError}
                          </p>
                        )}
                      </td>
                      <td className="rp-mono text-right">{r.staleDeviceCount}</td>
                      <td className="rp-mono text-right">{r.neverImportedCount}</td>
                      <td className="rp-mono text-right">{r.mismatchCount}</td>
                      <td className="rp-mono text-right">{r.needsReviewCount}</td>
                      <td className="rp-mono text-right">{r.maxEvidenceAgeDays}d</td>
                      <td className="whitespace-nowrap text-right text-xs text-[var(--muted-fg)]">
                        {r.createdAt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
