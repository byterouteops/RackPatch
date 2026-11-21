import Link from "next/link";
import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import {
  computeWorkOrderProgress,
  WORK_ORDER_STATUS_LABEL,
} from "@/lib/work-orders";
import { WorkOrderStatusForm } from "@/components/work-order-status-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, EmptyState, StatCard } from "@/components/ui";
import { InstallStatusBadge } from "@/components/status-badges";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; workOrderId: string }>;
}) {
  const { projectId, workOrderId } = await params;
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

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, projectId },
    include: {
      assignee: { select: { name: true, email: true } },
      items: {
        include: {
          plannedLink: { include: { runtime: true } },
        },
        orderBy: { plannedLink: { cableId: "asc" } },
      },
    },
  });

  if (!wo) {
    return (
      <EmptyState title="Not found" description="This work order does not exist." />
    );
  }

  const progress = computeWorkOrderProgress(
    wo.items.map((i) => i.plannedLink.runtime?.installStatus),
  );

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Work orders"
        title={`${wo.code} · ${wo.title}`}
        description={wo.notes || "Field install batch"}
        actions={
          <Badge tone={wo.status === "DONE" ? "success" : "info"}>
            {WORK_ORDER_STATUS_LABEL[wo.status]}
          </Badge>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <StatCard label="Cables" value={progress.total} />
        <StatCard label="Installed" value={progress.installed} tone="success" />
        <StatCard label="Blocked" value={progress.blocked} tone={progress.blocked ? "danger" : "neutral"} />
        <StatCard label="Progress" value={`${progress.pct}%`} tone="info" />
      </div>

      <p className="mb-4 text-sm text-[var(--muted-fg)]">
        Assignee: {wo.assignee?.name || wo.assignee?.email || "Unassigned"}
        {wo.dueAt ? ` · Due ${wo.dueAt.toLocaleDateString()}` : ""}
      </p>

      {access.canUpdateInstall && (
        <div className="mb-6">
          <WorkOrderStatusForm
            projectId={projectId}
            workOrderId={wo.id}
            status={wo.status}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase text-[var(--muted-fg)]">
            <tr>
              <th className="px-3 py-2">Cable</th>
              <th className="px-3 py-2">A end</th>
              <th className="px-3 py-2">Z end</th>
              <th className="px-3 py-2">Install</th>
            </tr>
          </thead>
          <tbody>
            {wo.items.map((item) => {
              const l = item.plannedLink;
              return (
                <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/app/projects/${projectId}/cables/${l.id}`}
                      className="rp-mono font-semibold text-[var(--accent)] hover:underline"
                    >
                      {l.cableId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {l.aDevice}/{l.aPort}
                  </td>
                  <td className="px-3 py-2">
                    {l.zDevice}/{l.zPort}
                  </td>
                  <td className="px-3 py-2">
                    <InstallStatusBadge status={l.runtime?.installStatus ?? "PLANNED"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
