import Link from "next/link";
import {
  Bell,
  Building2,
  Cable,
  CheckCircle2,
  Circle,
  FolderKanban,
  KeyRound,
  Layers,
  MapPin,
  Plug,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Zap,
} from "lucide-react";
import { userHasPlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl, isHostedSaas } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { allowPrivateIntegrationNetworks } from "@/lib/net/ssrf";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import packageJson from "../../../../../package.json";

export const dynamic = "force-dynamic";

const PARSERS = ["Cisco NX-OS LLDP", "Cisco IOS-XE LLDP", "Cisco CDP", "Arista EOS LLDP", "Juniper Junos LLDP"];
const CSV_COLUMNS = ["cable_id", "a_rack", "a_device", "a_port", "z_rack", "z_device", "z_port", "cable_type (optional)"];
const NOTIFY_EVENTS: Array<{ event: string; inApp: boolean; webhook: boolean }> = [
  { event: "Work order assigned", inApp: true, webhook: false },
  { event: "Work order created", inApp: true, webhook: false },
  { event: "NetBox plan applied", inApp: true, webhook: false },
  { event: "Evidence imported", inApp: false, webhook: true },
  { event: "Install status updated", inApp: false, webhook: true },
  { event: "Handover snapshot created", inApp: false, webhook: true },
];

function Dot({ on }: { on: boolean }) {
  return on ? <CheckCircle2 className="mx-auto h-4 w-4 text-[var(--success-ink)]" aria-label="Yes" /> : <Circle className="mx-auto h-4 w-4 text-[var(--border)]" aria-label="No" />;
}

