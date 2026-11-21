import { Lock, Webhook } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { revokeWebhookEndpoint } from "@/app/actions/webhooks";
import { ProjectPageHeader } from "@/components/project-page-header";
import { NetBoxPanel } from "@/components/netbox-panel";
import { WebhookCreateForm } from "@/components/webhook-create-form";
import { GitOpsPanel } from "@/components/gitops-panel";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

export default async function ProjectIntegrationsPage({
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

  const [netbox, jobs, endpoints] = await Promise.all([
    prisma.integrationConfig.findUnique({
      where: { projectId_kind: { projectId, kind: "NETBOX" } },
      select: { baseUrl: true, enabled: true, writeEnabled: true },
    }),
    prisma.syncJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.webhookEndpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        enabled: true,
        revokedAt: true,
        lastDeliveryAt: true,
        lastStatus: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Integrations"
        title="Integrations"
        description="NetBox dry-run, apply-to-plan, optional NetBox writes, outbound webhooks, and GitOps."
      />

      <Card
        title="NetBox"
        description="Dry-run preview, apply mappable cables to a RackPatch plan, optional PATCH writes when enabled."
        className="mb-6"
      >
        <NetBoxPanel
          projectId={projectId}
          config={netbox}
          canManage={access.canManageProject}
          canPreview={access.canPublishPlan}
        />
        {jobs.length > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
              Recent dry-runs
            </p>
            <ul className="space-y-1 text-xs text-[var(--muted-fg)]">
              {jobs.map((j) => (
                <li key={j.id}>
                  {j.createdAt.toLocaleString()} - {j.source} - {j.status}
                  {j.dryRun ? " (dry-run)" : ""}
                  {j.error ? ` - ${j.error}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card
        title="Outbound webhooks"
        description="Signed HTTP callbacks for project events."
        className="mb-6"
      >
        <p className="mb-3 text-sm text-[var(--muted-fg)]">
          Best-effort, single attempt, 5s timeout, HMAC-SHA256 signed (
          <code>X-RackPatch-Signature = sha256=HMAC(secret, timestamp + &quot;.&quot; + body)</code>
          ). Endpoints auto-disable after 10 consecutive failures. https only; private ranges are
          blocked.
        </p>
        {access.canManageProject && (
          <div className="mb-4">
            <WebhookCreateForm projectId={projectId} />
          </div>
        )}
        {endpoints.length === 0 ? (
          <EmptyState
            icon={<Webhook className="h-5 w-5" aria-hidden />}
            title="No webhook endpoints"
            description="Add an https endpoint above to receive project events."
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Last delivery</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => {
                  const host = (() => {
                    try {
                      return new URL(ep.url).host;
                    } catch {
                      return ep.url;
                    }
                  })();
                  return (
                    <tr key={ep.id}>
                      <td className="rp-mono font-medium">{host}</td>
                      <td>
                        {ep.revokedAt ? (
                          <Badge tone="danger">revoked</Badge>
                        ) : ep.enabled ? (
                          <Badge tone="success">active</Badge>
                        ) : (
                          <Badge tone="warning">auto-disabled</Badge>
                        )}
                      </td>
                      <td className="text-xs text-[var(--muted-fg)]">{ep.events.join(", ")}</td>
                      <td className="text-xs text-[var(--muted-fg)]">
                        {ep.lastDeliveryAt
                          ? `${ep.lastStatus ?? "?"} · ${ep.lastDeliveryAt.toLocaleString()}`
                          : "No deliveries yet"}
                      </td>
                      <td className="text-right">
                        {access.canManageProject && !ep.revokedAt && (
                          <form
                            action={async () => {
                              "use server";
                              await revokeWebhookEndpoint({ projectId, endpointId: ep.id });
                            }}
                          >
                            <Button type="submit" size="sm" variant="secondary">
                              Revoke
                            </Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="GitOps (plan as code)" description="Export the active plan as YAML/JSON or import one back.">
        <GitOpsPanel
          projectId={projectId}
          canExport={access.canExport}
          canImport={access.canPublishPlan}
          hasPlan={Boolean(access.project.activeRevisionId)}
        />
      </Card>
    </div>
  );
}
