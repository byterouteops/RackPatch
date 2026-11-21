import { createHash } from "crypto";
import Link from "next/link";
import { FileSearch, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { normalizePort } from "@/lib/csv/normalize";
import { SNAPSHOTS, SNAPSHOT_META, evidenceFiles, type Snapshot } from "@/lib/demo/ai-hpc/evidence";
import { isSnapshot } from "@/lib/demo/playback";
import { loadFabric, peerOf } from "@/lib/fabric/load";
import { FINDING_LABELS } from "@/lib/verify/evaluate";
import { ProjectPageHeader } from "@/components/project-page-header";
import { SnapshotPlayback } from "@/components/snapshot-playback";
import { VerificationBadge } from "@/components/status-badges";
import { Badge, EmptyState, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

type SP = { device?: string; fabric?: string; vendor?: string; snapshot?: string; status?: string; import?: string; cmd?: string };

const slug = (cmd: string) => cmd.replace(/[^a-z0-9]+/gi, "-");

export default async function EvidenceExplorerPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<SP> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const base = `/app/projects/${projectId}/evidence/explorer`;
  const playback = project.isDemo && !!project.demoEvidenceSnapshot;
  const viewSnapshot: Snapshot | null = playback ? (isSnapshot(sp.snapshot) ? sp.snapshot : (project.demoEvidenceSnapshot as Snapshot)) : null;
  const isActiveView = !playback || viewSnapshot === project.demoEvidenceSnapshot;

  const [imports, fabric] = await Promise.all([
    prisma.evidenceImport.findMany({
      where: playback ? { projectId, synthetic: true, demoSnapshot: viewSnapshot } : { projectId, synthetic: false },
      orderBy: [{ sourceDevice: "asc" }, { uploadedAt: "desc" }],
      take: 500,
      select: {
        id: true, sourceDevice: true, filename: true, rawTextHash: true, formatId: true, osProfile: true, kind: true, parseFailed: true, parseError: true, parseWarnings: true, captureTime: true, uploadedAt: true, synthetic: true, demoSnapshot: true,
        _count: { select: { observations: true, interfaceStates: true } },
      },
    }),
    loadFabric(projectId, project.activeRevisionId),
  ]);

  const deviceFabrics = (name: string) => Array.from(new Set((data(name)?.links ?? []).map((l) => l.fabric).filter(Boolean) as string[]));
  function data(name: string) {
    return fabric.byDevice.get(name.toLowerCase());
  }
  const issuesOn = (name: string) => (data(name)?.links ?? []).filter((l) => l.state === "MISMATCH" || l.state === "NEEDS_REVIEW").length;
  const vendorOf = (i: (typeof imports)[number]) => data(i.sourceDevice)?.vendor ?? i.osProfile ?? "Unknown";

  const allFabrics = Array.from(new Set(imports.flatMap((i) => deviceFabrics(i.sourceDevice)))).sort();
  const allVendors = Array.from(new Set(imports.map(vendorOf))).sort();
  const q = (sp.device ?? "").trim().toLowerCase();
  const rows = imports.filter((i) => {
    if (q && !i.sourceDevice.toLowerCase().includes(q)) return false;
    if (sp.fabric && !deviceFabrics(i.sourceDevice).includes(sp.fabric)) return false;
    if (sp.vendor && vendorOf(i) !== sp.vendor) return false;
    if (sp.status === "failed" && !i.parseFailed) return false;
    if (sp.status === "issues" && !issuesOn(i.sourceDevice)) return false;
    if (sp.status === "ok" && (i.parseFailed || issuesOn(i.sourceDevice))) return false;
    return true;
  });
  const selected = imports.find((i) => i.id === sp.import) ?? rows.find((i) => i.kind === "NEIGHBOR") ?? rows[0] ?? null;

  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...o })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  const observations = selected
    ? await prisma.observation.findMany({ where: { evidenceImportId: selected.id }, orderBy: { localInterface: "asc" } })
    : [];
  const states = selected && selected.kind === "INTERFACE_STATE" ? await prisma.interfaceStateObservation.findMany({ where: { evidenceImportId: selected.id } }) : [];
  const selDev = selected ? data(selected.sourceDevice) : undefined;
  const obsByPort = new Map(observations.map((o) => [o.localInterfaceNorm, o]));
  const expected = selDev
    ? [...selDev.links].sort((a, b) => peerOf(a, selDev.name).port.localeCompare(peerOf(b, selDev.name).port, undefined, { numeric: true }))
    : [];

  const files = selected && playback && viewSnapshot ? evidenceFiles(viewSnapshot).filter((f) => f.device === selected.sourceDevice) : [];
  const importedFile = selected ? files.find((f) => selected.filename?.endsWith(`__${slug(f.command)}.txt`)) : undefined;
  const shownFile = files.find((f) => slug(f.command) === sp.cmd) ?? importedFile ?? files[0];
  const hashOk = importedFile && selected ? createHash("sha256").update(importedFile.text).digest("hex") === selected.rawTextHash : null;

  return (
    <div>
      <ProjectPageHeader projectId={projectId} projectName={project.name} section="Evidence" title="Evidence explorer" description="Raw neighbor captures, what RackPatch parsed from them, and how each port compares with the plan." />

      {playback && (
        <div className="mb-4">
          <SnapshotPlayback
            projectId={projectId}
            active={project.demoEvidenceSnapshot}
            canSwitch={access.canImportEvidence}
            snapshots={SNAPSHOTS.map((s) => ({ id: s, label: SNAPSHOT_META[s].label, explain: SNAPSHOT_META[s].explain, capture: SNAPSHOT_META[s].capture }))}
          />
        </div>
      )}

      <form action={base} className="mb-4 grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 sm:grid-cols-6">
        <input name="device" defaultValue={sp.device ?? ""} placeholder="Device" aria-label="Filter by device" data-hint="Part of a device name, e.g. LEAF or GPU-09." className="h-9 rounded-md border border-[var(--border)] px-2 text-sm" />
        <Select name="fabric" defaultValue={sp.fabric ?? ""} aria-label="Filter by fabric" className="h-9" data-hint="Only devices with cables in this fabric.">
          <option value="">All fabrics</option>
          {allFabrics.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
        <Select name="vendor" defaultValue={sp.vendor ?? ""} aria-label="Filter by vendor" className="h-9" data-hint="Vendor profile of the source device (fictional models).">
          <option value="">All vendors</option>
          {allVendors.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
        {playback ? (
          <Select name="snapshot" defaultValue={viewSnapshot ?? ""} aria-label="Snapshot to view" className="h-9" data-hint="View another snapshot's captures without changing what verification uses.">
            {SNAPSHOTS.map((s) => (
              <option key={s} value={s}>
                {SNAPSHOT_META[s].label}
                {s === project.demoEvidenceSnapshot ? " (active)" : ""}
              </option>
            ))}
          </Select>
        ) : (
          <span />
        )}
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Filter by status" className="h-9" data-hint="Parsed OK, failed to parse, or devices with open mismatches/review items.">
          <option value="">Any status</option>
          <option value="ok">Parsed, no issues</option>
          <option value="issues">Has open issues</option>
          <option value="failed">Parse failed</option>
        </Select>
        <button type="submit" className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm font-semibold text-white">
          Apply filters
        </button>
      </form>

      {!isActiveView && (
        <p className="mb-3 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs">
          {`Viewing ${viewSnapshot} captures. Verification results below the raw output reflect the active snapshot (${project.demoEvidenceSnapshot}).`}
        </p>
      )}

      {imports.length === 0 ? (
        <EmptyState icon={<FileSearch className="h-5 w-5" aria-hidden />} title="No evidence yet" description="Import LLDP/CDP output on the LLDP page or run a collection job; captures appear here with their parsed neighbors." action={<Link className="text-sm font-semibold text-[var(--accent)]" href={`/app/projects/${projectId}/lldp`}>Import evidence</Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ul className="max-h-[72vh] divide-y divide-[var(--border)] overflow-auto rounded-lg border border-[var(--border)] bg-white text-xs" aria-label="Captures">
            {rows.length === 0 && <li className="p-3 text-[var(--muted-fg)]">No captures match these filters.</li>}
            {rows.map((i) => {
              const n = issuesOn(i.sourceDevice);
              return (
                <li key={i.id}>
                  <Link href={qs({ import: i.id, cmd: undefined })} className={cn("block px-3 py-2 hover:bg-[var(--muted)]", selected?.id === i.id && "bg-[var(--accent-soft)]")}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold">{i.sourceDevice}</span>
                      {i.synthetic && <Badge tone="warning">SYNTHETIC</Badge>}
                      {i.parseFailed ? <Badge tone="danger">Parse failed</Badge> : n > 0 ? <Badge tone="danger">{n} issue(s)</Badge> : <Badge tone="success">OK</Badge>}
                    </div>
                    <div className="mt-0.5 text-[var(--muted-fg)]">
                      {[i.kind === "INTERFACE_STATE" ? "Interface status" : i.formatId ?? "neighbors", vendorOf(i), i.kind === "INTERFACE_STATE" ? `${i._count.interfaceStates} ports` : `${i._count.observations} neighbors`].join(" \u00b7 ")}
                    </div>
                    <div className="text-[var(--muted-fg)]">Captured {(i.captureTime ?? i.uploadedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0 space-y-4">
            {!selected ? (
              <EmptyState title="Select a capture" description="Pick a device capture on the left to see raw output, parsed neighbors and expected vs observed." />
            ) : (
              <>
                <section className="rounded-lg border border-[var(--border)] bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold">{selected.sourceDevice}</h2>
                    <span className="text-xs text-[var(--muted-fg)]">{selected.filename}</span>
                    {selected.parseError && <Badge tone="danger">{selected.parseError}</Badge>}
                    {hashOk === true && <Badge tone="success">SHA-256 matches stored capture</Badge>}
                    {hashOk === false && <Badge tone="danger">Raw text differs from stored capture (reseed demo)</Badge>}
                  </div>
                  {files.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {files.map((f) => (
                        <Link key={f.command} href={qs({ cmd: slug(f.command) })} className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", shownFile === f ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)]")}>
                          {f.command}
                          {f.importForVerification ? " \u2022" : ""}
                        </Link>
                      ))}
                    </div>
                  )}
                  {shownFile ? (
                    <pre className="max-h-[340px] overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-snug text-slate-100" aria-label="Raw CLI output">{shownFile.text}</pre>
                  ) : (
                    <p className="text-xs text-[var(--muted-fg)]">Raw text is not stored for uploaded captures (only its SHA-256). Parsed rows and source excerpts are shown below.</p>
                  )}
                  {files.length > 0 && <p className="mt-1 text-[11px] text-[var(--muted-fg)]">{"\u2022 = imported for verification. Other commands are shown for reference (summary/CDP views)."}</p>}
                  {selected.parseWarnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-[var(--warning-ink)]">
                      {selected.parseWarnings.slice(0, 8).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </section>

                {selected.kind === "INTERFACE_STATE" ? (
                  <section className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <h3 className="mb-2 text-sm font-bold">Parsed interface status ({states.length})</h3>
                    <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
                      {states
                        .sort((a, b) => a.port.localeCompare(b.port, undefined, { numeric: true }))
                        .map((s) => (
                          <span key={s.id} className={cn("rounded border px-2 py-0.5 font-mono", s.operState === "up" ? "border-green-300 bg-green-50" : "border-slate-200 text-[var(--muted-fg)]")}>
                            {s.port} {s.operState} {s.speed ?? ""}
                          </span>
                        ))}
                    </div>
                  </section>
                ) : (
                  <section className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <h3 className="mb-2 text-sm font-bold">Expected vs observed on {selected.sourceDevice}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[var(--muted-fg)]">
                          <tr>
                            <th className="py-1 pr-2">Local port</th>
                            <th className="py-1 pr-2">Expected (plan)</th>
                            <th className="py-1 pr-2">Observed (this capture)</th>
                            <th className="py-1 pr-2">Result</th>
                            <th className="py-1">Cable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expected.map((l) => {
                            const p = peerOf(l, selDev!.name);
                            const o = obsByPort.get(normalizePort(p.port));
                            const label = l.findingType ? FINDING_LABELS[l.findingType as keyof typeof FINDING_LABELS]?.label : null;
                            return (
                              <tr key={l.cableId} className="border-t border-[var(--border)] align-top">
                                <td className="py-1 pr-2 font-mono">{p.port}</td>
                                <td className="py-1 pr-2 font-mono">{p.peer} {p.peerPort}</td>
                                <td className="py-1 pr-2 font-mono">{o ? `${o.remoteSystemName ?? "?"} ${o.remotePortId ?? ""}` : <span className="text-[var(--muted-fg)]">none</span>}</td>
                                <td className="py-1 pr-2">
                                  {l.state !== "NONE" && <VerificationBadge state={l.state} compact />}
                                  {label && <span className="ml-1 text-[var(--muted-fg)]">{label}</span>}
                                </td>
                                <td className="py-1 font-mono">
                                  <Link className="text-[var(--accent)]" href={`/app/projects/${projectId}/cables/${l.id}`}>{l.cableId}</Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {observations.filter((o) => !expected.some((l) => normalizePort(peerOf(l, selDev!.name).port) === o.localInterfaceNorm)).length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-bold">Neighbors on ports with no planned cable</h4>
                        <ul className="mt-1 text-xs">
                          {observations
                            .filter((o) => !expected.some((l) => normalizePort(peerOf(l, selDev!.name).port) === o.localInterfaceNorm))
                            .map((o) => (
                              <li key={o.id} className="font-mono">
                                {o.localInterface} {"\u2192"} {o.remoteSystemName} {o.remotePortId}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
