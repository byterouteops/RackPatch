import Link from "next/link";
import { statusKey, type TopoGraph } from "@/lib/topology/graph";

/** One summary strip per view, computed from exactly the cables drawn below it. */
export function TopologyStats({ graph, base }: { graph: TopoGraph; base: string }) {
  const c = graph.cables;
  const count = (k: string) => c.filter((x) => statusKey(x.state) === k).length;
  const fabrics = Array.from(new Set(c.map((x) => x.fabric).filter(Boolean))).join(", ");
  const items: Array<{ label: string; value: number; href?: string; tone?: string }> = [
    { label: "Devices", value: graph.nodes.length },
    { label: "Cables", value: c.length, href: `${base}/cables` },
    { label: "Installed", value: c.filter((x) => x.installStatus === "INSTALLED").length, href: `${base}/cables?status=INSTALLED` },
    { label: "Verified (LLDP)", value: count("VERIFIED_LLDP"), href: `${base}/verify?result=match`, tone: "#166534" },
    { label: "Verified (physical)", value: count("VERIFIED_PHYSICAL"), href: `${base}/verify?result=match`, tone: "#065f46" },
    { label: "Awaiting", value: count("AWAITING"), href: `${base}/verify?result=pending`, tone: "#334155" },
    { label: "Needs review", value: count("NEEDS_REVIEW"), href: `${base}/verify?result=review`, tone: "#92400e" },
    { label: "Mismatch", value: count("MISMATCH"), href: `${base}/verify?result=mismatch`, tone: "#991b1b" },
  ];
  return (
    <section aria-label={`${graph.label} summary`} className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
        {graph.label} {fabrics ? <span className="font-normal normal-case tracking-normal">{"\u00b7"} fabrics {fabrics}</span> : null}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" data-testid="topo-stats">
        {items.map((i) => {
          const body = (
            <>
              <div className="text-[11px] font-semibold uppercase text-[var(--muted-fg)]">{i.label}</div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: i.tone }}>
                {i.value}
              </div>
            </>
          );
          return i.href ? (
            <Link key={i.label} href={i.href} className="rounded-md border border-[var(--border)] bg-white px-3 py-2 hover:border-[var(--accent)]">
              {body}
            </Link>
          ) : (
            <div key={i.label} className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
