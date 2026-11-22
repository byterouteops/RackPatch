const UNIT_H = 30;
const UNIT_GAP = 9;
const TOP = 56;
const UNITS = 7;

function unitY(i: number) {
  return TOP + i * (UNIT_H + UNIT_GAP);
}

function Rack({ x, label, sub, faultUnits }: { x: number; label: string; sub: string; faultUnits: number[] }) {
  const w = 170;
  return (
    <g>
      <rect x={x + 18} y={6} width={w - 36} height={26} rx={6} fill="#0b2236" stroke="#1e4a5f" />
      <text x={x + w / 2} y={23} textAnchor="middle" fill="#e6f6ff" fontSize="11" fontWeight="600">
        {label} <tspan fill="#7fd8e6">({sub})</tspan>
      </text>
      <rect x={x} y={40} width={w} height={UNITS * (UNIT_H + UNIT_GAP) + 22} rx={8} fill="#071826" stroke="#24526a" strokeWidth={1.5} />
      {Array.from({ length: UNITS }, (_, i) => {
        const y = unitY(i);
        const fault = faultUnits.includes(i);
        return (
          <g key={i}>
            <rect x={x + 10} y={y} width={w - 20} height={UNIT_H} rx={3} fill="#0d2a3d" stroke="#1d4558" />
            {Array.from({ length: 12 }, (_, p) => (
              <rect key={p} x={x + 18 + p * 11} y={y + 9} width={7} height={6} rx={1} fill="#06131d" stroke="#2c5f74" strokeWidth={0.6} />
            ))}
            {Array.from({ length: 12 }, (_, p) => (
              <circle
                key={p}
                cx={x + 21.5 + p * 11}
                cy={y + 21}
                r={1.6}
                fill={fault && (p === 10 || p === 11) ? "#f59e0b" : p % 5 === 3 ? "#1f4d5f" : "#34d399"}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** Decorative diagram of a swapped cable pair between two racks; not live data. */
export function RackIllustration({ className }: { className?: string }) {
  const leftPort = 10 + 168;
  const rightPort = 340;
  const a = unitY(2) + 12;
  const b = unitY(3) + 12;
  return (
    <svg viewBox="0 0 520 360" className={className} role="img" aria-label="Illustration: two racks with a swapped cable pair flagged as a mismatch">
      <defs>
        <filter id="rp-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <Rack x={10} label="Rack-14" sub="Leaf-02" faultUnits={[2, 3]} />
      <Rack x={340} label="Rack-15" sub="Spine-01" faultUnits={[2, 3]} />

      <g fill="none" strokeWidth={3} strokeLinecap="round" filter="url(#rp-glow)">
        <path d={`M${leftPort} ${unitY(0) + 12} C 260 ${unitY(0) - 6}, 260 ${unitY(0) - 6}, ${rightPort} ${unitY(0) + 12}`} stroke="#2ee6d6" opacity={0.85} />
        <path d={`M${leftPort} ${unitY(1) + 12} C 260 ${unitY(1) + 2}, 260 ${unitY(1) + 2}, ${rightPort} ${unitY(1) + 12}`} stroke="#2ee6d6" opacity={0.85} />
        <path d={`M${leftPort} ${a} C 270 ${a}, 250 ${b}, ${rightPort} ${b}`} stroke="#fb923c" />
        <path d={`M${leftPort} ${b} C 270 ${b}, 250 ${a}, ${rightPort} ${a}`} stroke="#f97316" />
        <path d={`M${leftPort} ${unitY(5) + 12} C 260 ${unitY(5) + 24}, 260 ${unitY(5) + 24}, ${rightPort} ${unitY(5) + 12}`} stroke="#2ee6d6" opacity={0.6} />
      </g>

      <g transform={`translate(196 ${b + 26})`}>
        <rect width={128} height={40} rx={8} fill="#2a1606" stroke="#f59e0b" strokeWidth={1.2} />
        <path d="M14 27 L22 12 L30 27 Z" fill="none" stroke="#fbbf24" strokeWidth={1.6} strokeLinejoin="round" />
        <line x1={22} y1={17} x2={22} y2={22} stroke="#fbbf24" strokeWidth={1.6} />
        <circle cx={22} cy={24.6} r={0.9} fill="#fbbf24" />
        <text x={38} y={18} fill="#fde68a" fontSize="10.5" fontWeight="600">Swapped cables</text>
        <text x={38} y={31} fill="#fbbf24" fontSize="9.5">(Mismatch)</text>
      </g>
    </svg>
  );
}
