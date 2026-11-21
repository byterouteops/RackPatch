import { Lock, Package } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createStockItem } from "@/app/actions/spares";
import { ProjectPageHeader } from "@/components/project-page-header";
import { SpareAdjustForm } from "@/components/spare-adjust-form";
import { Badge, Button, Card, EmptyState, Input, StatCard } from "@/components/ui";

export default async function SparesPage({
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

  const [items, recent] = await Promise.all([
    prisma.stockItem.findMany({ where: { projectId }, orderBy: { sku: "asc" } }),
    prisma.stockTransaction.findMany({
      where: { item: { projectId } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { item: { select: { sku: true, unit: true } } },
    }),
  ]);

  const actorIds = Array.from(new Set(recent.map((t) => t.actorId)));
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name || a.email]));

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Spares"
        title="Spares"
        description="Spare cable and optic stock ledger. Quantities change only through immutable transactions and never go below zero."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Stock items"
            value={items.length}
            icon={<Package className="h-5 w-5" aria-hidden />}
            tone="info"
          />
          <StatCard
            label="Units on hand"
            value={items.reduce((sum, i) => sum + i.quantityOnHand, 0)}
            tone="neutral"
          />
        </div>

        {access.canManageProject && (
          <Card title="Add stock item" description="Creates a SKU with an optional opening balance.">
            <form
              action={async (fd) => {
                "use server";
                await createStockItem({
                  projectId,
                  sku: String(fd.get("sku") || ""),
                  description: String(fd.get("description") || ""),
                  unit: String(fd.get("unit") || "each"),
                  initialQuantity: Number(fd.get("initialQuantity") || 0),
                });
              }}
              className="grid gap-3 sm:grid-cols-4"
            >
              <Input name="sku" required placeholder="SKU (e.g. DAC-3M)" />
              <Input name="description" required placeholder="Description" className="sm:col-span-2" />
              <Input name="unit" defaultValue="each" placeholder="Unit" />
              <Input
                name="initialQuantity"
                type="number"
                min={0}
                defaultValue={0}
                placeholder="Initial quantity"
              />
              <Button type="submit" className="sm:col-span-3">
                Add item
              </Button>
            </form>
          </Card>
        )}

        <Card title="Stock on hand" flush>
          {items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Package className="h-5 w-5" aria-hidden />}
                title="No stock items"
                description="A lead can add the first SKU."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items.map((i) => (
                <li key={i.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="rp-mono font-semibold">{i.sku}</p>
                      <p className="text-sm text-[var(--muted-fg)]">{i.description}</p>
                    </div>
                    <p className="rp-mono text-2xl font-semibold">
                      {i.quantityOnHand}{" "}
                      <span className="text-sm font-normal text-[var(--muted-fg)]">{i.unit}</span>
                    </p>
                  </div>
                  {(access.canManageProject || access.canUpdateInstall) && (
                    <SpareAdjustForm
                      projectId={projectId}
                      itemId={i.id}
                      canReceive={access.canManageProject}
                      canConsume={access.canUpdateInstall}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent transactions" description="Append-only ledger (latest 25)." flush>
          {recent.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted-fg)]">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Change</th>
                    <th>SKU</th>
                    <th>Reason</th>
                    <th>By</th>
                    <th className="text-right">Balance</th>
                    <th className="text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Badge tone={t.delta > 0 ? "success" : "warning"}>
                          {t.delta > 0 ? "+" : ""}
                          {t.delta}
                        </Badge>
                      </td>
                      <td className="rp-mono font-medium">{t.item.sku}</td>
                      <td className="text-[var(--muted-fg)]">{t.reason}</td>
                      <td className="text-[var(--muted-fg)]">
                        {actorName.get(t.actorId) ?? t.actorId}
                      </td>
                      <td className="rp-mono text-right">{t.quantityAfter}</td>
                      <td className="whitespace-nowrap text-right text-xs text-[var(--muted-fg)]">
                        {t.createdAt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
