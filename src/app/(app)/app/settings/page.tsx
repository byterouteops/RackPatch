import Link from "next/link";
import { Building2 } from "lucide-react";
import { userHasPlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl, isHostedSaas } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { Badge, Button, Card, DetailItem, EmptyState, PageHeader } from "@/components/ui";
import packageJson from "../../../../../package.json";

export const dynamic = "force-dynamic";

const ENDPOINTS: Array<{ path: string; description: string }> = [
  { path: "/api/health", description: "Liveness check (JSON). Returns 503 if the database is unreachable." },
  { path: "/api/ready", description: "Readiness check (JSON) used by orchestrators." },
];

export default async function SettingsPage() {
  const user = await requireSessionUser();
  const [memberships, platformAdmin] = await Promise.all([
    prisma.workspaceMembership.findMany({
      where: { userId: user.id },
      include: {
        workspace: { include: { _count: { select: { projects: true, sites: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    userHasPlatformAdmin(user),
  ]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Account, workspaces and deployment details. This page is read-only — configuration lives in environment variables and nothing is stored here."
        breadcrumb="Administration"
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card title="Workspaces" description="Workspaces you belong to." flush>
            {memberships.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Building2 className="h-5 w-5" aria-hidden />}
                  title="No workspaces yet"
                  description="Create a workspace from the dashboard to start organising projects."
                  action={
                    <Button href="/app" size="sm">
                      Go to dashboard
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>Workspace</th>
                      <th>Role</th>
                      <th className="text-right">Projects</th>
                      <th className="text-right">Sites</th>
                      <th className="text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberships.map((m) => (
                      <tr key={m.id}>
                        <td className="font-medium">{m.workspace.name}</td>
                        <td>
                          <Badge tone="info">{m.role}</Badge>
                        </td>
                        <td className="rp-mono text-right">{m.workspace._count.projects}</td>
                        <td className="rp-mono text-right">{m.workspace._count.sites}</td>
                        <td className="whitespace-nowrap text-right">
                          <Link
                            href={`/app/workspaces/${m.workspaceId}/sites`}
                            className="rp-focus text-sm font-semibold text-[var(--accent)] hover:underline"
                          >
                            Sites
                          </Link>
                          <span className="mx-2 text-[var(--border)]" aria-hidden>
                            |
                          </span>
                          <Link
                            href={`/app/workspaces/${m.workspaceId}/team`}
                            className="rp-focus text-sm font-semibold text-[var(--accent)] hover:underline"
                          >
                            Team
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Service endpoints" description="Plain operational endpoints exposed by this instance." flush>
            <ul className="divide-y divide-[var(--border)]">
              {ENDPOINTS.map((e) => (
                <li key={e.path} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <code className="rp-mono text-sm font-semibold">GET {e.path}</code>
                    <p className="mt-0.5 text-xs text-[var(--muted-fg)]">{e.description}</p>
                  </div>
                  <a
                    href={e.path}
                    target="_blank"
                    rel="noreferrer"
                    className="rp-focus text-sm font-semibold text-[var(--accent)] hover:underline"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card title="Account">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Name">{user.name || "—"}</DetailItem>
              <DetailItem label="Email">{user.email}</DetailItem>
              <DetailItem label="Platform admin">
                {platformAdmin ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}
              </DetailItem>
            </dl>
            {platformAdmin && (
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <Link
                  href="/app/admin"
                  className="rp-focus text-sm font-semibold text-[var(--accent)] hover:underline"
                >
                  Open platform administration →
                </Link>
              </div>
            )}
          </Card>

          <Card title="Deployment" description="Read from this server's environment.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Version" mono>
                {packageJson.version}
              </DetailItem>
              <DetailItem label="License">Apache 2.0</DetailItem>
              <DetailItem label="Hosted SaaS mode">
                {isHostedSaas() ? (
                  <Badge tone="warning">On</Badge>
                ) : (
                  <Badge tone="neutral">Off (self-host)</Badge>
                )}
              </DetailItem>
              <DetailItem label="Email (Resend)">
                {process.env.RESEND_API_KEY ? (
                  <Badge tone="success">Configured</Badge>
                ) : (
                  <Badge tone="neutral">Not configured</Badge>
                )}
              </DetailItem>
              <div className="sm:col-span-2">
                <DetailItem label="App URL" mono>
                  {getAppUrl()}
                </DetailItem>
              </div>
            </dl>
          </Card>

          <Card title="More">
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/app/help" className="font-semibold text-[var(--accent)] hover:underline">
                  Help &amp; docs
                </Link>
              </li>
              <li>
                <Link href="/about" className="font-semibold text-[var(--accent)] hover:underline">
                  About RackPatch
                </Link>
              </li>
              <li>
                <Link href="/demo" className="font-semibold text-[var(--accent)] hover:underline">
                  Interactive demo
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
