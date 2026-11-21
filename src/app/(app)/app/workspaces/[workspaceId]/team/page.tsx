import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, HardHat, Lock, Mail, MinusCircle, Shield, ShieldCheck, UserPlus, Users, Wrench } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { requireWorkspaceOwner } from "@/lib/authz";
import { resolveProjectCapabilities, type CapabilityInput } from "@/lib/authz-capabilities";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { inviteTeammate } from "@/app/actions/workspace";
import { Badge, Button, EmptyState, Input, Select, StatCard } from "@/components/ui";
type RoleKey = "owner" | "lead" | "technician" | "contractor" | "viewer";

const ROLES: Array<{ key: RoleKey; label: string; tone: "info" | "success" | "warning" | "neutral"; input: Omit<CapabilityInput, "paid"> }> = [
  { key: "owner", label: "Workspace Owner", tone: "info", input: { isOwner: true, role: null, contractor: false } },
  { key: "lead", label: "Project Lead", tone: "success", input: { isOwner: false, role: ProjectRole.LEAD, contractor: false } },
  { key: "technician", label: "Technician", tone: "warning", input: { isOwner: false, role: ProjectRole.TECHNICIAN, contractor: false } },
  { key: "contractor", label: "Contractor", tone: "neutral", input: { isOwner: false, role: ProjectRole.TECHNICIAN, contractor: true } },
  { key: "viewer", label: "Viewer (Auditor)", tone: "neutral", input: { isOwner: false, role: ProjectRole.VIEWER, contractor: false } },
];

