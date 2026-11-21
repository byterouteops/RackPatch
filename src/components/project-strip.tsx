import type { ReactNode } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/** Project summary card used at the top of workflow screens (design: project strip). */
export function ProjectStrip({
  name,
  phase,
  phaseTone = "info",
  meta,
  progressLabel,
  progressValue,
  progressMax,
  aside,
}: {
  name: string;
  phase?: string;
  phaseTone?: "info" | "success" | "warning" | "neutral";
  meta: string[];
  progressLabel: string;
  progressValue: number;
  progressMax: number;
  aside?: ReactNode;
}) {
  const pct = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0;
  const tones = {
    info: "bg-[var(--accent-soft)] text-[var(--accent)]",
    success: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="rp-card mb-4 grid items-center gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Layers className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="rp-display truncate text-[17px] font-extrabold">{name}</p>
            {phase && (
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", tones[phaseTone])}>{phase}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--muted-fg)]">{meta.filter(Boolean).join("  |  ")}</p>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold">{progressLabel}</span>
          <span className="rp-mono text-[var(--muted-fg)]">
            {progressValue.toLocaleString("en-US")} / {progressMax.toLocaleString("en-US")} ({pct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[var(--muted)]">
          <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {aside && <div className="flex flex-wrap items-center gap-5 text-sm">{aside}</div>}
    </div>
  );
}

export function StripFact({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[var(--muted-fg)] [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div className="leading-tight">
        <p className="text-[11px] text-[var(--muted-fg)]">{label}</p>
        <p className="font-bold">{value}</p>
      </div>
    </div>
  );
}
