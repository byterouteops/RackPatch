import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Info,
  KeyRound,
  ListChecks,
  Lock,
  Network,
  Plus,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { COLLECTION_PROFILES } from "@/lib/collection/commands";
import { createCollectionTarget, createDeviceCredential, listCollectionProfiles } from "@/app/actions/collection";
import { Panel } from "@/components/charts";
import { CollectionRunForm } from "@/components/collection-run-form";
import { JobStatusBadge } from "@/components/job-status-badge";
import { ProjectPageHeader } from "@/components/project-page-header";
import { AlertBanner, Badge, Button, EmptyState, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

function duration(a: Date | null, b: Date | null) {
  if (!a || !b) return "\u2014";
  const s = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ target?: string; job?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const header = (
    <ProjectPageHeader
      projectId={projectId}
      projectName={access.project.name}
      section="Collect"
      title="Secure SSH Collection & Credential Management"
      description="Read-only device access with allowlisted show-commands, pinned host keys, and encrypted credentials."
    />
  );
  if (!access.canImportEvidence) {
    return (
      <div>
        {header}
        <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Not allowed" description="Lead role required to manage collection." />
      </div>
    );
  }

  const rev = access.project.activeRevisionId;
  const [credentials, targets, jobs, links] = await Promise.all([
    prisma.deviceCredential.findMany({ where: { projectId }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true, authKind: true, createdAt: true, _count: { select: { targets: true } } } }),
    prisma.collectionTarget.findMany({ where: { projectId }, orderBy: { name: "asc" }, include: { credential: { select: { name: true } } } }),
    prisma.collectionJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10 }),
    rev ? prisma.plannedLink.findMany({ where: { revisionId: rev }, select: { aDevice: true, zDevice: true } }) : Promise.resolve([]),
  ]);
  const profiles = await listCollectionProfiles();
  const importIds = jobs.map((j) => j.evidenceImportId).filter((x): x is string => Boolean(x));
  const [jobImports, observedDevices, neighborCount, interfaceRows] = await Promise.all([
    importIds.length ? prisma.evidenceImport.findMany({ where: { id: { in: importIds } }, select: { id: true, parseWarnings: true, _count: { select: { observations: true } } } }) : Promise.resolve([]),
    prisma.evidenceImport.findMany({ where: { projectId, parseFailed: false }, select: { sourceDeviceNorm: true }, distinct: ["sourceDeviceNorm"] }),
    prisma.observation.count({ where: { evidenceImport: { projectId } } }),
    prisma.observation.findMany({ where: { evidenceImport: { projectId } }, select: { localInterfaceNorm: true, evidenceImport: { select: { sourceDeviceNorm: true } } }, distinct: ["evidenceImportId", "localInterfaceNorm"] }),
  ]);
  const importById = new Map(jobImports.map((i) => [i.id, i]));
  const plannedDevices = new Set(links.flatMap((l) => [l.aDevice, l.zDevice]));
  const interfaces = new Set(interfaceRows.map((r) => `${r.evidenceImport.sourceDeviceNorm}|${r.localInterfaceNorm}`)).size;
  const lastJob = jobs[0];
  const job = jobs.find((j) => j.id === sp.job) ?? lastJob;
  const target = targets.find((t) => t.id === sp.target) ?? targets[0];
  const pinned = targets.filter((t) => t.hostKeyFingerprint).length;
  const keyConfigured = Boolean(process.env.FIELD_SECRETS_KEY?.trim());
  const base = `/app/projects/${projectId}/collection`;

  const log = job
    ? [
        { at: job.createdAt, level: "INFO", text: `Job created (${job.kind === "ssh" ? "SSH collection" : "manual paste"}) for ${job.sourceDevice}` },
        job.startedAt && { at: job.startedAt, level: "INFO", text: "Connecting with pinned host key and read-only profile" },
        job.evidenceImportId && importById.get(job.evidenceImportId) && { at: job.finishedAt ?? job.createdAt, level: "INFO", text: `Parsed ${importById.get(job.evidenceImportId)!._count.observations} neighbor(s)` },
        ...(job.evidenceImportId ? (importById.get(job.evidenceImportId)?.parseWarnings ?? []).slice(0, 3).map((w) => ({ at: job.finishedAt ?? job.createdAt, level: "WARN", text: w })) : []),
        job.error && { at: job.finishedAt ?? job.createdAt, level: "ERROR", text: job.error },
        job.finishedAt && { at: job.finishedAt, level: job.status === "COMPLETED" ? "INFO" : "ERROR", text: `Job ${job.status.toLowerCase()} in ${duration(job.startedAt ?? job.createdAt, job.finishedAt)}` },
      ].filter((x): x is { at: Date; level: string; text: string } => Boolean(x))
    : [];

  return (
    <div>
      {header}

      <section className="rp-card mb-4 grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Collection summary">
        <div>
          <p className="rp-display text-[17px] font-bold">{access.project.name}</p>
          <p className="text-xs text-[var(--muted-fg)]">Site: {access.project.site}</p>
        </div>
        <Fact icon={CheckCircle2} label="Last job" value={lastJob ? <JobStatusBadge status={lastJob.status} /> : "None yet"} />
        <Fact icon={Server} label="Targets / planned devices" value={`${targets.length} / ${plannedDevices.size}`} />
        <Fact icon={Clock} label="Last run" value={lastJob ? fmt(lastJob.createdAt) : "\u2014"} />
        <Fact icon={ShieldCheck} label="Access mode" value={<span className="font-bold text-[var(--success-ink)]">Read-only</span>} />
      </section>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={`Credential Profiles (${credentials.length})`} icon={KeyRound} flush action={<Link href="#add-credential" className="text-xs font-semibold text-[var(--accent-ink)]">+ Add profile</Link>}>
          {credentials.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No credentials yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Profile</th>
                  <th className="px-2 py-2">Username</th>
                  <th className="px-2 py-2">Auth</th>
                  <th className="px-2 py-2 text-right">Targets</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2 font-semibold">{c.name}</td>
                    <td className="rp-mono px-2 py-2 text-xs">{c.username}</td>
                    <td className="px-2 py-2 text-xs">SSH ({c.authKind === "privateKey" ? "Key" : "Password"})</td>
                    <td className="rp-mono px-2 py-2 text-right">{c._count.targets}</td>
                    <td className="px-4 py-2">{c._count.targets ? <Badge tone="success">In use</Badge> : <Badge tone="neutral">Unused</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Allowed Commands (Read-only)" icon={Terminal}>
          <ul className="space-y-1.5">
            {Array.from(new Set(Object.values(COLLECTION_PROFILES).map((p) => p.command))).map((cmd) => (
              <li key={cmd} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden />
                <code className="rp-mono rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs">{cmd}</code>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted-fg)]">
            Profiles: {Object.values(COLLECTION_PROFILES).map((p) => p.label).join(", ")}. Arbitrary CLI is rejected.
          </p>
        </Panel>

        <Panel title="SSH Security & Host-Key Pinning" icon={ShieldCheck}>
          <dl className="space-y-2 text-[13px]">
            {[
              ["Host-key pinning", <Badge key="p" tone="success">Enforced</Badge>],
              ["Unknown host key", "Reject until accepted"],
              ["Pinned targets", `${pinned} / ${targets.length}`],
              ["Credential encryption", "AES-256-GCM at rest"],
              ["Encryption key", keyConfigured ? <Badge key="k" tone="success">FIELD_SECRETS_KEY set</Badge> : <Badge key="k" tone="warning">Falls back to auth secret</Badge>],
              ["Access scope", "Read-only show commands"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" aria-hidden />
                  {k}
                </dt>
                <dd className="text-right text-xs font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title={`Collection Targets (${targets.length})`} icon={Server} flush>
            {targets.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Server className="h-5 w-5" aria-hidden />} title="No targets" description="Add a device below to collect from." />
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Device</th>
                    <th className="px-2 py-2">Host</th>
                    <th className="px-2 py-2">Profile</th>
                    <th className="px-4 py-2">Host key</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.id} className={cn("border-b border-[var(--border)] last:border-0", target?.id === t.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2">
                        <Link href={`${base}?target=${t.id}`} scroll={false} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="rp-mono px-2 py-2 text-xs">
                        {t.host}:{t.port}
                      </td>
                      <td className="px-2 py-2 text-xs">{COLLECTION_PROFILES[t.profileId as keyof typeof COLLECTION_PROFILES]?.label ?? t.profileId}</td>
                      <td className="px-4 py-2">{t.hostKeyFingerprint ? <Badge tone="success">Pinned</Badge> : <Badge tone="warning">Not pinned</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {target && (
              <div className="border-t border-[var(--border)] p-4">
                <p className="mb-2 text-xs text-[var(--muted-fg)]">
                  Run <span className="rp-mono font-semibold text-[var(--foreground)]">{target.name}</span> with credential {target.credential.name}
                  {target.hostKeyFingerprint ? (
                    <>
                      {" "}
                      {"\u00b7"} key <span className="rp-mono">{target.hostKeyFingerprint.slice(0, 16)}{"\u2026"}</span>
                    </>
                  ) : null}
                </p>
                <CollectionRunForm projectId={projectId} targetId={target.id} targetName={target.name} />
              </div>
            )}
          </Panel>

          <Panel title="Collection Jobs (Recent)" icon={ListChecks} flush>
            {jobs.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">No collection jobs yet.</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Device</th>
                    <th className="px-2 py-2">Kind</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Started</th>
                    <th className="px-4 py-2 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={cn("border-b border-[var(--border)] last:border-0", job?.id === j.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2">
                        <Link href={`${base}?job=${j.id}${sp.target ? `&target=${sp.target}` : ""}`} scroll={false} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                          {j.sourceDevice}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs">{j.kind === "ssh" ? "SSH" : "Manual paste"}</td>
                      <td className="px-2 py-2">
                        <JobStatusBadge status={j.status} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs">{fmt(j.createdAt)}</td>
                      <td className="px-4 py-2 text-right text-xs">{duration(j.startedAt ?? j.createdAt, j.finishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title={job ? `Collection Log \u2014 ${job.sourceDevice}` : "Collection Log"} icon={ClipboardList}>
            {log.length === 0 ? (
              <p className="text-sm text-[var(--muted-fg)]">Run a collection to see its log.</p>
            ) : (
              <pre className="rp-mono overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed">
                {log.map((l, i) => (
                  <div key={i}>
                    <span className="text-slate-400">{fmt(l.at)}</span>{" "}
                    <span className={l.level === "ERROR" ? "text-red-400" : l.level === "WARN" ? "text-amber-300" : "text-sky-300"}>{l.level.padEnd(5)}</span>{" "}
                    <span className="text-slate-100">{l.text}</span>
                  </div>
                ))}
              </pre>
            )}
          </Panel>

          <Panel title="Device Collection Results" icon={Network}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Planned devices", plannedDevices.size],
                ["With evidence", observedDevices.length],
                ["Neighbors", neighborCount],
                ["Interfaces", interfaces],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg border border-[var(--border)] p-2.5 text-center">
                  <p className="rp-display text-xl font-bold">{Number(v).toLocaleString("en-US")}</p>
                  <p className="text-[11px] text-[var(--muted-fg)]">{k}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Important Notes" icon={Info}>
            <ul className="list-disc space-y-1 pl-5 text-[13px]">
              <li>Collection uses SSH with read-only show commands only.</li>
              <li>No worker fleet or built-in scheduler; runs are started from this page.</li>
              <li>
                No SSH access? Paste CLI output on{" "}
                <Link href={`/app/projects/${projectId}/lldp#import`} className="font-semibold text-[var(--accent-ink)]">
                  LLDP / CDP import
                </Link>
                .
              </li>
              <li>Devices must allow management access from the RackPatch server.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Add Credential Profile" icon={Plus} className="scroll-mt-24">
          <form
            id="add-credential"
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
            <Input name="name" required placeholder="Profile name (e.g. Leaf_RO)" />
            <Input name="username" required placeholder="SSH username" />
            <Select name="authKind" aria-label="Authentication method" defaultValue="password">
              <option value="password">Password</option>
              <option value="privateKey">Private key (PEM)</option>
            </Select>
            <Input name="secret" required type="password" placeholder="Secret (not shown again)" />
            <Button type="submit" className="sm:col-span-2">
              Save encrypted credential
            </Button>
          </form>
        </Panel>

        <Panel title="Add Collection Target" icon={Server}>
          {credentials.length === 0 ? (
            <AlertBanner tone="info">Add a credential profile first.</AlertBanner>
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
              <Select name="profileId" required defaultValue={profiles[0]?.id} className="sm:col-span-2">
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {"\u2014"} {p.command}
                  </option>
                ))}
              </Select>
              <Button type="submit" className="sm:col-span-2">
                Add target
              </Button>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-6 w-6 text-[var(--accent-ink)]" aria-hidden />
      <div>
        <p className="text-xs text-[var(--muted-fg)]">{label}</p>
        <div className="text-[13px] font-semibold">{value}</div>
      </div>
    </div>
  );
}