const PERMS: Array<{ key: "canManageProject" | "canPublishPlan" | "canUpdateInstall" | "canPhysicalVerify" | "canImportEvidence" | "canResolveExceptions" | "canQcAcknowledge" | "canExport"; label: string }> = [
  { key: "canManageProject", label: "Manage" },
  { key: "canPublishPlan", label: "Plan" },
  { key: "canUpdateInstall", label: "Install" },
  { key: "canPhysicalVerify", label: "Verify" },
  { key: "canImportEvidence", label: "Evidence" },
  { key: "canResolveExceptions", label: "Resolve" },
  { key: "canQcAcknowledge", label: "QC ack" },
  { key: "canExport", label: "Handover" },
];

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  try {
    await requireWorkspaceOwner(user, workspaceId);
  } catch {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="Workspace owners only." />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { projects: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
  if (!workspace) notFound();
  const projectIds = workspace.projects.map((p) => p.id);

  const [owners, memberships, invites, activity] = await Promise.all([
    prisma.workspaceMembership.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.projectMembership.findMany({
      where: { projectId: { in: projectIds } },
      include: { user: { select: { id: true, name: true, email: true } }, project: { select: { name: true } } },
    }),
    prisma.invitation.findMany({ where: { workspaceId, acceptedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.auditEvent.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
  ]);

  type Person = { id: string; name: string; email: string; role: RoleKey; projects: string[] };
  const people = new Map<string, Person>();
  const rank: Record<RoleKey, number> = { owner: 4, lead: 3, technician: 2, contractor: 1, viewer: 0 };
  const add = (u: { id: string; name: string; email: string }, role: RoleKey, project?: string) => {
    const cur = people.get(u.id) ?? { id: u.id, name: u.name || u.email, email: u.email, role, projects: [] };
    if (rank[role] > rank[cur.role]) cur.role = role;
    if (project && !cur.projects.includes(project)) cur.projects.push(project);
    people.set(u.id, cur);
  };
  for (const o of owners) add(o.user, "owner");
  for (const m of memberships)
    add(m.user, m.contractor ? "contractor" : m.role === "LEAD" ? "lead" : m.role === "VIEWER" ? "viewer" : "technician", m.project.name);
  const list = [...people.values()].sort((a, b) => rank[b.role] - rank[a.role] || a.name.localeCompare(b.name));

  const lastSessions = list.length
    ? await prisma.session.groupBy({ by: ["userId"], where: { userId: { in: list.map((p) => p.id) } }, _max: { updatedAt: true } })
    : [];
  const lastLogin = (id: string) => lastSessions.find((s) => s.userId === id)?._max.updatedAt ?? null;
  const count = (r: RoleKey) => list.filter((p) => p.role === r).length;
  const roleMeta = (r: RoleKey) => ROLES.find((x) => x.key === r)!;
  const now = Date.now();

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-xs font-medium text-[var(--muted-fg)]">
            <Link href="/app" className="hover:text-[var(--accent-ink)]">
              Workspaces
            </Link>{" "}
            / <span className="text-[var(--foreground)]">{workspace.name}</span>
          </nav>
          <h1 className="rp-display text-[28px] font-extrabold leading-tight tracking-tight">Users &amp; Roles Management</h1>
          <p className="text-sm text-[var(--muted-fg)]">People, roles, project assignments and role-based access for {workspace.name}.</p>
        </div>
        <div className="flex gap-2">
          <Button href="#invite" size="sm">
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite User
          </Button>
          <Button href={`/app/workspaces/${workspaceId}/sites`} size="sm" variant="secondary">
            Sites
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 min-[1600px]:grid-cols-6">
        <StatCard label="Total Users" value={list.length} icon={<Users aria-hidden />} tone="info" />
        <StatCard label="Owners" value={count("owner")} icon={<Shield aria-hidden />} tone="info" />
        <StatCard label="Leads" value={count("lead")} icon={<ShieldCheck aria-hidden />} tone="success" />
        <StatCard label="Technicians" value={count("technician")} icon={<Wrench aria-hidden />} tone="warning" />
        <StatCard label="Contractors" value={count("contractor")} icon={<HardHat aria-hidden />} tone="neutral" />
        <StatCard label="Pending Invites" value={invites.length} icon={<Mail aria-hidden />} tone={invites.length ? "warning" : "neutral"} />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="rp-card overflow-hidden" aria-label="Users">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <Users className="h-4 w-4" aria-hidden />
              Users ({list.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">User</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Projects</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-4 py-2">Last active</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const seen = lastLogin(p.id);
                  const active = seen ? now - seen.getTime() < 30 * 86_400_000 : false;
                  return (
                    <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white">{initials(p.name)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{p.name}</span>
                            <span className="block truncate text-[11px] text-[var(--muted-fg)]">{p.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={roleMeta(p.role).tone}>{roleMeta(p.role).label}</Badge>
                      </td>
                      <td className="max-w-[160px] truncate px-2 py-2 text-xs">{p.role === "owner" && p.projects.length === 0 ? "All projects" : p.projects.join(", ")}</td>
                      <td className="px-2 py-2">
                        <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-[var(--muted-fg)]">{seen ? fmt(seen) : "Never"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rp-card overflow-hidden" aria-label="Roles and permissions">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Roles &amp; Permissions ({ROLES.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2 text-left">Role</th>
                  {PERMS.map((p) => (
                    <th key={p.key} className="px-1 py-2 text-center">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => {
                  const caps = resolveProjectCapabilities({ ...r.input, paid: true });
                  return (
                    <tr key={r.key} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 font-semibold">{r.label}</td>
                      {PERMS.map((p) => (
                        <td key={p.key} className="px-1 py-2 text-center">
                          {caps[p.key] ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-[var(--success-ink)]" aria-label="Allowed" />
                          ) : (
                            <MinusCircle className="mx-auto h-4 w-4 text-[var(--border)]" aria-label="Not allowed" />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-[var(--muted-fg)]">Resolved from the same capability rules the server enforces. Mutations also require an activated (pilot/paid) or demo project.</p>
        </section>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card overflow-hidden" aria-label="Project teams">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Project Teams ({workspace.projects.length})</h2>
          </div>
          <table className="w-full text-[13px]">
            <tbody>
              {workspace.projects.map((p) => {
                const ms = memberships.filter((m) => m.projectId === p.id);
                return (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/app/projects/${p.id}`} className="font-semibold text-[var(--accent-ink)] hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-xs text-[var(--muted-fg)]">
                      {ms.filter((m) => m.role === "LEAD" && !m.contractor).length} lead {"\u00b7"} {ms.filter((m) => m.role === "TECHNICIAN" && !m.contractor).length} tech {"\u00b7"}{" "}
                      {ms.filter((m) => m.contractor).length} contractor
                    </td>
                    <td className="px-4 py-2 text-right font-bold">{ms.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="rp-card p-4" aria-label="Access policies">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Access Policies</h2>
          <ul className="space-y-2 text-[13px]">
            {[
              ["Role-based access control", "Enforced on every server action"],
              ["Project scoping", "Members see only assigned projects"],
              ["Contractor isolation", "Never granted lead powers"],
              ["Invitations", "Single project, expiring token"],
              ["Audit logging", "All mutations are recorded"],
            ].map(([t, d]) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden />
                <span>
                  <span className="font-semibold">{t}</span> {"\u2014"} <span className="text-[var(--muted-fg)]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rp-card p-4" aria-label="Recent access activity">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{a.actor ? a.actor.name || a.actor.email : "System"}</span> {a.summary}
                    <span className="block text-[11px] text-[var(--muted-fg)]">{fmt(a.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div id="invite" className="grid scroll-mt-20 items-start gap-4 xl:grid-cols-2">
        <section className="rp-card p-4" aria-label="Invite user">
          <h2 className="rp-display mb-1 flex items-center gap-2 text-[15px] font-bold">
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite User
          </h2>
          <p className="mb-3 text-xs text-[var(--muted-fg)]">Invitees receive access to the selected project only.</p>
          <form
            action={async (fd) => {
              "use server";
              const result = await inviteTeammate({
                workspaceId,
                email: String(fd.get("email")),
                role: fd.get("role") as ProjectRole,
                projectId: String(fd.get("projectId")),
                contractor: fd.get("contractor") === "on",
              });
              if (process.env.NODE_ENV !== "production") {
                console.info("[invite] token for", result.email, result.token);
              }
            }}
            className="grid gap-3"
          >
            <Input name="email" type="email" required placeholder="colleague@company.com" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select name="projectId" required defaultValue={workspace.projects[0]?.id}>
                {workspace.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Select name="role" defaultValue="TECHNICIAN">
                <option value="TECHNICIAN">Technician</option>
                <option value="LEAD">Lead</option>
                <option value="VIEWER">Viewer (read-only auditor)</option>
              </Select>
            </div>
            <label className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/50 p-3 text-sm">
              <input type="checkbox" name="contractor" className="mt-1 accent-[var(--accent)]" />
              <span>External contractor (Technician only). Can install, verify and QC-acknowledge findings; cannot resolve exceptions, import, export or manage the project.</span>
            </label>
            <Button type="submit">Create invite</Button>
          </form>
        </section>

        <section className="rp-card overflow-hidden" aria-label="Pending invitations">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Pending Invitations ({invites.length})</h2>
          </div>
          {invites.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No pending invitations.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {invites.map((i) => {
                const expired = i.expiresAt.getTime() < now;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.email}</span>
                      <span className="text-[11px] text-[var(--muted-fg)]">
                        {i.contractor ? "Contractor" : i.role === "LEAD" ? "Lead" : i.role === "VIEWER" ? "Viewer" : "Technician"} {"\u00b7"} {workspace.projects.find((p) => p.id === i.projectId)?.name ?? "\u2014"}
                      </span>
                    </span>
                    <Badge tone={expired ? "danger" : "warning"}>{expired ? "Expired" : `Expires ${i.expiresAt.toISOString().slice(0, 10)}`}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
