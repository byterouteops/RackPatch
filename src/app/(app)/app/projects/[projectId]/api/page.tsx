import Link from "next/link";
import { BookOpen, Code2, Download, GitBranch, KeyRound, ListTree, Lock, Plug, ShieldCheck, Webhook } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { WEBHOOK_EVENTS, SIGNATURE_HEADER } from "@/lib/webhooks";
import { revokeApiToken } from "@/app/actions/api-tokens";
import { Panel } from "@/components/charts";
import { ProjectPageHeader } from "@/components/project-page-header";
import { ApiTokenCreateForm } from "@/components/api-token-create-form";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const LANGS = ["curl", "powershell", "python"] as const;
const EVENT_INFO: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  "evidence.import": "LLDP/CDP evidence imported and findings recomputed",
  "install.update": "Cable install status changed",
  "handover.create": "Handover snapshot created",
};

export default async function ProjectApiPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }

  const [tokens, webhooks, netbox] = await Promise.all([
    prisma.apiToken.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    prisma.webhookEndpoint.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { id: true, url: true, events: true, enabled: true, revokedAt: true, lastStatus: true } }),
    prisma.integrationConfig.findUnique({ where: { projectId_kind: { projectId, kind: "NETBOX" } }, select: { enabled: true } }),
  ]);
  const activeTokens = tokens.filter((t) => !t.revokedAt).length;
  const activeHooks = webhooks.filter((w) => !w.revokedAt && w.enabled).length;
  const usedTokens = tokens.filter((t) => t.lastUsedAt).length;
  const appUrl = getAppUrl();
  const lang = LANGS.find((l) => l === sp.lang) ?? "curl";
  const url = `${appUrl}/api/v1/projects/${projectId}/cables`;
  const snippets: Record<(typeof LANGS)[number], string> = {
    curl: `curl -X GET \\\n  "${url}" \\\n  -H "Authorization: Bearer <API_TOKEN>" \\\n  -H "Accept: application/json"`,
    powershell: `Invoke-RestMethod \`\n  -Uri "${url}" \`\n  -Headers @{ Authorization = "Bearer <API_TOKEN>" }`,
    python: `import requests\n\nr = requests.get(\n    "${url}",\n    headers={"Authorization": "Bearer <API_TOKEN>"},\n)\nprint(r.json())`,
  };
  const endpoints = [
    { path: `/api/v1/projects/{id}/summary`, desc: "Project counts: links, install and verification states" },
    { path: `/api/v1/projects/{id}/cables`, desc: "Cable list with install status and verification" },
    { path: `/api/v1/projects/{id}/gitops?format=json`, desc: "Active plan as code (JSON)" },
    { path: `/api/v1/projects/{id}/gitops?format=yaml`, desc: "Active plan as code (YAML)" },
  ];
  const base = `/app/projects/${projectId}`;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="API"
        title="API Keys, Webhooks & Developer Portal"
        description="Read-only REST for this project, signed outbound webhooks, and GitOps export."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 min-[1600px]:grid-cols-6">
        <StatCard label="API Tokens (active)" value={`${activeTokens} / ${tokens.length}`} icon={<KeyRound aria-hidden />} tone="info" />
        <StatCard label="Tokens Ever Used" value={usedTokens} icon={<ShieldCheck aria-hidden />} tone="neutral" />
        <StatCard label="Webhooks (active)" value={`${activeHooks} / ${webhooks.length}`} icon={<Webhook aria-hidden />} tone="success" href={`${base}/integrations`} />
        <StatCard label="REST Endpoints" value={3} icon={<ListTree aria-hidden />} tone="neutral" />
        <StatCard label="Webhook Events" value={WEBHOOK_EVENTS.length} icon={<Plug aria-hidden />} tone="neutral" />
        <StatCard label="NetBox" value={netbox ? (netbox.enabled ? "Connected" : "Disabled") : "Not set"} icon={<GitBranch aria-hidden />} tone={netbox?.enabled ? "success" : "neutral"} href={`${base}/integrations`} />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-2">
        <Panel title={`API Tokens (${tokens.length})`} icon={KeyRound} flush>
          {access.canManageProject && (
            <div className="border-b border-[var(--border)] p-4">
              <ApiTokenCreateForm projectId={projectId} />
            </div>
          )}
          {tokens.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No tokens yet. Tokens are project-scoped and read-only.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-2 py-2">Prefix</th>
                    <th className="px-2 py-2">Scope</th>
                    <th className="px-2 py-2">Last used</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 font-semibold">{t.name}</td>
                      <td className="rp-mono px-2 py-2 text-xs">{t.tokenPrefix}{"\u2026"}</td>
                      <td className="px-2 py-2 text-xs">Read only</td>
                      <td className="px-2 py-2 text-xs">{t.lastUsedAt ? t.lastUsedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}</td>
                      <td className="px-2 py-2">{t.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>}</td>
                      <td className="px-4 py-2 text-right">
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
        </Panel>

        <Panel title={`Webhooks (${webhooks.length})`} icon={Webhook} flush action={<Link href={`${base}/integrations#webhooks`} className="text-xs font-semibold text-[var(--accent-ink)]">+ Add webhook</Link>}>
          {webhooks.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No webhook endpoints. Add one under Integrations.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Endpoint</th>
                  <th className="px-2 py-2">Events</th>
                  <th className="px-2 py-2">Last status</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="rp-mono max-w-[200px] truncate px-4 py-2 text-xs">{w.url}</td>
                    <td className="px-2 py-2 text-xs">{w.events.join(", ")}</td>
                    <td className="px-2 py-2 text-xs">{w.lastStatus ?? "\u2014"}</td>
                    <td className="px-4 py-2">{w.revokedAt ? <Badge tone="danger">Revoked</Badge> : w.enabled ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Auto-disabled</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title={"REST API \u2014 Quick Example"} icon={Code2}>
          <div className="mb-2 flex gap-1">
            {LANGS.map((l) => (
              <Link
                key={l}
                href={`${base}/api?lang=${l}`}
                scroll={false}
                className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", l === lang ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]")}
              >
                {l === "curl" ? "cURL" : l === "powershell" ? "PowerShell" : "Python"}
              </Link>
            ))}
          </div>
          <pre tabIndex={0} className="rp-mono overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{snippets[lang]}</pre>
          <p className="mt-2 text-xs text-[var(--muted-fg)]">Signed-in browsers can also call these with the session cookie.</p>
        </Panel>

        <Panel title="Key API Endpoints" icon={ListTree}>
          <ul className="space-y-2 text-[13px]">
            {endpoints.map((e) => (
              <li key={e.path}>
                <span className="flex items-center gap-2">
                  <Badge tone="success">GET</Badge>
                  <code className="rp-mono break-all text-xs">{e.path}</code>
                </span>
                <span className="block pl-12 text-xs text-[var(--muted-fg)]">{e.desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted-fg)]">The API is read-only; changes happen in the app or via GitOps import.</p>
        </Panel>

        <Panel title="Webhook Event Types" icon={Plug}>
          <ul className="space-y-2 text-[13px]">
            {WEBHOOK_EVENTS.map((e) => (
              <li key={e} className="flex items-start gap-2">
                <code className="rp-mono shrink-0 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--accent-ink)]">{e}</code>
                <span className="text-xs">{EVENT_INFO[e]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted-fg)]">
            Signed with HMAC-SHA256 in <code className="rp-mono">{SIGNATURE_HEADER}</code>. Single attempt, 5s timeout.
          </p>
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Developer Resources" icon={BookOpen}>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { href: "/app/help", title: "Help & documentation", desc: "Workflows, roles and FAQs" },
              { href: `${base}/integrations`, title: "Integrations", desc: "NetBox, webhooks and GitOps" },
              { href: `/api/v1/projects/${projectId}/summary`, title: "Try the summary endpoint", desc: "Opens JSON with your session" },
              { href: "/api/health", title: "Health endpoint", desc: "Liveness check for monitors" },
            ].map((r) => (
              <Link key={r.href} href={r.href} className="rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                <span className="block text-[13px] font-semibold">{r.title}</span>
                <span className="block text-xs text-[var(--muted-fg)]">{r.desc}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="GitOps / Export" icon={GitBranch}>
          <p className="mb-3 text-[13px] text-[var(--muted-fg)]">Export the active cable plan as code to version it in Git or feed external tooling.</p>
          {access.project.activeRevisionId && access.canExport ? (
            <div className="flex flex-wrap gap-2">
              <Button href={`/api/v1/projects/${projectId}/gitops?format=json`} size="sm" variant="secondary">
                <Download className="h-4 w-4" aria-hidden />
                Export JSON
              </Button>
              <Button href={`/api/v1/projects/${projectId}/gitops?format=yaml`} size="sm" variant="secondary">
                <Download className="h-4 w-4" aria-hidden />
                Export YAML
              </Button>
              <Button href={`${base}/integrations#gitops`} size="sm">
                Import plan as code
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-fg)]">{access.project.activeRevisionId ? "Export requires export permission." : "Publish a plan to export it."}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
