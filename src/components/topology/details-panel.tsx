"use client";

import Link from "next/link";
import { Route, X } from "lucide-react";
import { worst, type LinkStatus } from "@/lib/fabric/load";
import { STATUS_KEYS, type TopoBundle, type TopoCable, type TopoNode } from "@/lib/topology/graph";
import { STATUS_STYLE } from "@/lib/fabric/load";
import { StatusPill, humanize } from "@/components/topology/status";

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : null);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 py-0.5">
      <dt className="text-[var(--muted-fg)]">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function CableCard({ c, from, base }: { c: TopoCable; from?: string; base: string }) {
  const local = !from || c.a === from ? { dev: c.a, port: c.aPort } : { dev: c.z, port: c.zPort };
  const peer = local.dev === c.a ? { dev: c.z, port: c.zPort } : { dev: c.a, port: c.aPort };
  const problem = c.state === "MISMATCH" || c.state === "NEEDS_REVIEW";
  return (
    <li className="rounded-lg border border-[var(--border)] bg-white p-3 text-xs" data-testid="topo-cable-card" data-cable={c.cableId}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${base}/cables/${c.id}`} className="font-mono text-[12.5px] font-bold text-[var(--accent-ink)] hover:underline">
          {c.cableId}
        </Link>
        <StatusPill state={c.state} />
      </div>
      <p className="mt-1.5 font-mono text-[11.5px] text-[var(--foreground)]">
        {local.dev} <span className="text-[var(--muted-fg)]">{local.port}</span> {"\u2192"} {peer.dev} <span className="text-[var(--muted-fg)]">{peer.port}</span>
      </p>
      <dl className="mt-1.5">
        <Row label="Cable">{[c.cableType, c.speed, c.media, c.lengthM != null ? `${c.lengthM} m` : null, c.fabric, c.rail ? `rail ${c.rail}` : null].filter(Boolean).join(" \u00b7 ") || "\u2014"}</Row>
        <Row label="Install">{humanize(c.installStatus) || "\u2014"}</Row>
        <Row label="Planned">{c.expectedSummary ?? `${peer.dev} ${peer.port}`}</Row>
        <Row label="Discovered">{c.observedSummary ?? <span className="text-[var(--muted-fg)]">No LLDP/CDP neighbor observed</span>}</Row>
        <Row label="Evidence">
          {c.evidenceSource ? `${c.evidenceSource}${c.captureTime ? ` \u00b7 ${fmtTime(c.captureTime)}` : ""}` : <span className="text-[var(--muted-fg)]">No capture</span>}
          {c.observedSides ? ` \u00b7 sides ${c.observedSides}` : ""}
        </Row>
        <Row label="Physical">
          {c.physical ? (
            `Checked ${fmtTime(c.physical.verifiedAt)} \u00b7 A ${c.physical.aConfirmed ? "confirmed" : "NOT confirmed"} \u00b7 Z ${c.physical.zConfirmed ? "confirmed" : "NOT confirmed"}`
          ) : (
            <span className="text-[var(--muted-fg)]">Not physically verified</span>
          )}
        </Row>
      </dl>
      {problem && (
        <p className="mt-1.5 rounded-md px-2 py-1 text-[11.5px]" style={{ background: STATUS_STYLE[c.state === "MISMATCH" ? "MISMATCH" : "NEEDS_REVIEW"].fill, color: STATUS_STYLE[c.state === "MISMATCH" ? "MISMATCH" : "NEEDS_REVIEW"].text }}>
          <strong>{humanize(c.findingType) || humanize(c.state)}:</strong> {c.nextAction ?? "Review the evidence for this cable."}
          {c.relatedCableId ? ` Related cable: ${c.relatedCableId}.` : ""}
        </p>
      )}
    </li>
  );
}

export function DevicePanel({
  node,
  cables,
  base,
  onClose,
  onSelectDevice,
}: {
  node: TopoNode;
  cables: TopoCable[];
  base: string;
  onClose: () => void;
  onSelectDevice: (id: string) => void;
}) {
  const total = cables.length;
  const verified = node.counts.VERIFIED_LLDP + node.counts.VERIFIED_PHYSICAL;
  const peers = new Map<string, { n: number; status: LinkStatus }>();
  for (const c of cables) {
    const p = c.a === node.id ? c.z : c.a;
    const cur = peers.get(p);
    peers.set(p, { n: (cur?.n ?? 0) + 1, status: cur ? worst(cur.status, c.state) : c.state });
  }
  const sorted = [...cables].sort((x, y) => {
    const px = x.a === node.id ? x.aPort : x.zPort;
    const py = y.a === node.id ? y.aPort : y.zPort;
    return px.localeCompare(py, undefined, { numeric: true });
  });
  return (
    <section aria-label={`Device ${node.name}`} className="flex h-full flex-col" data-testid="topo-device-panel">
      <header className="flex items-start gap-2 border-b border-[var(--border)] p-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-base font-bold text-[var(--foreground)]">{node.name}</h3>
          <p className="text-xs text-[var(--muted-fg)]">{node.role ?? "Role not set"} {"\u00b7"} {node.groupLabel}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 hover:bg-[var(--muted)]">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div>
          <p className="font-semibold text-[var(--foreground)]" data-testid="topo-device-verified">
            {verified}/{total} interfaces verified
          </p>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden>
            {STATUS_KEYS.map((k) => (node.counts[k] ? <span key={k} style={{ width: `${(node.counts[k] / Math.max(1, total)) * 100}%`, background: STATUS_STYLE[k].stroke }} /> : null))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted-fg)]">
            {STATUS_KEYS.filter((k) => node.counts[k]).map((k) => `${node.counts[k]} ${STATUS_STYLE[k].label.toLowerCase()}`).join(" \u00b7 ")}
          </p>
        </div>
        <dl>
          <Row label="Rack">{node.rack ? `${node.rack}${node.rackUnit != null ? ` \u00b7 U${node.rackUnit}` : ""}` : "Not placed"}</Row>
          <Row label="Hardware">{[node.vendor, node.model].filter(Boolean).join(" \u00b7 ") || "\u2014"}</Row>
          <Row label="Mgmt IP">{node.mgmtIp ?? <span className="text-[var(--muted-fg)]">Not recorded</span>}</Row>
          {!node.inInventory && <Row label="Inventory">Not in device inventory (name taken from the cable plan)</Row>}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/trace?from=${encodeURIComponent(node.name)}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 font-semibold text-[var(--accent-ink)] hover:border-[var(--accent)]">
            <Route className="h-3.5 w-3.5" aria-hidden /> Trace from this device
          </Link>
          {node.rack && (
            <Link href={`${base}/racks/${encodeURIComponent(node.rack)}?device=${encodeURIComponent(node.name)}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 font-semibold text-[var(--accent-ink)] hover:border-[var(--accent)]">
              Open rack {node.rack}
            </Link>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Connected devices ({peers.size})</h4>
          <ul className="flex flex-wrap gap-1.5">
            {[...peers.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([p, v]) => (
              <li key={p}>
                <button type="button" onClick={() => onSelectDevice(p)} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] hover:shadow-sm" style={{ borderColor: STATUS_STYLE[v.status === "NONE" ? "AWAITING" : v.status].stroke }}>
                  {p}
                  {v.n > 1 && <span className="text-[var(--muted-fg)]">{"\u00d7"}{v.n}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Interfaces ({total})</h4>
          <ul className="space-y-2">
            {sorted.map((c) => (
              <CableCard key={c.id} c={c} from={node.id} base={base} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function GroupPanel({
  node,
  members,
  onClose,
  onSelectDevice,
  onExpand,
}: {
  node: TopoNode;
  members: TopoNode[];
  onClose: () => void;
  onSelectDevice: (id: string) => void;
  onExpand: () => void;
}) {
  const total = node.cableIds.length;
  const verified = node.counts.VERIFIED_LLDP + node.counts.VERIFIED_PHYSICAL;
  return (
    <section aria-label={`Group ${node.name}`} className="flex h-full flex-col" data-testid="topo-group-panel">
      <header className="flex items-start gap-2 border-b border-[var(--border)] p-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[var(--foreground)]">{node.name}</h3>
          <p className="text-xs text-[var(--muted-fg)]">
            {members.length} devices drawn as one group {"\u00b7"} {verified}/{total} cables verified
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 hover:bg-[var(--muted)]">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <button type="button" onClick={onExpand} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
          Expand group on the diagram
        </button>
        <ul className="space-y-1.5">
          {members.map((m) => {
            const v = m.counts.VERIFIED_LLDP + m.counts.VERIFIED_PHYSICAL;
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onSelectDevice(m.id)} className="flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-left hover:border-[var(--accent)]">
                  <span className="min-w-0 flex-1 truncate font-mono font-semibold">{m.name}</span>
                  <span className="tabular-nums text-[var(--muted-fg)]">
                    {v}/{m.cableIds.length}
                  </span>
                  <StatusPill state={m.status} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function BundlePanel({ bundle, cables, base, onClose, nameOf = (id) => id }: { bundle: TopoBundle; cables: TopoCable[]; base: string; onClose: () => void; nameOf?: (id: string) => string }) {
  return (
    <section aria-label={`Cables ${nameOf(bundle.a)} to ${nameOf(bundle.z)}`} className="flex h-full flex-col" data-testid="topo-bundle-panel">
      <header className="flex items-start gap-2 border-b border-[var(--border)] p-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-sm font-bold text-[var(--foreground)]">
            {nameOf(bundle.a)} {"\u2194"} {nameOf(bundle.z)}
          </h3>
          <p className="text-xs text-[var(--muted-fg)]">
            {cables.length} physical cable{cables.length === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 hover:bg-[var(--muted)]">
          <X className="h-4 w-4" />
        </button>
      </header>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {cables.map((c) => (
          <CableCard key={c.id} c={c} from={bundle.a} base={base} />
        ))}
      </ul>
    </section>
  );
}
