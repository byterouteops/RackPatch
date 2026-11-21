import { KeyRound, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { revokeApiToken } from "@/app/actions/api-tokens";
import { ProjectPageHeader } from "@/components/project-page-header";
import { ApiTokenCreateForm } from "@/components/api-token-create-form";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

export default async function ProjectApiPage({
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

  const tokens = await prisma.apiToken.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="API"
        title="API"
        description="Read-only REST for this project. NetBox dry-run, webhooks and GitOps live under Integrations."
      />

      <Card title="Endpoints" description="Read-only, JSON (GitOps also supports YAML)." className="mb-6">
        <ul className="space-y-2">
          {[
            `/api/v1/projects/${projectId}/summary`,
            `/api/v1/projects/${projectId}/cables`,
            `/api/v1/projects/${projectId}/gitops?format=yaml|json`,
          ].map((path) => (
            <li
              key={path}
              className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2"
            >
              <Badge tone="info">GET</Badge>
              <code className="rp-mono break-all text-xs sm:text-sm">{path}</code>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--muted-fg)]">
          Auth: session cookie while signed in, or{" "}
          <code className="rp-mono rounded bg-[var(--muted)] px-1 py-0.5">
            Authorization: Bearer rp_live_…
          </code>
        </p>
      </Card>

      {access.canManageProject && (
        <Card title="Create token" description="The token value is shown once at creation." className="mb-6">
          <ApiTokenCreateForm projectId={projectId} />
        </Card>
      )}

      <Card title="Tokens" description="Project-scoped, read-only access tokens." flush>
        {tokens.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<KeyRound className="h-5 w-5" aria-hidden />}
              title="No tokens"
              description="Create a token to call the API from scripts."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}</td>
                    <td className="rp-mono text-xs text-[var(--muted-fg)]">{t.tokenPrefix}…</td>
                    <td>
                      {t.revokedAt ? (
                        <Badge tone="danger">Revoked</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </td>
                    <td className="text-xs text-[var(--muted-fg)]">
                      {t.createdAt.toLocaleDateString()}
                    </td>
                    <td className="text-xs text-[var(--muted-fg)]">
                      {t.lastUsedAt ? t.lastUsedAt.toLocaleDateString() : "Never"}
                    </td>
                    <td className="text-right">
                      {access.canManageProject && !t.revokedAt && (
                        <form
                          action={async () => {
                            "use server";
                            await revokeApiToken({ projectId, tokenId: t.id });
                          }}
                        >
                          <Button type="submit" size="sm" variant="secondary">
                            Revoke
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