function Section({ title, icon: Icon, children, className }: { title: string; icon: typeof Settings; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rp-card p-4 ${className ?? ""}`} aria-label={title}>
      <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
        <Icon className="h-4 w-4" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-1.5 text-[13px] last:border-0">
      <span className="text-[var(--muted-fg)]">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireSessionUser();
  const [memberships, platformAdmin] = await Promise.all([
    prisma.workspaceMembership.findMany({
      where: { userId: user.id },
      include: { workspace: { include: { _count: { select: { projects: true, sites: true, memberships: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    userHasPlatformAdmin(user),
  ]);
  const wsIds = memberships.map((m) => m.workspaceId);
  const projectWhere = { workspaceId: { in: wsIds } };
  const [members, links, integrations, webhooks, tokens, templates] = await Promise.all([
    prisma.workspaceMembership.findMany({ where: { workspaceId: { in: wsIds } }, select: { userId: true, role: true } }),
    prisma.plannedLink.count({ where: { revision: { activeFor: { is: projectWhere } } } }),
    prisma.integrationConfig.findMany({ where: { project: projectWhere }, select: { kind: true, enabled: true, writeEnabled: true } }),
    prisma.webhookEndpoint.count({ where: { project: projectWhere, enabled: true } }),
    prisma.apiToken.count({ where: { project: projectWhere } }),
    prisma.labelTemplate.count({ where: { project: projectWhere } }),
  ]);
  const users = new Set(members.map((m) => m.userId)).size;
  const roles = new Set(members.map((m) => m.role)).size;
  const projects = memberships.reduce((n, m) => n + m.workspace._count.projects, 0);
  const sites = memberships.reduce((n, m) => n + m.workspace._count.sites, 0);
  const primary = memberships[0]?.workspace;
  const secretsKey = Boolean(process.env.FIELD_SECRETS_KEY?.trim());
  const email = Boolean(process.env.RESEND_API_KEY);
  const llm = Boolean(process.env.OPENAI_API_KEY?.trim());
  const netbox = integrations.filter((i) => i.kind === "NETBOX");

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Settings className="mt-1 h-7 w-7" aria-hidden />
          <div>
            <h1 className="rp-display text-[28px] font-extrabold leading-tight tracking-tight">System Settings &amp; Workspace Configuration</h1>
            <p className="text-sm text-[var(--muted-fg)]">
              Read-only view of your organization, workspaces, cabling conventions, notifications and deployment. Server configuration lives in environment variables.
            </p>
          </div>
        </div>
        {platformAdmin && (
          <Button href="/app/admin" size="sm" variant="secondary">
            Platform administration
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-7">
        <StatCard label="Workspaces" value={memberships.length} icon={<Building2 aria-hidden />} tone="success" />
        <StatCard label="Users" value={users} icon={<Users aria-hidden />} tone="info" />
        <StatCard label="Roles in use" value={roles} icon={<Layers aria-hidden />} tone="neutral" />
        <StatCard label="Projects" value={projects} icon={<FolderKanban aria-hidden />} tone="info" />
        <StatCard label="Sites" value={sites} icon={<MapPin aria-hidden />} tone="neutral" />
        <StatCard label="Cable Links" value={links} icon={<Cable aria-hidden />} tone="info" />
        <StatCard label="Application" value={`v${packageJson.version}`} icon={<Settings aria-hidden />} tone="neutral" />
      </div>

      {memberships.length === 0 ? (
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
      ) : (
        <>
          <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
            <Section title="Organization & Account" icon={Building2}>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--sidebar)] text-[var(--cyan)]">
                  <Building2 className="h-7 w-7" aria-hidden />
                </span>
                <span>
                  <span className="rp-display block text-[16px] font-extrabold">{primary?.name}</span>
                  <span className="text-xs text-[var(--muted-fg)]">Primary workspace</span>
                </span>
              </div>
              <Row label="Signed in as">{user.name || user.email}</Row>
              <Row label="Email">{user.email}</Row>
              <Row label="Platform admin">{platformAdmin ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}</Row>
              <Row label="Time zone">Per project (default UTC)</Row>
            </Section>

            <section className="rp-card overflow-hidden" aria-label="Workspace configuration">
              <h2 className="rp-display flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-[15px] font-bold">
                <Layers className="h-4 w-4" aria-hidden />
                Workspace Configuration
              </h2>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Workspace</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2 text-right">Projects</th>
                    <th className="px-4 py-2 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m) => (
                    <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2">
                        <span className="block font-semibold">{m.workspace.name}</span>
                        <span className="rp-mono text-[11px] text-[var(--muted-fg)]">
                          {m.workspace.slug}
                          {m.workspace.isDemo ? " \u00b7 demo" : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone="info">{m.role}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right">{m.workspace._count.projects}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold">
                        <Link href={`/app/workspaces/${m.workspaceId}/sites`} className="text-[var(--accent-ink)] hover:underline">
                          Sites
                        </Link>
                        <span className="mx-1.5 text-[var(--border)]">|</span>
                        <Link href={`/app/workspaces/${m.workspaceId}/team`} className="text-[var(--accent-ink)] hover:underline">
                          Team ({m.workspace._count.memberships})
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <Section title="Deployment" icon={SlidersHorizontal}>
              <Row label="Version">
                <span className="rp-mono">{packageJson.version}</span>
              </Row>
              <Row label="License">Apache 2.0 (Community)</Row>
              <Row label="Hosted SaaS mode">{isHostedSaas() ? <Badge tone="warning">On</Badge> : <Badge tone="neutral">Off (self-host)</Badge>}</Row>
              <Row label="App URL">
                <span className="rp-mono text-xs">{getAppUrl()}</span>
              </Row>
              <Row label="Health">
                <a href="/api/health" target="_blank" rel="noreferrer" className="text-[var(--accent-ink)]">
                  /api/health
                </a>{" "}
                {"\u00b7"}{" "}
                <a href="/api/ready" target="_blank" rel="noreferrer" className="text-[var(--accent-ink)]">
                  /api/ready
                </a>
              </Row>
            </Section>
          </div>

          <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
            <Section title="Cabling Standards & Conventions" icon={Cable}>
              <p className="mb-1 text-xs font-semibold text-[var(--muted-fg)]">Cable plan CSV columns</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {CSV_COLUMNS.map((c) => (
                  <span key={c} className="rp-mono rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px]">
                    {c}
                  </span>
                ))}
              </div>
              <p className="mb-1 text-xs font-semibold text-[var(--muted-fg)]">Neighbor evidence parsers</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {PARSERS.map((p) => (
                  <Badge key={p} tone="info">
                    {p}
                  </Badge>
                ))}
              </div>
              <Row label="Port naming">Normalized (Eth1/1 = Ethernet1/1)</Row>
              <Row label="Device / port aliases">Per project</Row>
              <Row label="Saved label templates">{templates}</Row>
            </Section>

            <section className="rp-card overflow-hidden" aria-label="Notification configuration">
              <h2 className="rp-display flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-[15px] font-bold">
                <Bell className="h-4 w-4" aria-hidden />
                Notification Configuration
              </h2>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2 text-left">Event</th>
                    <th className="px-2 py-2">In-App</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Webhook</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFY_EVENTS.map((e) => (
                    <tr key={e.event} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-1.5">{e.event}</td>
                      <td className="px-2 py-1.5">
                        <Dot on={e.inApp} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Dot on={false} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Dot on={e.webhook} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-[var(--muted-fg)]">
                Email is used for sign-in links and invitations ({email ? "Resend configured" : "Resend not configured"}). Webhook events: {WEBHOOK_EVENTS.join(", ")}.
              </p>
            </section>

            <Section title="Access & Security" icon={ShieldCheck}>
              <Row label="Role-based access control">
                <Badge tone="success">Enforced</Badge>
              </Row>
              <Row label="Contractor isolation">
                <Badge tone="success">Enforced</Badge>
              </Row>
              <Row label="Credential encryption">
                <Badge tone={secretsKey ? "success" : "warning"}>{secretsKey ? "AES-GCM (dedicated key)" : "AES-GCM (auth secret)"}</Badge>
              </Row>
              <Row label="Outbound SSRF guard">
                {allowPrivateIntegrationNetworks() ? <Badge tone="warning">Private networks allowed</Badge> : <Badge tone="success">On</Badge>}
              </Row>
              <Row label="Audit logging">
                <Badge tone="success">On</Badge>
              </Row>
            </Section>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Section title="Integrations & External Services" icon={Plug}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { name: "NetBox", sub: "Inventory sync", on: netbox.some((n) => n.enabled), state: netbox.length ? `${netbox.length} project(s)` : "Not connected" },
                  { name: "Webhooks", sub: "Signed events", on: webhooks > 0, state: webhooks ? `${webhooks} endpoint(s)` : "None" },
                  { name: "API Access", sub: "REST tokens", on: tokens > 0, state: tokens ? `${tokens} token(s)` : "No tokens" },
                  { name: "Assistant LLM", sub: "Optional", on: llm, state: llm ? "Configured" : "Facts-only mode" },
                ].map((i) => (
                  <div key={i.name} className="rounded-lg border border-[var(--border)] p-3 text-center">
                    <KeyRound className="mx-auto mb-1 h-5 w-5 text-[var(--muted-fg)]" aria-hidden />
                    <p className="text-[13px] font-bold">{i.name}</p>
                    <p className="text-[11px] text-[var(--muted-fg)]">{i.sub}</p>
                    <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${i.on ? "bg-[var(--success-soft)] text-[var(--success-ink)]" : "bg-[var(--muted)] text-[var(--muted-fg)]"}`}>
                      {i.state}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[var(--muted-fg)]">Configure per project under Integrations and API.</p>
            </Section>

            <Section title="Quick Actions" icon={Zap}>
              <div className="grid gap-2">
                <Button href="/app/help" size="sm" variant="secondary">
                  Help &amp; docs
                </Button>
                <Button href="/app/notifications" size="sm" variant="secondary">
                  Notification center
                </Button>
                <Button href="/about" size="sm" variant="secondary">
                  About RackPatch
                </Button>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
