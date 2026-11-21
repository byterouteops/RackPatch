import Link from "next/link";
import { Lock, Server } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { loadFabric, STATUS_STYLE, worst, type LinkStatus } from "@/lib/fabric/load";
import { ProjectPageHeader } from "@/components/project-page-header";
import { RackElevation, StatusLegend } from "@/components/rack-elevation";
import { EmptyState } from "@/components/ui";

export default async function RacksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const data = await loadFabric(projectId, project.activeRevisionId);

  const rackNames = data.racks.length
    ? data.racks
    : Array.from(new Set(data.devices.map((d) => d.rack).filter(Boolean) as string[]))
        .sort()
        .map((name, i) => ({ name, heightU: 42, purpose: null, position: i + 1 }));

  return (
    <div>
      <ProjectPageHeader projectId={projectId} projectName={project.name} section="Fabric" title="Rack elevations" description="Devices placed by rack unit, coloured by the worst verification state of their cables." />
      <div className="mb-4">
        <StatusLegend />
      </div>
      {rackNames.length === 0 ? (
        <EmptyState
          icon={<Server className="h-5 w-5" aria-hidden />}
          title="No racks yet"
          description="Racks appear when devices have a rack and rack unit. Sync port inventory from the plan, then set rack units on the Inventory page."
          action={<Link className="text-sm font-semibold text-[var(--accent-ink)]" href={`/app/projects/${projectId}/inventory`}>Open inventory</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {rackNames.map((r) => {
            const devs = data.devices.filter((d) => d.rack === r.name);
            const cables = new Set(devs.flatMap((d) => d.links.map((l) => l.cableId)));
            const status = devs.reduce<LinkStatus>((acc, d) => (acc === "NONE" ? d.status : d.status === "NONE" ? acc : worst(acc, d.status)), "NONE");
            const used = devs.reduce((n, d) => n + (d.uHeight ?? 0), 0);
            return (
              <Link key={r.name} href={`/app/projects/${projectId}/racks/${encodeURIComponent(r.name)}`} className="group rounded-lg border border-[var(--border)] bg-white p-2 shadow-sm transition hover:border-[var(--accent)] rp-focus">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{r.name}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[status].stroke }} title={STATUS_STYLE[status].label} />
                </div>
                <p className="mb-2 truncate text-[11px] text-[var(--muted-fg)]">{r.purpose ?? "\u00a0"}</p>
                <div className="flex justify-center">
                  <RackElevation name={r.name} heightU={r.heightU} devices={devs} compact />
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted-fg)]">
                  {`${devs.length} devices \u00b7 ${used}/${r.heightU}U \u00b7 ${cables.size} cables`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
