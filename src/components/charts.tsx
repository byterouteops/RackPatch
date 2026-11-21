import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  flush,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("rp-card", flush ? "overflow-hidden" : "p-4", className)}>
      <div className={cn("flex items-center justify-between gap-2", flush ? "border-b border-[var(--border)] px-4 py-3" : "mb-3")}>
        <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type DonutSegment = { label: string; value: number; color: string };

export function Donut({ segments, total, label }: { segments: DonutSegment[]; total: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const arcs = segments.reduce<Array<{ len: number; offset: number; color: string }>>((acc, s) => {
    const prev = acc[acc.length - 1];
    acc.push({ len: total ? (s.value / total) * c : 0, offset: prev ? prev.offset + prev.len : 0, color: s.color });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 110 110" className="h-32 w-32 shrink-0" role="img" aria-label={`${total} ${label}`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--muted)" strokeWidth="14" />
      {arcs.map((a, i) => (
        <circle
          key={i}
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={a.color}
          strokeWidth="14"
          strokeDasharray={`${a.len} ${c - a.len}`}
          strokeDashoffset={-a.offset}
          transform="rotate(-90 55 55)"
        />
      ))}
      <text x="55" y="55" textAnchor="middle" className="fill-[var(--foreground)] text-[20px] font-bold">
        {total.toLocaleString("en-US")}
      </text>
      <text x="55" y="70" textAnchor="middle" className="fill-[var(--muted-fg)] text-[9px]">
        {label}
      </text>
    </svg>
  );
}

export function DonutWithLegend({ segments, total, label }: { segments: DonutSegment[]; total: number; label: string }) {
  return (
    <div className="flex items-center gap-5">
      <Donut segments={segments} total={total} label={label} />
      <ul className="flex-1 space-y-2 text-[13px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="flex-1">{s.label}</span>
            <span className="font-semibold">{s.value.toLocaleString("en-US")}</span>
            <span className="w-12 text-right text-xs text-[var(--muted-fg)]">{pct(s.value, total).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MeterRow({ label, value, total, color = "bg-[var(--accent)]", suffix }: { label: ReactNode; value: number; total: number; color?: string; suffix?: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_56px] items-center gap-2 text-[13px]">
      <span className="truncate">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
        <span className={cn("block h-full rounded-full", color)} style={{ width: `${Math.min(100, pct(value, total))}%` }} />
      </span>
      <span className="text-right text-xs font-semibold">{suffix ?? `${Math.round(pct(value, total))}%`}</span>
    </li>
  );
}

export function Stepper({ steps }: { steps: Array<{ label: string; detail?: ReactNode; state: "done" | "current" | "todo" }> }) {
  return (
    <ol className="flex flex-wrap items-start gap-2">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-[120px] flex-1 items-start gap-2">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              s.state === "done" && "bg-[var(--success)] text-white",
              s.state === "current" && "bg-[var(--accent)] text-white",
              s.state === "todo" && "bg-[var(--muted)] text-[var(--muted-fg)]",
            )}
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">{s.label}</span>
            {s.detail && <span className="block text-xs text-[var(--muted-fg)]">{s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
