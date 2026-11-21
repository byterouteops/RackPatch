import Link from "next/link";
import { STATUS_STYLE, type FabricDevice } from "@/lib/fabric/load";
import { cn } from "@/lib/utils";

/** Front-view rack elevation: U1 at the bottom, devices spanning their uHeight. */
export function RackElevation({
  name,
  heightU,
  devices,
  hrefFor,
  selected,
  compact,
  face = "front",
}: {
  name: string;
  heightU: number;
  devices: FabricDevice[];
  hrefFor?: (d: FabricDevice) => string;
  selected?: string | null;
  compact?: boolean;
  face?: "front" | "rear";
}) {
  const unit = compact ? 7 : 18;
  const placed = devices.filter((d) => d.rackUnit && d.uHeight);
  return (
    <div className="inline-flex flex-col" aria-label={`Rack ${name} ${face} elevation`}>
      <div
        className="relative grid rounded-md border-2 border-slate-700 bg-slate-800 p-1"
        style={{ gridTemplateRows: `repeat(${heightU}, ${unit}px)`, gridTemplateColumns: compact ? "1fr" : "28px 1fr", width: compact ? 120 : 360 }}
      >
        {!compact &&
          Array.from({ length: heightU }, (_, i) => (
            <div key={i} className="flex items-center justify-end pr-1 font-mono text-[9px] text-slate-400" style={{ gridRow: i + 1, gridColumn: 1 }}>
              {heightU - i}
            </div>
          ))}
        {Array.from({ length: heightU }, (_, i) => (
          <div key={`s${i}`} className="border-b border-slate-700/60" style={{ gridRow: i + 1, gridColumn: compact ? 1 : 2 }} />
        ))}
        {placed.map((d) => {
          const top = heightU - (d.rackUnit! + d.uHeight! - 1) + 1;
          const st = STATUS_STYLE[d.status];
          const body = (
            <div
              className={cn(
                "flex h-full items-center gap-1 overflow-hidden rounded-[3px] border px-1.5",
                face === "rear" && "opacity-80",
                selected && selected.toLowerCase() === d.name.toLowerCase() && "ring-2 ring-[var(--accent)] ring-offset-1",
              )}
              style={{ background: st.fill, borderColor: st.stroke, color: st.text }}
              title={`${d.name} \u00b7 U${d.rackUnit}${d.uHeight! > 1 ? `\u2013${d.rackUnit! + d.uHeight! - 1}` : ""} \u00b7 ${st.label}`}
            >
              {!compact && (
                <>
                  <span className="truncate text-[11px] font-bold">{d.name}</span>
                  <span className="ml-auto truncate text-[10px]">{face === "rear" ? `${d.usedPorts}/${d.portCount} ports` : d.model ?? d.role}</span>
                </>
              )}
            </div>
          );
          return (
            <div key={d.id} className="relative z-10 py-px" style={{ gridRow: `${top} / span ${d.uHeight}`, gridColumn: compact ? 1 : 2 }}>
              {hrefFor ? (
                <Link href={hrefFor(d)} className="block h-full rp-focus" aria-label={`${d.name}, ${st.label}`}>
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(["VERIFIED_LLDP", "VERIFIED_PHYSICAL", "AWAITING", "NEEDS_REVIEW", "MISMATCH"] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border" style={{ background: STATUS_STYLE[s].fill, borderColor: STATUS_STYLE[s].stroke }} />
          {STATUS_STYLE[s].label}
        </span>
      ))}
    </div>
  );
}
