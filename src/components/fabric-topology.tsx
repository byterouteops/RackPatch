import Link from "next/link";
import { STATUS_STYLE, worst, type FabricDevice, type FabricLink, type LinkStatus } from "@/lib/fabric/load";

const TIERS: Array<{ label: string; roles: string[] }> = [
  { label: "External", roles: ["router", "firewall"] },
  { label: "Spine", roles: ["fe-spine", "be-spine"] },
  { label: "Leaf", roles: ["border-leaf", "fe-leaf", "be-leaf"] },
  { label: "Hosts", roles: ["gpu", "cpu", "controller", "storage"] },
];

type Edge = { a: string; z: string; count: number; status: LinkStatus; speed: string | null; cables: string[] };

/** Layered spine/leaf drawing derived only from planned cables and device roles. */
export function FabricTopology({
  devices,
  links,
  fabrics,
  includeHosts,
  hrefForDevice,
}: {
  devices: FabricDevice[];
  links: FabricLink[];
  fabrics: string[];
  includeHosts: boolean;
  hrefForDevice: (name: string) => string;
}) {
  const scoped = links.filter((l) => l.fabric && fabrics.includes(l.fabric));
  const tierOf = (role: string | null) => TIERS.findIndex((t) => role && t.roles.includes(role));
  const involved = new Set(scoped.flatMap((l) => [l.aDevice, l.zDevice]));
  const nodes = devices.filter((d) => involved.has(d.name) && tierOf(d.role) >= 0 && (includeHosts || tierOf(d.role) < 3));
  const nodeSet = new Set(nodes.map((n) => n.name));

  const edges = new Map<string, Edge>();
  for (const l of scoped) {
    if (!nodeSet.has(l.aDevice) || !nodeSet.has(l.zDevice)) continue;
    const [a, z] = [l.aDevice, l.zDevice].sort();
    const k = `${a}|${z}`;
    const e = edges.get(k) ?? { a, z, count: 0, status: l.state, speed: l.speed, cables: [] };
    e.count++;
    e.status = worst(e.status, l.state);
    e.cables.push(l.cableId);
    edges.set(k, e);
  }

  const W = 1180;
  const rowH = 120;
  const boxW = includeHosts ? 92 : 110;
  const boxH = 30;
  const rows = TIERS.map((t, i) => nodes.filter((n) => tierOf(n.role) === i).sort((a, b) => (a.role ?? "").localeCompare(b.role ?? "") || a.name.localeCompare(b.name, undefined, { numeric: true })));
  const usedRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.length);
  const pos = new Map<string, { x: number; y: number }>();
  usedRows.forEach(({ r }, row) => {
    const gap = W / (r.length + 1);
    r.forEach((n, j) => pos.set(n.name, { x: gap * (j + 1), y: 40 + row * rowH }));
  });
  const H = 40 + Math.max(0, usedRows.length - 1) * rowH + 60;

  if (!nodes.length) return <p className="text-sm text-[var(--muted-fg)]">No switch or host devices with roles in this fabric yet.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[900px]" role="group" aria-label={`Topology of ${fabrics.join(", ")}`}>
        {usedRows.map(({ i }, row) => (
          <text key={i} x={6} y={40 + row * rowH + 4} className="fill-slate-400 text-[11px] font-semibold uppercase">
            {TIERS[i].label}
          </text>
        ))}
        {[...edges.values()].map((e) => {
          const p = pos.get(e.a)!;
          const q = pos.get(e.z)!;
          const st = STATUS_STYLE[e.status];
          return (
            <line key={`${e.a}|${e.z}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={st.stroke} strokeWidth={e.status === "MISMATCH" || e.status === "NEEDS_REVIEW" ? 2.6 : 1.2} strokeOpacity={0.85}>
              <title>{`${e.a} \u2194 ${e.z}: ${e.count} cable(s) ${e.speed ?? ""} \u00b7 ${st.label} \u00b7 ${e.cables.slice(0, 6).join(", ")}${e.cables.length > 6 ? "\u2026" : ""}`}</title>
            </line>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.name)!;
          const st = STATUS_STYLE[n.status];
          return (
            <a key={n.name} href={hrefForDevice(n.name)}>
              <g>
                <rect x={p.x - boxW / 2} y={p.y - boxH / 2} width={boxW} height={boxH} rx={5} fill={st.fill} stroke={st.stroke} strokeWidth={1.4} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" className="text-[10.5px] font-bold" fill={st.text}>
                  {n.name}
                </text>
                <title>{`${n.name} (${n.role}) \u00b7 ${st.label}`}</title>
              </g>
            </a>
          );
        })}
      </svg>
    </div>
  );
}

export function FabricStats({ links, fabric, base }: { links: FabricLink[]; fabric: string; base: string }) {
  const ls = links.filter((l) => l.fabric === fabric);
  const n = (s: LinkStatus[]) => ls.filter((l) => s.includes(l.state)).length;
  const installed = ls.filter((l) => l.installStatus === "INSTALLED").length;
  const items: Array<[string, number, string]> = [
    ["Planned", ls.length, `${base}/cables?fabric=${fabric}`],
    ["Installed", installed, `${base}/cables?fabric=${fabric}&status=INSTALLED`],
    ["Verified", n(["VERIFIED_LLDP", "VERIFIED_PHYSICAL"]), `${base}/verify?result=match`],
    ["Mismatch", n(["MISMATCH"]), `${base}/verify?result=mismatch`],
    ["Needs review", n(["NEEDS_REVIEW"]), `${base}/verify?result=review`],
    ["Awaiting", n(["AWAITING", "NONE"]), `${base}/verify?result=pending`],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([label, v, href]) => (
        <Link key={label} href={href} className="rounded-md border border-[var(--border)] bg-white px-3 py-2 hover:border-[var(--accent)]">
          <div className="text-[11px] font-semibold uppercase text-[var(--muted-fg)]">{label}</div>
          <div className="text-xl font-extrabold">{v}</div>
        </Link>
      ))}
    </div>
  );
}
