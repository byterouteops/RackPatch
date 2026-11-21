import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, Eye, GitBranch, History, KeyRound, Lock, Mail, Network, Plug, Server, Terminal, Webhook, XCircle } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { revokeWebhookEndpoint } from "@/app/actions/webhooks";
import { Panel } from "@/components/charts";
import { ProjectPageHeader } from "@/components/project-page-header";
import { NetBoxPanel } from "@/components/netbox-panel";
import { WebhookCreateForm } from "@/components/webhook-create-form";
import { GitOpsPanel } from "@/components/gitops-panel";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

function parseSummary(s: string | null): Record<string, number> {
  if (!s) return {};
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export default async function ProjectIntegrationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }

  const [netbox, jobs, endpoints, tokens, targets, gitopsEvents, revision] = await Promise.all([
    prisma.integrationConfig.findUnique({ where: { projectId_kind: { projectId, kind: "NETBOX" } }, select: { baseUrl: true, enabled: true, writeEnabled: true } }),
    prisma.syncJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.webhookEndpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, events: true, enabled: true, revokedAt: true, lastDeliveryAt: true, lastStatus: true, consecutiveFailures: true, createdAt: true },
    }),
    prisma.apiToken.count({ where: { projectId, revokedAt: null } }),
    prisma.collectionTarget.count({ where: { projectId } }),
    prisma.auditEvent.findMany({ where: { projectId, action: { startsWith: "gitops." } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, summary: true, createdAt: true } }),
    access.project.activeRevisionId ? prisma.planRevision.findUnique({ where: { id: access.project.activeRevisionId }, select: { revisionNumber: true, _count: { select: { links: true } } } }) : Promise.resolve(null),
  ]);

  const activeHooks = endpoints.filter((e) => !e.revokedAt && e.enabled);
  const failingHooks = endpoints.filter((e) => !e.revokedAt && (e.consecutiveFailures > 0 || !e.enabled));
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED").length;
  const lastPreview = jobs.find((j) => j.dryRun && j.status === "COMPLETED");
  const preview = parseSummary(lastPreview?.summary ?? null);
  const emailOn = Boolean(process.env.RESEND_API_KEY);
  const base = `/app/projects/${projectId}`;

  const connectors = [
    { name: "NetBox", sub: "DCIM / IPAM", icon: Network, ok: Boolean(netbox?.enabled), state: netbox ? (netbox.enabled ? "Connected" : "Disabled") : "Not configured", href: "#netbox" },
    { name: "Webhooks", sub: "Outbound events", icon: Webhook, ok: activeHooks.length > 0, state: `${activeHooks.length} active`, href: "#webhooks" },
    { name: "GitOps", sub: "Plan as code", icon: GitBranch, ok: Boolean(revision), state: revision ? `Plan r${revision.revisionNumber}` : "No plan", href: "#gitops" },
    { name: "REST API", sub: "Read-only tokens", icon: KeyRound, ok: tokens > 0, state: `${tokens} token(s)`, href: `${base}/api` },
    { name: "SSH Collection", sub: "LLDP / CDP", icon: Terminal, ok: targets > 0, state: `${targets} target(s)`, href: `${base}/collection` },
    { name: "Email", sub: "Resend alerts", icon: Mail, ok: emailOn, state: emailOn ? "Configured" : "Not configured", href: `${base}/compliance` },
  ];
  const health = [
    { label: "NetBox connection saved and enabled", ok: Boolean(netbox?.enabled) },
    { label: "Last NetBox job succeeded", ok: jobs[0] ? jobs[0].status === "COMPLETED" : false, na: !jobs[0] },
    { label: "No failing webhook endpoints", ok: failingHooks.length === 0 },
    { label: "Active plan available for GitOps", ok: Boolean(revision) },
    { label: "Email delivery configured", ok: emailOn },
  ];
  const healthy = health.filter((h) => h.ok).length;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Integrations"
        title="NetBox Integration & GitOps"
        description="NetBox dry-run and apply-to-plan, optional NetBox writes, signed outbound webhooks, and cable plans as code."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="NetBox" value={netbox ? (netbox.enabled ? "Connected" : "Disabled") : "Not set"} icon={<Network aria-hidden />} tone={netbox?.enabled ? "success" : "neutral"} />
        <StatCard label="Sync Jobs" value={`${completedJobs} / ${jobs.length}`} icon={<Activity aria-hidden />} tone="info" />
        <StatCard label="Devices (last preview)" value={preview.devices ?? 0} icon={<Server aria-hidden />} tone="neutral" />
        <StatCard label="Cables (last preview)" value={preview.cables ?? 0} icon={<Plug aria-hidden />} tone="neutral" />
        <StatCard label="Webhooks Active" value={activeHooks.length} icon={<Webhook aria-hidden />} tone={failingHooks.length ? "warning" : "success"} />
        <StatCard label="Plan Revision" value={revision ? `r${revision.revisionNumber}` : "\u2014"} icon={<GitBranch aria-hidden />} tone="neutral" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {connectors.map((c) => (
          <Link key={c.name} href={c.href} className="rp-card flex items-center gap-3 p-3 hover:border-[var(--accent)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <c.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold">{c.name}</span>
              <span className="block text-[11px] text-[var(--muted-fg)]">{c.sub}</span>
              <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold", c.ok ? "text-[var(--success)]" : "text-[var(--muted-fg)]")}>
                {c.ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
                {c.state}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Integration Architecture" icon={Network}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-xs">
            <div className="rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-2.5 font-bold">
              RackPatch
              <span className="block font-normal text-[var(--muted-fg)]">Cabling &amp; verification</span>
            </div>
            <div className="space-y-1">
              <span className="block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">REST read {"\u2190"}</span>
              <span className="block rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                Label writes {"\u2192"} {netbox?.writeEnabled ? "(on)" : "(off)"}
              </span>
            </div>
            <div className="rounded-lg border-2 border-sky-300 bg-sky-50 p-2.5 font-bold">
              NetBox
              <span className="block font-normal text-[var(--muted-fg)]">DCIM / IPAM</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
            {["Plan YAML", "Commit / PR", "CI validate", "GitOps import"].map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="h-3 w-3 text-[var(--muted-fg)]" aria-hidden />}
                <span className="rounded border border-[var(--border)] px-1.5 py-0.5">{s}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--muted-fg)]">Git hosting and CI run in your own tooling; RackPatch exports and imports the plan file.</p>
        </Panel>

        <Panel title="Sync Preview (Last Dry Run)" icon={Eye}>
          {!lastPreview ? (
            <p className="text-sm text-[var(--muted-fg)]">No NetBox dry-run yet. Run a preview below.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <p className="text-xl font-bold text-emerald-700">{preview.cablesNew ?? 0}</p>
                  <p className="text-[11px]">New to plan</p>
                </div>
                <div className="rounded-lg bg-sky-50 p-2">
                  <p className="text-xl font-bold text-sky-700">{preview.cablesAlreadyInPlan ?? 0}</p>
                  <p className="text-[11px]">Already in plan</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2">
                  <p className="text-xl font-bold text-red-700">{preview.cablesSkipped ?? 0}</p>
                  <p className="text-[11px]">Skipped</p>
                </div>
              </div>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-[var(--muted-fg)]">Devices matched (plan / alias)</dt>
                <dd className="font-semibold">
                  {preview.devicesMatchedPlan ?? 0} / {preview.devicesMatchedAlias ?? 0}
                </dd>
                <dt className="text-[var(--muted-fg)]">Devices unmatched</dt>
                <dd className="font-semibold">{preview.devicesUnmatched ?? 0}</dd>
                <dt className="text-[var(--muted-fg)]">Errors / warnings</dt>
                <dd className="font-semibold">
                  {preview.errors ?? 0} / {preview.warnings ?? 0}
                </dd>
                <dt className="text-[var(--muted-fg)]">Previewed</dt>
                <dd className="text-xs">{lastPreview.createdAt.toLocaleString("en-US")}</dd>
              </dl>
            </>
          )}
        </Panel>

        <Panel title="Integration Health" icon={Activity} action={<Badge tone={healthy === health.length ? "success" : "warning"}>{healthy}/{health.length} checks</Badge>}>
          <ul className="space-y-2 text-[13px]">
            {health.map((h) => (
              <li key={h.label} className="flex items-center gap-2">
                {h.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />}
                <span className={h.ok ? "" : "text-[var(--muted-fg)]"}>
                  {h.label}
                  {"na" in h && h.na ? " (no jobs yet)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Integration History" icon={History} flush>
          {jobs.length === 0 && gitopsEvents.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No integration activity yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">When</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Details</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const s = parseSummary(j.summary);
                  return (
                    <tr key={j.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-xs">{j.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-2 py-2 text-xs">
                        {j.source === "netbox_fixture" ? "NetBox (fixture)" : "NetBox"} {j.dryRun ? "dry-run" : "apply/write"}
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-2 text-xs">{j.error ?? (Object.keys(s).length ? Object.entries(s).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ") : "\u2014")}</td>
                      <td className="px-4 py-2">
                        <Badge tone={j.status === "COMPLETED" ? "success" : j.status === "FAILED" ? "danger" : "warning"}>{j.status.toLowerCase()}</Badge>
                      </td>
                    </tr>
                  );
                })}
                {gitopsEvents.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs">{e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-2 py-2 text-xs">GitOps</td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-xs">{e.summary}</td>
                    <td className="px-4 py-2">
                      <Badge tone="success">done</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="NetBox Connection" icon={Network} className="scroll-mt-24">
          <div id="netbox" />
          <NetBoxPanel projectId={projectId} config={netbox} canManage={access.canManageProject} canPreview={access.canPublishPlan} />
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title={`Outbound Webhooks (${endpoints.length})`} icon={Webhook} className="scroll-mt-24">
          <div id="webhooks" />
          <p className="mb-3 text-xs text-[var(--muted-fg)]">
            Best-effort, single attempt, 5s timeout, HMAC-SHA256 signed. Endpoints auto-disable after 10 consecutive failures. https only; private ranges are blocked.
          </p>
          {access.canManageProject && (
            <div className="mb-4">
              <WebhookCreateForm projectId={projectId} />
            </div>
          )}
          {endpoints.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No webhook endpoints yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-3 py-2">Host</th>
                    <th className="px-2 py-2">Events</th>
                    <th className="px-2 py-2">Last delivery</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep) => (
                    <tr key={ep.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="rp-mono px-3 py-2 text-xs font-medium">{hostOf(ep.url)}</td>
                      <td className="px-2 py-2 text-xs">{ep.events.join(", ")}</td>
                      <td className="px-2 py-2 text-xs">{ep.lastDeliveryAt ? `${ep.lastStatus ?? "?"} \u00b7 ${ep.lastDeliveryAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "No deliveries yet"}</td>
                      <td className="px-2 py-2">{ep.revokedAt ? <Badge tone="danger">Revoked</Badge> : ep.enabled ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Auto-disabled</Badge>}</td>
                      <td className="px-3 py-2 text-right">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={"GitOps \u2014 Cable Plans as Code"} icon={GitBranch} className="scroll-mt-24">
          <div id="gitops" />
          {revision && (
            <p className="mb-3 text-xs text-[var(--muted-fg)]">
              Active plan r{revision.revisionNumber} {"\u00b7"} {revision._count.links} cables
              {gitopsEvents[0] ? ` \u00b7 last GitOps action ${gitopsEvents[0].createdAt.toLocaleDateString("en-US")}` : ""}
            </p>
          )}
          <GitOpsPanel projectId={projectId} canExport={access.canExport} canImport={access.canPublishPlan} hasPlan={Boolean(access.project.activeRevisionId)} />
        </Panel>
      </div>
    </div>
  );
}
