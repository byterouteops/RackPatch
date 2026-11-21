import Link from "next/link";
import { Lock, Route } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { loadFabric, peerOf, tracePath, type FabricLink } from "@/lib/fabric/load";
import { ProjectPageHeader } from "@/components/project-page-header";
import { VerificationBadge } from "@/components/status-badges";
import { Button, EmptyState, Input } from "@/components/ui";

function Hop({ l, from, base, panels }: { l: FabricLink; from: string; base: string; panels: string[] }) {
  const p = peerOf(l, from);
  return (
    <li className="relative rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{from}</span>
        <span className="font-mono text-[var(--muted-fg)]">{p.port}</span>
        <span aria-hidden className="text-[var(--muted-fg)]">{"\u2192"}</span>
        <Link className="font-mono font-bold text-[var(--accent-ink)]" href={`${base}/cables/${l.id}`}>{l.cableId}</Link>
        <span aria-hidden className="text-[var(--muted-fg)]">{"\u2192"}</span>
        <span className="font-mono font-semibold">{p.peer}</span>
        <span className="font-mono text-[var(--muted-fg)]">{p.peerPort}</span>
        <span className="ml-auto">{l.state !== "NONE" && <VerificationBadge state={l.state} compact />}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-fg)]">
        {[l.fabric, l.speed, l.media, l.lengthM != null ? `${l.lengthM} m` : null, l.rail ? `rail ${l.rail}` : null].filter(Boolean).join(" \u00b7 ")}
        {panels.length > 0 && ` \u00b7 via ${panels.join(", ")}`}
      </p>
      {l.observedSummary && <p className="mt-1 text-xs">Observed: {l.observedSummary}</p>}
      {l.nextAction && l.state !== "VERIFIED_LLDP" && l.state !== "VERIFIED_PHYSICAL" && <p className="mt-0.5 text-xs text-[var(--warning-ink)]">Next: {l.nextAction}</p>}
    </li>
  );
}

export default async function TracePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ from?: string; port?: string; to?: string; cable?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const data = await loadFabric(projectId, project.activeRevisionId);
  const base = `/app/projects/${projectId}`;
  const from = (sp.from ?? "").trim();
  const to = (sp.to ?? "").trim();
  const port = (sp.port ?? "").trim().toLowerCase();
  const cable = (sp.cable ?? "").trim().toLowerCase();

  const fromDev = from ? data.byDevice.get(from.toLowerCase()) : undefined;
  let mode: "cable" | "path" | "device" | null = null;
  let hops: Array<{ l: FabricLink; from: string }> = [];
  let error: string | null = null;
  let oobOnly = false;

  if (cable) {
    const l = data.links.find((x) => x.cableId.toLowerCase() === cable);
    if (l) {
      mode = "cable";
      hops = [{ l, from: l.aDevice }];
    } else error = `No cable ${sp.cable} in the active plan.`;
  } else if (from && to) {
    const dataPath = tracePath(data.links, from, to);
    const path = dataPath ?? tracePath(data.links, from, to, "oob");
    oobOnly = !dataPath && Boolean(path);
    if (path) {
      mode = "path";
      let cur = data.byDevice.get(from.toLowerCase())?.name ?? from;
      hops = path.map((l) => {
        const h = { l, from: cur };
        cur = peerOf(l, cur).peer;
        return h;
      });
    } else error = `No cabled path from ${from} to ${to} on the data fabrics or the management network.`;
  } else if (fromDev) {
    mode = "device";
    hops = fromDev.links
      .filter((l) => !port || peerOf(l, fromDev.name).port.toLowerCase() === port)
      .sort((a, b) => peerOf(a, fromDev.name).port.localeCompare(peerOf(b, fromDev.name).port, undefined, { numeric: true }))
      .map((l) => ({ l, from: fromDev.name }));
    if (!hops.length) error = port ? `${fromDev.name} ${sp.port} has no planned cable.` : `${fromDev.name} has no planned cables.`;
  } else if (from) {
    error = `Unknown device ${from}.`;
  }

  const ids = hops.map((h) => h.l.id);
  const panelPorts = ids.length
    ? await prisma.panelPort.findMany({ where: { plannedLinkId: { in: ids } }, select: { plannedLinkId: true, portIndex: true, side: true, panel: { select: { name: true } } } })
    : [];
  const panelsFor = (id: string) => panelPorts.filter((p) => p.plannedLinkId === id).map((p) => `${p.panel.name}:${p.portIndex}${p.side ? ` (${p.side})` : ""}`);
  const deviceNames = data.devices.map((d) => d.name);

  return (
    <div>
      <ProjectPageHeader projectId={projectId} projectName={project.name} section="Fabric" title="Path trace" description="Follow a device, port or cable end-to-end, or find the cabled path between two devices." />
      <form className="mb-5 grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]" action={base + "/trace"}>
        <label className="text-xs font-semibold">
          From device
          <Input name="from" list="trace-devices" defaultValue={from} placeholder="e.g. GPU-08A" data-hint="Start device (hostname as in the plan)." />
        </label>
        <label className="text-xs font-semibold">
          Port (optional)
          <Input name="port" defaultValue={sp.port ?? ""} placeholder="e.g. ens5np0" data-hint="Limit the trace to one interface on the start device." />
        </label>
        <label className="text-xs font-semibold">
          To device (optional)
          <Input name="to" list="trace-devices" defaultValue={to} placeholder="e.g. BE-SPINE-01" data-hint="Find the shortest cabled path to this device." />
        </label>
        <label className="text-xs font-semibold">
          or Cable ID
          <Input name="cable" defaultValue={sp.cable ?? ""} placeholder="e.g. CBL-BE-0017" data-hint="Trace a single cable, including patch-panel hops." />
        </label>
        <div className="flex items-end">
          <Button type="submit" size="md" className="w-full">
            <Route className="h-4 w-4" aria-hidden /> Trace
          </Button>
        </div>
        <datalist id="trace-devices">
          {deviceNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </form>

      {error && <p className="mb-4 rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">{error}</p>}
      {!mode && !error && <EmptyState icon={<Route className="h-5 w-5" aria-hidden />} title="Start a trace" description="Enter a device (and optionally a port or destination), or a cable ID. Tip: open a device from a rack elevation and choose 'Trace from this device'." />}
      {mode && (
        <>
          <p className="mb-2 text-sm text-[var(--muted-fg)]">
            {mode === "path"
              ? `${hops.length} hop(s) from ${from} to ${to}${oobOnly ? " \u2014 management (OOB) network only; no data-fabric path is cabled" : ""}`
              : mode === "cable"
                ? "Single cable"
                : `${hops.length} cable(s) on ${fromDev?.name}`}
          </p>
          <ol className="space-y-2">
            {hops.map((h) => (
              <Hop key={h.l.cableId + h.from} l={h.l} from={h.from} base={base} panels={panelsFor(h.l.id)} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
