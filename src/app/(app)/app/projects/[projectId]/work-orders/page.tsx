import Link from "next/link";
import { ClipboardList, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import {
  computeWorkOrderProgress,
  WORK_ORDER_STATUS_LABEL,
} from "@/lib/work-orders";
import { WorkOrderCreateForm } from "@/components/work-order-create-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, EmptyState, StatCard } from "@/components/ui";

export default async function WorkOrdersPage({
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

  const [orders, members, links] = await Promise.all([
    prisma.workOrder.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        items: { include: { plannedLink: { include: { runtime: true } } } },
      },
    }),
    prisma.projectMembership.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    access.project.activeRevisionId
      ? prisma.plannedLink.findMany({
          where: { revisionId: access.project.activeRevisionId },
          select: { id: true, cableId: true },
          orderBy: { cableId: "asc" },
          take: 300,
        })
      : Promise.resolve([]),
  ]);

  const openCount = orders.filter((o) =>
    ["OPEN", "IN_PROGRESS", "DRAFT"].includes(o.status),
  ).length;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Work orders"
        title="Installation work orders"
        description="Group cables into field tasks, assign technicians, and track install progress."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Work orders" value={orders.length} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Open / in progress" value={openCount} tone={openCount ? "warning" : "neutral"} />
        <StatCard label="Cables attachable" value={links.length} tone="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {orders.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" aria-hidden />}
              title="No work orders yet"
              description="Create one to assign install batches to field techs."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-fg)]">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Assignee</th>
                    <th className="px-3 py-2">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const progress = computeWorkOrderProgress(
                      o.items.map((i) => i.plannedLink.runtime?.installStatus),
                    );
                    return (
                      <tr key={o.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2">
                          <Link
                            href={`/app/projects/${projectId}/work-orders/${o.id}`}
                            className="rp-mono font-semibold text-[var(--accent)] hover:underline"
                          >
                            {o.code}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{o.title}</td>
                        <td className="px-3 py-2">
                          <Badge tone={o.status === "DONE" ? "success" : "neutral"}>
                            {WORK_ORDER_STATUS_LABEL[o.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-[var(--muted-fg)]">
                          {o.assignee?.name || o.assignee?.email || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {progress.installed}/{progress.total} ({progress.pct}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {access.canManageProject && (
          <WorkOrderCreateForm
            projectId={projectId}
            members={members.map((m) => m.user)}
            linkOptions={links}
          />
        )}
      </div>
    </div>
  );
}
