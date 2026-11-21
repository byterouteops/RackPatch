import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  FileText,
  History,
  Lock,
  Package,
  PackagePlus,
  PieChart,
  ShieldCheck,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createStockItem } from "@/app/actions/spares";
import { DonutWithLegend, Panel } from "@/components/charts";
import { ProjectPageHeader } from "@/components/project-page-header";
import { StockTransactionForm } from "@/components/stock-transaction-form";
import { Badge, Button, EmptyState, Input, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const LOW_STOCK = 5;
const TX_PAGE = 15;

type Kind = "Receive" | "Issue" | "Return" | "Adjust";
function kindOf(delta: number, reason: string): Kind {
  const prefix = reason.split(":")[0]?.trim();
  if (prefix === "Receive" || prefix === "Issue" || prefix === "Return" || prefix === "Adjust") return prefix;
  if (/return/i.test(reason)) return "Return";
  if (/adjust|count/i.test(reason)) return "Adjust";
  return delta > 0 ? "Receive" : "Issue";
}
const KIND_TONE: Record<Kind, "success" | "info" | "warning" | "neutral"> = { Receive: "success", Issue: "info", Return: "warning", Adjust: "neutral" };

function stockState(q: number) {
  if (q === 0) return { label: "Out of stock", tone: "danger" as const };
  if (q < LOW_STOCK) return { label: "Low stock", tone: "warning" as const };
  return { label: "In stock", tone: "success" as const };
}

export default async function SparesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tx?: string; kind?: string; item?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [items, txs, txCount, issued30, audit] = await Promise.all([
    prisma.stockItem.findMany({ where: { projectId }, orderBy: { sku: "asc" } }),
    prisma.stockTransaction.findMany({
      where: { item: { projectId }, ...(sp.item ? { itemId: sp.item } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { item: { select: { sku: true, unit: true, description: true } } },
    }),
    prisma.stockTransaction.count({ where: { item: { projectId } } }),
    prisma.stockTransaction.aggregate({ where: { item: { projectId }, delta: { lt: 0 }, createdAt: { gte: since } }, _sum: { delta: true } }),
    prisma.auditEvent.findMany({
      where: { projectId, action: { startsWith: "spares." } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
  ]);

  const actorIds = Array.from(new Set(txs.map((t) => t.actorId)));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name || a.email]));

  const kindFilter = (["Receive", "Issue", "Return", "Adjust"] as const).find((k) => k === sp.kind);
  const ledger = txs.map((t) => ({ ...t, kind: kindOf(t.delta, t.reason) })).filter((t) => !kindFilter || t.kind === kindFilter);
  const shown = ledger.slice(0, TX_PAGE);
  const selected = ledger.find((t) => t.id === sp.tx) ?? shown[0];

  const units = items.reduce((s, i) => s + i.quantityOnHand, 0);
  const inStock = items.filter((i) => i.quantityOnHand >= LOW_STOCK).length;
  const low = items.filter((i) => i.quantityOnHand > 0 && i.quantityOnHand < LOW_STOCK).length;
  const out = items.filter((i) => i.quantityOnHand === 0).length;
  const canTransact = access.canManageProject || access.canUpdateInstall;

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ kind: sp.kind, item: sp.item, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/projects/${projectId}/spares${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Spares"
        title="Spare Stock Ledger & Cable Inventory"
        description="Spare cables, optics and consumables. Quantities change only through immutable transactions and never go below zero."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total SKUs" value={items.length} icon={<Boxes aria-hidden />} tone="info" />
        <StatCard label="Units on Hand" value={units} icon={<Package aria-hidden />} tone="neutral" />
        <StatCard label="In Stock" value={inStock} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Low Stock" value={low} icon={<AlertTriangle aria-hidden />} tone={low ? "warning" : "neutral"} />
        <StatCard label="Out of Stock" value={out} icon={<XCircle aria-hidden />} tone={out ? "danger" : "neutral"} />
        <StatCard label="Issued (30d)" value={Math.abs(issued30._sum.delta ?? 0)} icon={<TrendingDown aria-hidden />} tone="info" />
        <StatCard label="Transactions" value={txCount} icon={<ArrowRightLeft aria-hidden />} tone="neutral" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Inventory" icon={Package} flush action={sp.item && <Link href={href({ item: undefined, tx: undefined })} className="text-xs font-semibold text-[var(--accent)]">Show all</Link>}>
            {items.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Package className="h-5 w-5" aria-hidden />} title="No stock items" description="A lead can add the first SKU with Add Stock Item." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Part number</th>
                      <th className="px-2 py-2">UoM</th>
                      <th className="px-2 py-2 text-right">Stock</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const st = stockState(i.quantityOnHand);
                      return (
                        <tr key={i.id} className={cn("border-b border-[var(--border)] last:border-0", sp.item === i.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                          <td className="px-4 py-2">
                            <Link href={href({ item: i.id, tx: undefined })} scroll={false} className="rp-mono font-semibold text-[var(--accent)] hover:underline">
                              {i.sku}
                            </Link>
                            <span className="block truncate text-xs text-[var(--muted-fg)]">{i.description}</span>
                          </td>
                          <td className="px-2 py-2 text-xs">{i.unit}</td>
                          <td className="rp-mono px-2 py-2 text-right font-semibold">{i.quantityOnHand.toLocaleString("en-US")}</td>
                          <td className="px-4 py-2">
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Stock Levels" icon={PieChart}>
            <DonutWithLegend
              total={items.length}
              label="SKUs"
              segments={[
                { label: "In stock", value: inStock, color: "#16a34a" },
                { label: `Low stock (<${LOW_STOCK})`, value: low, color: "#f59e0b" },
                { label: "Out of stock", value: out, color: "#ef4444" },
              ]}
            />
          </Panel>

          <Panel title="Stock Rules & Controls" icon={ShieldCheck}>
            <ul className="space-y-1.5 text-[13px]">
              {[
                "Immutable transactions (append-only, DB trigger blocks edits)",
                "Negative stock is rejected atomically",
                `Low-stock flag below ${LOW_STOCK} units`,
                "Receiving and returns require a lead",
                "Every transaction records user, time and reason",
              ].map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title={`Transaction Ledger${sp.item ? ` \u2014 ${items.find((i) => i.id === sp.item)?.sku ?? ""}` : ""}`} icon={ArrowRightLeft} flush>
            <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-4 py-2">
              {(["", "Receive", "Issue", "Return", "Adjust"] as const).map((k) => (
                <Link
                  key={k || "all"}
                  href={href({ kind: k || undefined, tx: undefined })}
                  scroll={false}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    (sp.kind ?? "") === k ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]",
                  )}
                >
                  {k ? `${k}s` : "All"}
                </Link>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">No transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Date &amp; time</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      <th className="px-4 py-2">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id} className={cn("border-b border-[var(--border)] last:border-0", selected?.id === t.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                        <td className="whitespace-nowrap px-4 py-2 text-xs">
                          <Link href={href({ tx: t.id })} scroll={false} className="font-medium text-[var(--accent)] hover:underline">
                            {t.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          <Badge tone={KIND_TONE[t.kind]}>{t.kind}</Badge>
                        </td>
                        <td className="rp-mono px-2 py-2 text-xs">{t.item.sku}</td>
                        <td className={cn("rp-mono px-2 py-2 text-right font-semibold", t.delta > 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                          {t.delta > 0 ? "+" : ""}
                          {t.delta.toLocaleString("en-US")}
                        </td>
                        <td className="rp-mono px-2 py-2 text-right">{t.quantityAfter.toLocaleString("en-US")}</td>
                        <td className="max-w-[100px] truncate px-4 py-2 text-xs">{actorName.get(t.actorId) ?? "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ledger.length > shown.length && <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-fg)]">Showing latest {shown.length} of {ledger.length}.</p>}
          </Panel>

          <Panel title="Transaction Details" icon={FileText} action={selected && <Badge tone={KIND_TONE[selected.kind]}>{selected.kind}</Badge>}>
            {selected ? (
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-[var(--muted-fg)]">Transaction ID</dt>
                <dd className="rp-mono truncate text-xs">{selected.id}</dd>
                <dt className="text-[var(--muted-fg)]">Date &amp; time</dt>
                <dd>{selected.createdAt.toLocaleString("en-US")}</dd>
                <dt className="text-[var(--muted-fg)]">Item</dt>
                <dd>
                  <span className="rp-mono font-semibold">{selected.item.sku}</span> {"\u00b7"} {selected.item.description}
                </dd>
                <dt className="text-[var(--muted-fg)]">Quantity</dt>
                <dd className={cn("font-semibold", selected.delta > 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                  {selected.delta > 0 ? "+" : ""}
                  {selected.delta} {selected.item.unit}
                </dd>
                <dt className="text-[var(--muted-fg)]">Balance after</dt>
                <dd className="font-semibold">
                  {selected.quantityAfter} {selected.item.unit}
                </dd>
                <dt className="text-[var(--muted-fg)]">Reason</dt>
                <dd>{selected.reason}</dd>
                <dt className="text-[var(--muted-fg)]">Recorded by</dt>
                <dd>{actorName.get(selected.actorId) ?? "\u2014"}</dd>
              </dl>
            ) : (
              <p className="text-sm text-[var(--muted-fg)]">Select a transaction.</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {canTransact && items.length > 0 && (
            <Panel title="Create Transaction" icon={ArrowRightLeft}>
              <StockTransactionForm
                projectId={projectId}
                items={items.map((i) => ({ id: i.id, sku: i.sku, description: i.description, unit: i.unit, quantityOnHand: i.quantityOnHand }))}
                canReceive={access.canManageProject}
                canConsume={access.canUpdateInstall}
              />
            </Panel>
          )}

          {access.canManageProject && (
            <Panel title="Add Stock Item" icon={PackagePlus}>
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
                className="grid grid-cols-2 gap-2"
              >
                <Input name="sku" required placeholder="SKU (e.g. DAC-3M)" className="col-span-2" />
                <Input name="description" required placeholder="Description" className="col-span-2" />
                <Input name="unit" defaultValue="each" placeholder="Unit" />
                <Input name="initialQuantity" type="number" min={0} defaultValue={0} placeholder="Opening qty" />
                <Button type="submit" variant="secondary" className="col-span-2">
                  Add item
                </Button>
              </form>
            </Panel>
          )}

          <Panel title="Audit Trail (Immutable)" icon={History}>
            {audit.length === 0 ? (
              <p className="text-sm text-[var(--muted-fg)]">No stock activity yet.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {audit.map((a) => (
                  <li key={a.id} className="border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
                    <p className="line-clamp-2">{a.summary}</p>
                    <p className="text-xs text-[var(--muted-fg)]">
                      {a.actor ? a.actor.name || a.actor.email : "System"} {"\u00b7"} {a.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
