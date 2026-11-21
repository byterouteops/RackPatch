import Link from "next/link";
import {
  ArrowLeftRight,
  Calendar,
  Camera,
  ClipboardList,
  FileBarChart,
  Lock,
  MapPin,
  Plus,
  QrCode,
  User,
  Users,
} from "lucide-react";
import type { InstallStatus, Prisma } from "@prisma/client";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { computeWorkOrderProgress, WORK_ORDER_STATUS_LABEL } from "@/lib/work-orders";
import { WorkOrderCreateForm } from "@/components/work-order-create-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { ProjectStrip, StripFact } from "@/components/project-strip";
import { InstallStatusBadge } from "@/components/status-badges";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

const TASK_FILTERS: Array<{ id: string; label: string; status?: InstallStatus }> = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed", status: "INSTALLED" },
  { id: "pending", label: "Pending", status: "PLANNED" },
  { id: "blocked", label: "Blocked", status: "BLOCKED" },
];

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  OPEN: "bg-violet-50 text-violet-700",
  IN_PROGRESS: "bg-[var(--accent-soft)] text-[var(--accent-ink)]",
  DONE: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const TASK_LIMIT = 100;

function fmtDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function WorkOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ wo?: string; task?: string; new?: string }>;
}) {
  const { projectId } = await params;
  const { wo, task = "all", new: showNew } = await searchParams;
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
  const project = access.project;
  const revisionId = project.activeRevisionId;
  const base = `/app/projects/${projectId}/work-orders`;

  const [orders, members, linkOptions, totalCables, installedCables, photos, activity] = await Promise.all([
    prisma.workOrder.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        items: { select: { plannedLink: { select: { aRack: true, zRack: true, runtime: { select: { installStatus: true } } } } } },
      },
    }),
    prisma.projectMembership.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    revisionId
      ? prisma.plannedLink.findMany({
          where: { revisionId },
          select: { id: true, cableId: true },
          orderBy: { cableId: "asc" },
          take: 300,
        })
      : Promise.resolve([]),
    revisionId ? prisma.plannedLink.count({ where: { revisionId } }) : Promise.resolve(0),
    revisionId
      ? prisma.plannedLink.count({ where: { revisionId, runtime: { installStatus: "INSTALLED" } } })
      : Promise.resolve(0),
    prisma.fieldPhoto.findMany({
      where: { projectId },
      orderBy: { capturedAt: "desc" },
      take: 3,
      select: { id: true, capturedAt: true, plannedLink: { select: { cableId: true } } },
    }),
    prisma.auditEvent.findMany({
      where: {
        projectId,
        OR: [{ action: { startsWith: "install" } }, { action: { startsWith: "work" } }, { action: { startsWith: "field" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, summary: true, createdAt: true },
    }),
  ]);

  const selected = orders.find((o) => o.id === wo) ?? orders[0] ?? null;
  const filter = TASK_FILTERS.find((f) => f.id === task) ?? TASK_FILTERS[0];

  const taskWhere: Prisma.PlannedLinkWhereInput = selected
    ? { workOrderLinks: { some: { workOrderId: selected.id } } }
    : { revisionId: revisionId ?? "__none__" };
  const statusWhere: Prisma.PlannedLinkWhereInput | undefined = filter.status
    ? filter.status === "PLANNED"
      ? { OR: [{ runtime: null }, { runtime: { installStatus: "PLANNED" } }] }
      : { runtime: { installStatus: filter.status } }
    : undefined;

  const [tasks, taskCounts] = await Promise.all([
    prisma.plannedLink.findMany({
      where: statusWhere ? { AND: [taskWhere, statusWhere] } : taskWhere,
      orderBy: { cableId: "asc" },
      take: TASK_LIMIT,
      select: {
        id: true,
        cableId: true,
        aDevice: true,
        aPort: true,
        zDevice: true,
        zPort: true,
        runtime: {
          select: { installStatus: true, statusChangedAt: true, installer: { select: { name: true, email: true } } },
        },
      },
    }),
    prisma.plannedLink.findMany({
      where: taskWhere,
      select: { runtime: { select: { installStatus: true } } },
    }),
  ]);
  const counts = {
    all: taskCounts.length,
    installed: taskCounts.filter((t) => t.runtime?.installStatus === "INSTALLED").length,
    blocked: taskCounts.filter((t) => t.runtime?.installStatus === "BLOCKED").length,
    pending: taskCounts.filter((t) => !t.runtime || t.runtime.installStatus === "PLANNED").length,
  };

  const selProgress = selected
    ? computeWorkOrderProgress(selected.items.map((i) => i.plannedLink.runtime?.installStatus))
    : null;
  const selRacks = selected
    ? Array.from(new Set(selected.items.flatMap((i) => [i.plannedLink.aRack, i.plannedLink.zRack]))).sort()
    : [];
  const pct = totalCables > 0 ? (installedCables / totalCables) * 100 : 0;
  const creating = access.canManageProject && (showNew === "1" || orders.length === 0);

  function qs(next: { wo?: string; task?: string }) {
    const p = new URLSearchParams();
    const w = next.wo ?? selected?.id;
    const t = next.task ?? task;
    if (w) p.set("wo", w);
    if (t && t !== "all") p.set("task", t);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  }

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Installation"
        title="Installation Management"
        description="Execute cabling installation, track progress, capture evidence, and update in real time."
        actions={
          <>
            {access.canManageProject && (
              <Button href={`${base}?new=1`} size="sm">
                <Plus className="h-4 w-4" aria-hidden />
                Create Work Order
              </Button>
            )}
            <Button href={`/app/projects/${projectId}/scan`} size="sm" variant="secondary">
              <QrCode className="h-4 w-4" aria-hidden />
              Field Scan
            </Button>
            <Button href={`/app/projects/${projectId}/reports`} size="sm" variant="secondary">
              <FileBarChart className="h-4 w-4" aria-hidden />
              Installation Report
            </Button>
          </>
        }
      />

      <ProjectStrip
        name={project.name}
        phase={pct >= 100 ? "Installed" : totalCables ? "In Progress" : "No plan"}
        phaseTone={pct >= 100 ? "success" : totalCables ? "info" : "neutral"}
        meta={[`Site: ${project.site}`, `Total Cables: ${totalCables.toLocaleString("en-US")}`]}
        progressLabel="Installation Progress"
        progressValue={installedCables}
        progressMax={totalCables}
        aside={
          <>
            <StripFact icon={<ClipboardList />} label="Work orders" value={orders.length} />
            <StripFact icon={<Users />} label="Team members" value={members.length} />
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[290px_minmax(0,1fr)_300px]">
        {/* Work order list */}
        <section className="rp-card overflow-hidden" aria-label="Work orders">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Work Orders ({orders.length})</h2>
            {access.canManageProject && (
              <Link href={`${base}?new=1`} className="flex items-center gap-1 text-sm font-semibold text-[var(--accent-ink)]">
                <Plus className="h-4 w-4" aria-hidden />
                New
              </Link>
            )}
          </div>
          {orders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted-fg)]">
              No work orders yet. Group cables into a work order to assign field tasks.
            </p>
          ) : (
            <ul className="max-h-[640px] space-y-2 overflow-y-auto p-2">
              {orders.map((o) => {
                const p = computeWorkOrderProgress(o.items.map((i) => i.plannedLink.runtime?.installStatus));
                const racks = Array.from(new Set(o.items.flatMap((i) => [i.plannedLink.aRack, i.plannedLink.zRack])));
                const active = selected?.id === o.id;
                return (
                  <li key={o.id}>
                    <Link
                      href={qs({ wo: o.id, task: "all" })}
                      className={cn(
                        "block rounded-lg border px-3 py-2.5",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--muted)]/50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="rp-mono text-[13px] font-bold">{o.code}</p>
                          <p className="truncate text-xs text-[var(--muted-fg)]">
                            {racks.slice(0, 3).join(", ") || o.title} · {o.items.length} cables
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[o.status])}>
                          {WORK_ORDER_STATUS_LABEL[o.status]}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                          <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${p.pct}%` }} />
                        </div>
                        <span className="rp-mono text-[11px] font-bold">{p.pct}%</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Selected work order + cable tasks */}
        <section className="min-w-0 space-y-4">
          {selected && selProgress && (
            <div className="rp-card">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">
                  Installation {"\u2014"} <span className="rp-mono">{selected.code}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", STATUS_TONE[selected.status])}>
                    {WORK_ORDER_STATUS_LABEL[selected.status]}
                  </span>
                  <Button href={`${base}/${selected.id}`} size="sm" variant="secondary">
                    Open
                  </Button>
                </div>
              </div>
              <div className="grid gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-2">
                <Fact icon={<MapPin />} label="Location" value={`${project.site}${selRacks.length ? ` · ${selRacks.slice(0, 4).join(", ")}` : ""}`} />
                <Fact icon={<User />} label="Assigned To" value={selected.assignee?.name || selected.assignee?.email || "Unassigned"} />
                <Fact icon={<Calendar />} label="Due" value={selected.dueAt ? selected.dueAt.toISOString().slice(0, 10) : "Not set"} />
                <Fact
                  icon={<ClipboardList />}
                  label="Cables"
                  value={`${selProgress.total} (Installed: ${selProgress.installed}${selProgress.blocked ? `, Blocked: ${selProgress.blocked}` : ""})`}
                />
                <div className="sm:col-span-2">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">Progress</span>
                    <span className="rp-mono font-bold">{selProgress.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${selProgress.pct}%` }} />
                  </div>
                </div>
                {selected.notes && <p className="text-[var(--muted-fg)] sm:col-span-2">{selected.notes}</p>}
              </div>
            </div>
          )}

          <div className="rp-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display text-[15px] font-bold">
                {selected ? "Cable Tasks" : "Field Install — all cables"} ({counts.all})
              </h2>
              <div className="flex flex-wrap gap-1">
                {TASK_FILTERS.map((f) => (
                  <Link
                    key={f.id}
                    href={qs({ task: f.id })}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      filter.id === f.id
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]",
                    )}
                  >
                    {f.label} ({counts[f.id as keyof typeof counts]})
                  </Link>
                ))}
              </div>
            </div>
            {tasks.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--muted-fg)]">
                {revisionId ? "No cables in this view." : "Publish a cable plan to start installation."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Cable ID</th>
                      <th className="px-2 py-2">A-End (Source)</th>
                      <th className="w-6 px-0 py-2" aria-hidden />
                      <th className="px-2 py-2">B-End (Destination)</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Updated By</th>
                      <th className="px-2 py-2">Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/60">
                        <td className="px-4 py-2">
                          <Link
                            href={`/app/projects/${projectId}/cables/${t.id}`}
                            className="rp-mono font-bold text-[var(--accent-ink)] hover:underline"
                          >
                            {t.cableId}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {t.aDevice} / {t.aPort}
                        </td>
                        <td className="px-0 py-2 text-[var(--muted-fg)]">
                          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {t.zDevice} / {t.zPort}
                        </td>
                        <td className="px-2 py-2">
                          <InstallStatusBadge status={t.runtime?.installStatus ?? "PLANNED"} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-[var(--muted-fg)]">
                          {t.runtime?.installer?.name || t.runtime?.installer?.email || "—"}
                        </td>
                        <td className="rp-mono whitespace-nowrap px-2 py-2 text-xs text-[var(--muted-fg)]">
                          {fmtDate(t.runtime?.statusChangedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {counts.all > TASK_LIMIT && (
                  <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-fg)]">
                    Showing first {TASK_LIMIT}. Use the{" "}
                    <Link href={`/app/projects/${projectId}/cables`} className="font-semibold text-[var(--accent-ink)]">
                      cable plan
                    </Link>{" "}
                    for full search and paging.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right rail */}
        <aside className="min-w-0 space-y-4">
          {creating && (
            <WorkOrderCreateForm projectId={projectId} members={members.map((m) => m.user)} linkOptions={linkOptions} />
          )}

          <div className="rp-card p-4">
            <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
              <QrCode className="h-4 w-4" aria-hidden />
              QR / Barcode Scan
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-[var(--accent)]/50 bg-[var(--accent-soft)]">
                <QrCode className="h-10 w-10 text-[var(--accent-ink)]" aria-hidden />
              </div>
              <p className="text-xs text-[var(--muted-fg)]">
                Scan a cable label to open its install and verify record. Works offline; changes sync later.
              </p>
            </div>
            <Button href={`/app/projects/${projectId}/scan`} size="sm" className="mt-3 w-full">
              Open Scanner
            </Button>
          </div>

          <div className="rp-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
                <Camera className="h-4 w-4" aria-hidden />
                Installation Evidence
              </h2>
              <Link href={`/app/projects/${projectId}/evidence`} className="text-sm font-semibold text-[var(--accent-ink)]">
                View
              </Link>
            </div>
            {photos.length === 0 ? (
              <p className="text-xs text-[var(--muted-fg)]">No field photos yet. Add them from a cable record or the scanner.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((ph) => (
                  <figure key={ph.id} className="overflow-hidden rounded-md border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/field-photos/${ph.id}`} alt={`Field photo ${ph.plannedLink?.cableId ?? ""}`} className="h-16 w-full object-cover" />
                    <figcaption className="rp-mono truncate px-1 py-0.5 text-[10px]">{ph.plannedLink?.cableId ?? "Project"}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>

          <div className="rp-card p-4">
            <h2 className="rp-display mb-3 text-[15px] font-bold">Recent Activity</h2>
            {activity.length === 0 ? (
              <p className="text-xs text-[var(--muted-fg)]">No installation activity yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-2 text-[13px]">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--success)]" aria-hidden />
                    <div className="min-w-0">
                      <p className="leading-snug">{a.summary}</p>
                      <p className="rp-mono text-[11px] text-[var(--muted-fg)]">{fmtDate(a.createdAt)} UTC</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--muted-fg)] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-[var(--muted-fg)]">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}
