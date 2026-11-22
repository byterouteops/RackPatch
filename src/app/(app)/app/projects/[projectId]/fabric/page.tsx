import Link from "next/link";
import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { loadFabric } from "@/lib/fabric/load";
import { FABRIC_DESIGN } from "@/lib/demo/ai-hpc/topology";
import { FabricStats } from "@/components/fabric-topology";
import { ProjectPageHeader } from "@/components/project-page-header";
import { TopologyStats } from "@/components/topology/topology-stats";
import { TopologyView } from "@/components/topology/topology-view";
import { EmptyState } from "@/components/ui";
import { buildTopologyGraph } from "@/lib/topology/graph";

export default async function FabricPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const data = await loadFabric(projectId, project.activeRevisionId);
  const base = `/app/projects/${projectId}`;
  const fabrics = Array.from(new Set(data.links.map((l) => l.fabric).filter(Boolean) as string[])).sort();
  const graph = buildTopologyGraph({ view: "full", devices: data.devices, links: data.links });
  const offView = data.links.length - graph.cables.length;

  return (
    <div>
      <ProjectPageHeader projectId={projectId} projectName={project.name} section="Fabric" title="Fabric topology" description="External, spine, leaf and host tiers drawn from the published cable plan. Every physical cable is kept; parallel cables are bundled and can be expanded." />
      {graph.cables.length === 0 ? (
        <EmptyState title="No fabric data" description="Publish a cable plan to draw the topology. Add a 'fabric' column (FE, BE, OOB, EXT, STORAGE, PATCH) and device roles for the best grouping." action={<Link className="text-sm font-semibold text-[var(--accent-ink)]" href={`${base}/plan`}>Import plan</Link>} />
      ) : (
        <div className="space-y-6">
          <TopologyStats graph={graph} base={base} />
          <TopologyView graph={graph} base={base} />
          {offView > 0 && (
            <p className="text-xs text-[var(--muted-fg)]">
              {offView} management (OOB) and patch-panel cable{offView === 1 ? " is" : "s are"} not part of the data-fabric drawing; see{" "}
              <Link className="font-semibold text-[var(--accent-ink)]" href={`${base}/cables`}>Cable Plan</Link> or trace them on the{" "}
              <Link className="font-semibold text-[var(--accent-ink)]" href={`${base}/trace`}>Trace</Link> tab.
            </p>
          )}
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
