import type { RackLayout, TwinDeviceStatus } from "@/lib/twin/rack-layout";

const FRONT_W = 168;
const SLOT_H = 24;
const PAD = 6;
const DEPTH_X = 20;
const DEPTH_Y = -12;
const GAP = 56;
const TOP_MARGIN = 44;
const MIN_SLOTS = 6;

const FILL: Record<TwinDeviceStatus, { fill: string; stroke: string; text: string }> = {
  installed: { fill: "#d6efc6", stroke: "#6cc04a", text: "#1f6b2d" },
  partial: { fill: "#fff0c2", stroke: "#f0ab00", text: "#8a5a00" },
  blocked: { fill: "#f9d3d5", stroke: "#c9252d", text: "#8f1b21" },
  planned: { fill: "#e3ebf2", stroke: "#8aa4b5", text: "#3d5266" },
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * 2.5D schematic rack elevation (pure SVG, no client JS).
 * Blocks are devices in alphabetical schematic slots — not real rack units or measurements.
 */
export function RackTwinSvg({ layout }: { layout: RackLayout }) {
  const slots = Math.max(MIN_SLOTS, ...layout.racks.map((r) => r.devices.length));
  const rackH = slots * SLOT_H + PAD * 2;
  const width = layout.racks.length * (FRONT_W + DEPTH_X + GAP) + GAP / 2;
  const height = TOP_MARGIN + rackH + 24;

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Schematic rack elevation derived from the active cable plan"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block"
      >
        {layout.racks.map((rack, i) => {
          const x = GAP / 2 + i * (FRONT_W + DEPTH_X + GAP);
          const y = TOP_MARGIN;
          return (
            <g key={rack.rack}>
              <text
                x={x + FRONT_W / 2}
                y={y - 20}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="#0b1c2c"
              >
                {truncate(rack.rack, 22)}
              </text>
              <text
                x={x + FRONT_W / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={10}
                fill="#5a6f82"
              >
                {rack.devices.length} device{rack.devices.length === 1 ? "" : "s"} · {rack.links} link
                {rack.links === 1 ? "" : "s"}
              </text>

              {/* top face */}
              <polygon
                points={`${x},${y} ${x + DEPTH_X},${y + DEPTH_Y} ${x + FRONT_W + DEPTH_X},${y + DEPTH_Y} ${x + FRONT_W},${y}`}
                fill="#0a3a52"
                stroke="#032539"
              />
              {/* side face */}
              <polygon
                points={`${x + FRONT_W},${y} ${x + FRONT_W + DEPTH_X},${y + DEPTH_Y} ${x + FRONT_W + DEPTH_X},${y + rackH + DEPTH_Y} ${x + FRONT_W},${y + rackH}`}
                fill="#032539"
                stroke="#021c2c"
              />
              {/* front face */}
              <rect
                x={x}
                y={y}
                width={FRONT_W}
                height={rackH}
                fill="#14495f"
                stroke="#032539"
              />

              {/* empty slot guides */}
              {Array.from({ length: slots }).map((_, s) => (
                <rect
                  key={s}
                  x={x + PAD}
                  y={y + PAD + s * SLOT_H + 1}
                  width={FRONT_W - PAD * 2}
                  height={SLOT_H - 2}
                  fill="#0e3a4e"
                  stroke="#1c566f"
                  strokeWidth={0.5}
                />
              ))}

              {rack.devices.map((d) => {
                const c = FILL[d.status];
                const dy = y + PAD + (d.slot - 1) * SLOT_H + 1;
                return (
                  <g key={d.device}>
                    <title>
                      {`${d.device} — rack ${rack.rack}, schematic slot ${d.slot}\n${d.portsUsed} planned endpoint(s): ${d.installed} installed, ${d.planned} planned, ${d.blocked} blocked`}
                    </title>
                    <rect
                      x={x + PAD}
                      y={dy}
                      width={FRONT_W - PAD * 2}
                      height={SLOT_H - 2}
                      fill={c.fill}
                      stroke={c.stroke}
                    />
                    <text x={x + PAD + 6} y={dy + 15} fontSize={11} fontWeight={600} fill={c.text}>
                      {truncate(d.device, 18)}
                    </text>
                    <text
                      x={x + FRONT_W - PAD - 6}
                      y={dy + 15}
                      fontSize={10}
                      textAnchor="end"
                      fill={c.text}
                    >
                      {d.portsUsed}p
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TwinLegend() {
  const items: Array<[TwinDeviceStatus, string]> = [
    ["installed", "All endpoints installed"],
    ["partial", "Partially installed"],
    ["blocked", "Has blocked endpoint"],
    ["planned", "Planned only"],
  ];
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-[var(--muted-fg)]">
      {items.map(([status, label]) => (
        <li key={status} className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-5 border"
            style={{ background: FILL[status].fill, borderColor: FILL[status].stroke }}
            aria-hidden
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
