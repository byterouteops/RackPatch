import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { loadFabric, peerOf, STATUS_STYLE } from "@/lib/fabric/load";
import { ProjectPageHeader } from "@/components/project-page-header";
import { VerificationBadge } from "@/components/status-badges";
import { TopologyStats } from "@/components/topology/topology-stats";
import { TopologyView } from "@/components/topology/topology-view";
import { EmptyState } from "@/components/ui";
import { buildTopologyGraph } from "@/lib/topology/graph";

const META: Record<string, { view: "fe" | "be"; title: string; fabrics: string[]; switches: string[]; description: string }> = {
  fe: { view: "fe", title: "Front-end fabric", fabrics: ["FE", "STORAGE"], switches: ["fe-spine", "fe-leaf", "border-leaf"], description: "Spine/leaf front-end: GPU/CPU/control host access, storage clients and border leafs. Hosts are grouped by class." },
  be: { view: "be", title: "Back-end fabric", fabrics: ["BE"], switches: ["be-spine", "be-leaf"], description: "Rail-aligned GPU RDMA fabric: NIC k of every GPU server lands on the leaf for rail k. GPU servers are grouped by rack." },
};

export default async function FabricDetailPage({ params }: { params: Promise<{ projectId: string; fabric: string }> }) {
  const { projectId, fabric } = await params;
  const meta = META[fabric.toLowerCase()];
  if (!meta) notFound();
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const data = await loadFabric(projectId, project.activeRevisionId);
  const base = `/app/projects/${projectId}`;
  const links = data.links.filter((l) => l.fabric && meta.fabrics.includes(l.fabric));
  const switches = data.devices.filter((d) => d.role && meta.switches.includes(d.role)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const rails = Array.from(new Set(links.map((l) => l.rail).filter(Boolean) as string[])).sort();
  const problems = links.filter((l) => l.state === "MISMATCH" || l.state === "NEEDS_REVIEW");
  const graph = buildTopologyGraph({ view: meta.view, devices: data.devices, links: data.links });

  return (
    <div>
      <ProjectPageHeader projectId={projectId} projectName={project.name} section="Fabric" title={meta.title} description={meta.description} />
      {links.length === 0 ? (
        <EmptyState title="No cables in this fabric" description={`Set fabric = ${meta.fabrics.join(" or ")} on cables in the plan CSV.`} />
      ) : (
        <div className="space-y-6">
          <TopologyStats graph={graph} base={base} />
          <TopologyView graph={graph} base={base} />

          {rails.length > 0 && (
            <section aria-label="Rails" className="grid gap-3 md:grid-cols-2">
              {rails.map((r) => {
                const rl = links.filter((l) => l.rail === r);
                const leafs = Array.from(new Set(rl.flatMap((l) => [l.aDevice, l.zDevice]).filter((d) => data.byDevice.get(d.toLowerCase())?.role === "be-leaf")));
                const ok = rl.filter((l) => l.state === "VERIFIED_LLDP" || l.state === "VERIFIED_PHYSICAL").length;
                return (
                  <div key={r} className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <h3 className="font-bold">Rail {r}</h3>
                    <p className="text-xs text-[var(--muted-fg)]">Leafs: {leafs.join(", ") || "\u2014"}</p>
                    <p className="mt-1 text-sm">
                      <strong>{ok}</strong>/{rl.length} cables verified
                    </p>
                  </div>
                );
              })}
            </section>
          )}

          <section aria-label="Switch uplinks and downlinks">
            <h2 className="mb-2 text-base font-bold">Switch port summary</h2>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--muted)]/60 text-[var(--muted-fg)]">
                  <tr>
                    <th className="px-3 py-2">Switch</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Uplinks</th>
                    <th className="px-3 py-2">Host links</th>
                    <th className="px-3 py-2">Verified</th>
                    <th className="px-3 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {switches.map((s) => {
                    const sl = s.links.filter((l) => l.fabric && meta.fabrics.includes(l.fabric));
                    const isSwitch = (n: string) => meta.switches.includes(data.byDevice.get(n.toLowerCase())?.role ?? "");
                    const up = sl.filter((l) => isSwitch(peerOf(l, s.name).peer));
                    const ok = sl.filter((l) => l.state === "VERIFIED_LLDP" || l.state === "VERIFIED_PHYSICAL").length;
                    const bad = sl.filter((l) => l.state === "MISMATCH" || l.state === "NEEDS_REVIEW").length;
                    return (
                      <tr key={s.id} className="border-t border-[var(--border)]">
                        <td className="px-3 py-1.5 font-mono font-semibold">
                          <Link className="text-[var(--accent-ink)]" href={`${base}/racks/${encodeURIComponent(s.rack ?? "")}?device=${encodeURIComponent(s.name)}`}>{s.name}</Link>
                        </td>
                        <td className="px-3 py-1.5">{s.role}</td>
                        <td className="px-3 py-1.5">{up.length}</td>
                        <td className="px-3 py-1.5">{sl.length - up.length}</td>
                        <td className="px-3 py-1.5">{ok}/{sl.length}</td>
                        <td className="px-3 py-1.5" style={{ color: bad ? STATUS_STYLE.MISMATCH.text : undefined }}>{bad}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {problems.length > 0 && (
            <section aria-label="Problems">
              <h2 className="mb-2 text-base font-bold">Links needing action ({problems.length})</h2>
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-white text-xs">
                {problems.map((l) => (
                  <li key={l.cableId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <Link className="font-mono font-semibold text-[var(--accent-ink)]" href={`${base}/cables/${l.id}`}>{l.cableId}</Link>
                    <span className="font-mono">{l.aDevice} {l.aPort} {"\u2194"} {l.zDevice} {l.zPort}</span>
                    <VerificationBadge state={l.state as never} compact />
                    <span className="text-[var(--muted-fg)]">{l.nextAction}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
