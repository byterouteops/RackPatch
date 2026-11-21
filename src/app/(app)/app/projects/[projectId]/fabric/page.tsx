import Link from "next/link";
import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { loadFabric } from "@/lib/fabric/load";
import { FABRIC_DESIGN } from "@/lib/demo/ai-hpc/topology";
import { FabricStats, FabricTopology } from "@/components/fabric-topology";
import { ProjectPageHeader } from "@/components/project-page-header";
import { StatusLegend } from "@/components/rack-elevation";
import { EmptyState } from "@/components/ui";

export default async function FabricPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const data = await loadFabric(projectId, project.activeRevisionId);
  const base = `/app/projects/${projectId}`;
  const fabrics = Array.from(new Set(data.links.map((l) => l.fabric).filter(Boolean) as string[])).sort();
  const switchFabrics = fabrics.filter((f) => f === "FE" || f === "BE" || f === "EXT");

  return (
    <div>
      <ProjectPageHeader projectId={projectId} projectName={project.name} section="Fabric" title="Fabric topology" description="Spine/leaf and edge topology drawn from the published cable plan. Line colour = worst verification state of the cables between two devices." />
      {fabrics.length === 0 ? (
        <EmptyState title="No fabric data" description="Add a 'fabric' column (FE, BE, OOB, EXT, STORAGE, PATCH) to the cable plan CSV and set device roles to draw the topology." action={<Link className="text-sm font-semibold text-[var(--accent-ink)]" href={`${base}/plan`}>Import plan</Link>} />
      ) : (
        <div className="space-y-6">
          <StatusLegend />
          <FabricTopology devices={data.devices} links={data.links} fabrics={switchFabrics} includeHosts={false} hrefForDevice={(n) => `${base}/trace?from=${encodeURIComponent(n)}`} />
          {fabrics.map((f) => (
            <section key={f} className="space-y-2" aria-label={`${f} fabric`}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold">{project.isDemo && FABRIC_DESIGN[f]?.name ? FABRIC_DESIGN[f].name : f}</h2>
                {(f === "FE" || f === "BE") && (
                  <Link href={`${base}/fabric/${f.toLowerCase()}`} className="text-xs font-semibold text-[var(--accent-ink)]">
                    Open {f} detail
                  </Link>
                )}
              </div>
              <FabricStats links={data.links} fabric={f} base={base} />
              {project.isDemo && FABRIC_DESIGN[f] && (
                <div className="rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--muted)]/40 p-3 text-xs">
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {Object.entries(FABRIC_DESIGN[f])
                      .filter(([k]) => k !== "name")
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="w-28 shrink-0 font-semibold capitalize text-[var(--muted-fg)]">{k.replace(/([A-Z])/g, " $1")}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                  </dl>
                  <p className="mt-1 text-[11px] text-[var(--warning-ink)]">{"Design metadata (synthetic). RackPatch verifies physical cabling only \u2014 not routing, BGP, PFC/ECN or RDMA performance."}</p>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
