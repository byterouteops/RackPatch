import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, ClipboardList, Clock, ExternalLink, Info, Settings, ShieldCheck, Wrench } from "lucide-react";
import { listVisibleProjects } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { listNotifications } from "@/lib/notifications";
import { markNotificationAsRead } from "@/app/actions/notifications";
import { MarkAllReadButton } from "@/components/mark-all-read-button";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All Notifications", icon: Bell },
  { id: "unread", label: "Unread", icon: Info },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
] as const;
type Tab = (typeof TABS)[number]["id"];

function ago(d: Date) {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function kindIcon(kind: string) {
  if (kind.startsWith("work_order")) return ClipboardList;
  if (kind.startsWith("integration")) return Settings;
  if (kind.startsWith("verify")) return ShieldCheck;
  return Bell;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; n?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "all") as Tab;
  const user = await requireSessionUser();
  const projects = await listVisibleProjects(user);
  const projectIds = projects.map((p) => p.id);
  const revIds = projects.map((p) => p.activeRevisionId).filter((x): x is string => Boolean(x));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const [items, alerts, tasks, activity, verifyCount] = await Promise.all([
    listNotifications(user.id, 100),
    revIds.length
      ? prisma.verificationFinding.findMany({
          where: { revisionId: { in: revIds }, state: { in: ["MISMATCH", "NEEDS_REVIEW"] }, exceptionStatus: { not: "CLOSED" } },
          orderBy: [{ severity: "desc" }, { computedAt: "desc" }],
          take: 20,
          select: {
            id: true,
            severity: true,
            observedSummary: true,
            expectedSummary: true,
            computedAt: true,
            plannedLink: { select: { cableId: true, revision: { select: { projectId: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.workOrder.findMany({
      where: { projectId: { in: projectIds }, assigneeId: user.id, status: { in: ["OPEN", "IN_PROGRESS", "DRAFT"] } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 10,
      select: { id: true, code: true, title: true, status: true, dueAt: true, projectId: true },
    }),
    prisma.auditEvent.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, summary: true, createdAt: true, projectId: true },
    }),
    prisma.auditEvent.count({ where: { projectId: { in: projectIds }, action: { startsWith: "verify" }, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
  ]);

  const unread = items.filter((n) => !n.readAt);
  const list = tab === "unread" ? unread : items;
  const selected = tab === "all" || tab === "unread" ? (items.find((n) => n.id === sp.n) ?? list[0] ?? null) : null;
  const href = (next: { tab?: Tab; n?: string }) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t !== "all") p.set("tab", t);
    if (next.n) p.set("n", next.n);
    const s = p.toString();
    return `/app/notifications${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Bell className="mt-1 h-7 w-7" aria-hidden />
          <div>
            <h1 className="rp-display text-[28px] font-extrabold leading-tight tracking-tight">Notifications &amp; Activity Center</h1>
            <p className="text-sm text-[var(--muted-fg)]">Assignments, alerts, and project activity across your cabling projects.</p>
          </div>
        </div>
        <MarkAllReadButton />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 min-[1600px]:grid-cols-6">
        <StatCard label="Total Notifications" value={items.length} icon={<Bell aria-hidden />} tone="info" />
        <StatCard label="Unread" value={unread.length} icon={<Info aria-hidden />} tone={unread.length ? "warning" : "neutral"} />
        <StatCard label="Active Alerts" value={alerts.length} icon={<AlertTriangle aria-hidden />} tone={alerts.length ? "danger" : "neutral"} />
        <StatCard label="Assigned Tasks" value={tasks.length} icon={<ClipboardList aria-hidden />} tone="info" />
        <StatCard label="Verification Updates (7d)" value={verifyCount} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Projects Watched" value={projects.length} icon={<Wrench aria-hidden />} tone="neutral" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TABS.map((t) => {
          const n = t.id === "all" ? items.length : t.id === "unread" ? unread.length : t.id === "alerts" ? alerts.length : tasks.length;
          return (
            <Link
              key={t.id}
              href={href({ tab: t.id })}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors",
                tab === t.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white hover:border-[var(--accent)]",
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label} ({n})
            </Link>
          );
        })}
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rp-card overflow-hidden" aria-label="Notifications">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">{TABS.find((t) => t.id === tab)!.label}</h2>
          </div>
          {tab === "alerts" ? (
            alerts.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">No open verification alerts.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-[13px]">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/projects/${a.plannedLink.revision.projectId}/exceptions?ex=${a.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--muted)]/60">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-ink)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Cabling mismatch {"\u2014"} {a.plannedLink.cableId}</span>
                        <span className="block truncate text-xs text-[var(--muted-fg)]">{a.observedSummary ?? a.expectedSummary}</span>
                        <span className="text-[11px] text-[var(--muted-fg)]">{projectName.get(a.plannedLink.revision.projectId)}</span>
                      </span>
                      <Badge tone={a.severity === "ERROR" ? "danger" : a.severity === "WARNING" ? "warning" : "info"}>
                        {a.severity === "ERROR" ? "Critical" : a.severity === "WARNING" ? "Major" : "Info"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : tab === "tasks" ? (
            tasks.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">No open work orders assigned to you.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-[13px]">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/app/projects/${t.projectId}/work-orders?wo=${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--muted)]/60">
                      <ClipboardList className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {t.code} {"\u2014"} {t.title}
                        </span>
                        <span className="text-[11px] text-[var(--muted-fg)]">
                          {projectName.get(t.projectId)} {t.dueAt ? `\u00b7 due ${t.dueAt.toISOString().slice(0, 10)}` : ""}
                        </span>
                      </span>
                      <Badge tone={t.status === "IN_PROGRESS" ? "info" : "neutral"}>{t.status.replace("_", " ")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<Bell className="h-5 w-5" aria-hidden />} title="Inbox clear" description="Work-order assignments and integration alerts appear here." />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {list.map((n) => {
                const Icon = kindIcon(n.kind);
                const active = n.id === selected?.id;
                return (
                  <li key={n.id}>
                    <Link
                      href={href({ n: n.id })}
                      scroll={false}
                      className={cn(
                        "flex items-start gap-3 px-4 py-2.5",
                        active ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60",
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", n.readAt ? "font-medium" : "font-bold")}>{n.title}</span>
                        <span className="block truncate text-xs text-[var(--muted-fg)]">{n.body}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        {!n.readAt && <Badge tone="info">New</Badge>}
                        <span className="whitespace-nowrap text-[11px] text-[var(--muted-fg)]">{ago(n.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rp-card overflow-hidden" aria-label="Notification details">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Notification Details</h2>
          </div>
          {!selected ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">{tab === "alerts" || tab === "tasks" ? "Open an item to jump to it." : "Select a notification."}</p>
          ) : (
            <div className="p-4">
              <p className="rp-display mb-3 text-[16px] font-bold">{selected.title}</p>
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-[var(--muted-fg)]">Type</dt>
                <dd className="rp-mono text-xs">{selected.kind}</dd>
                <dt className="text-[var(--muted-fg)]">Project</dt>
                <dd>{selected.projectId ? (projectName.get(selected.projectId) ?? "\u2014") : "\u2014"}</dd>
                <dt className="text-[var(--muted-fg)]">Received</dt>
                <dd>{selected.createdAt.toISOString().slice(0, 16).replace("T", " ")}</dd>
                <dt className="text-[var(--muted-fg)]">Status</dt>
                <dd>{selected.readAt ? "Read" : "Unread"}</dd>
                <dt className="text-[var(--muted-fg)]">Message</dt>
                <dd>{selected.body}</dd>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.href && (
                  <Button href={selected.href} size="sm">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Open
                  </Button>
                )}
                {!selected.readAt && (
                  <form
                    action={async () => {
                      "use server";
                      await markNotificationAsRead({ id: selected.id });
                    }}
                  >
                    <Button type="submit" size="sm" variant="secondary">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Mark as read
                    </Button>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card p-4" aria-label="Recent activity">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No project activity yet.</p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                  <span className="min-w-0 flex-1">{a.summary}</span>
                  <span className="whitespace-nowrap text-[11px] text-[var(--muted-fg)]">{ago(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rp-card p-4" aria-label="My assigned tasks">
          <h2 className="rp-display mb-3 text-[15px] font-bold">My Assigned Tasks ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">Nothing assigned to you.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {tasks.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden />
                  <Link href={`/app/projects/${t.projectId}/work-orders?wo=${t.id}`} className="min-w-0 flex-1 truncate hover:text-[var(--accent-ink)]">
                    {t.code} {"\u2014"} {t.title}
                  </Link>
                  <Badge tone="neutral">{t.status.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Notification channels">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Notification Channels</h2>
          <ul className="space-y-2 text-[13px]">
            {[
              ["In-app notifications", "Work orders, NetBox applies", true],
              ["Email", "Sign-in links and invitations only", Boolean(process.env.RESEND_API_KEY)],
              ["Webhooks", "Per project (evidence, install, handover)", true],
            ].map(([t, d, on]) => (
              <li key={t as string} className="flex items-center gap-2">
                {on ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden /> : <Info className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />}
                <span className="flex-1">
                  <span className="font-semibold">{t as string}</span>
                  <span className="block text-[11px] text-[var(--muted-fg)]">{d as string}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/app/settings" className="mt-3 inline-block text-xs font-semibold text-[var(--accent-ink)]">
            Settings {"\u2192"}
          </Link>
        </section>
      </div>
    </div>
  );
}
