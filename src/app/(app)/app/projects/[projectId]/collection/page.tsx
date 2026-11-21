import { Lock, Server } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import {
  createCollectionTarget,
  createDeviceCredential,
  listCollectionProfiles,
} from "@/app/actions/collection";
import { CollectionRunForm } from "@/components/collection-run-form";
import { JobStatusBadge } from "@/components/job-status-badge";
import { ProjectPageHeader } from "@/components/project-page-header";
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatCard,
} from "@/components/ui";

export default async function CollectionPage({
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

  const [credentials, targets, jobs] = await Promise.all([
    prisma.deviceCredential.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, authKind: true },
    }),
    prisma.collectionTarget.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: { credential: { select: { name: true } } },
    }),
    prisma.collectionJob.findMany({
      where: { projectId, kind: "ssh" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const profiles = await listCollectionProfiles();

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Collect"
        title="SSH collection"
        description="Allowlisted neighbor show-commands only. Credentials encrypted at rest."
      />

      {!access.canImportEvidence ? (
        <EmptyState
          icon={<Lock className="h-5 w-5" aria-hidden />}
          title="Not allowed"
          description="Lead role required to manage collection."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Credentials" value={credentials.length} tone="info" />
            <StatCard
              label="Targets"
              value={targets.length}
              icon={<Server className="h-5 w-5" aria-hidden />}
              tone="info"
            />
            <StatCard label="Recent SSH jobs" value={jobs.length} tone="neutral" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Add credential" description="Secrets are encrypted and never shown again.">
              <form
                action={async (fd) => {
                  "use server";
                  await createDeviceCredential({
                    projectId,
                    name: String(fd.get("name") || ""),
                    username: String(fd.get("username") || ""),
                    secret: String(fd.get("secret") || ""),
                    authKind: String(fd.get("authKind") || "password") as "password" | "privateKey",
                  });
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <Input name="name" required placeholder="Credential name" />
                <Input name="username" required placeholder="SSH username" />
                <Select name="authKind" defaultValue="password">
                  <option value="password">Password</option>
                  <option value="privateKey">Private key (PEM)</option>
                </Select>
                <Input
                  name="secret"
                  required
                  type="password"
                  placeholder="Secret (not shown again)"
                />
                <Button type="submit" className="sm:col-span-2">
                  Save encrypted credential
                </Button>
              </form>
            </Card>

            <Card title="Add target" description="A device plus the credential and command profile to use.">
              {credentials.length === 0 ? (
                <AlertBanner tone="info">Add a credential first.</AlertBanner>
              ) : (
                <form
                  action={async (fd) => {
                    "use server";
                    await createCollectionTarget({
                      projectId,
                      name: String(fd.get("name") || ""),
                      host: String(fd.get("host") || ""),
                      port: Number(fd.get("port") || 22),
                      credentialId: String(fd.get("credentialId") || ""),
                      profileId: String(fd.get("profileId") || ""),
                    });
                  }}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <Input name="name" required placeholder="Device name (source device)" />
                  <Input name="host" required placeholder="Hostname or IP" />
                  <Input name="port" type="number" defaultValue={22} />
                  <Select name="credentialId" required defaultValue={credentials[0]?.id}>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.username})
                      </option>
                    ))}
                  </Select>
                  <Select
                    name="profileId"
                    required
                    defaultValue={profiles[0]?.id}
                    className="sm:col-span-2"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} — {p.command}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" className="sm:col-span-2">
                    Add target
                  </Button>
                </form>
              )}
            </Card>
          </div>

          <Card title="Targets" description="Run a collection against a single device." flush>
            {targets.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Server className="h-5 w-5" aria-hidden />}
                  title="No targets"
                  description="Add a device to collect from."
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {targets.map((t) => (
                  <li key={t.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="rp-mono font-semibold">{t.name}</p>
                        <p className="mt-0.5 text-sm text-[var(--muted-fg)]">
                          <span className="rp-mono">
                            {t.host}:{t.port}
                          </span>{" "}
                          · {t.profileId} · cred {t.credential.name}
                        </p>
                      </div>
                      {t.hostKeyFingerprint ? (
                        <Badge tone="success">
                          Pinned <span className="rp-mono">{t.hostKeyFingerprint.slice(0, 12)}…</span>
                        </Badge>
                      ) : (
                        <Badge tone="warning">Host key not pinned</Badge>
                      )}
                    </div>
                    <CollectionRunForm projectId={projectId} targetId={t.id} targetName={t.name} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent SSH jobs" description="Latest 20 runs." flush>
            {jobs.length === 0 ? (
              <p className="p-5 text-sm text-[var(--muted-fg)]">No SSH jobs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="rp-table rp-table-auto">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Detail</th>
                      <th className="text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td className="rp-mono font-medium">{j.sourceDevice}</td>
                        <td>
                          <JobStatusBadge status={j.status} />
                        </td>
                        <td className="text-xs text-[var(--danger)]">{j.error ?? ""}</td>
                        <td className="whitespace-nowrap text-right text-xs text-[var(--muted-fg)]">
                          {j.createdAt.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
