import { AlertTriangle, CheckCircle2, Clock, Link2Off, ShieldCheck, type LucideIcon } from "lucide-react";
import { STATUS_STYLE, type LinkStatus } from "@/lib/fabric/load";
import { statusKey, type StatusKey } from "@/lib/topology/graph";

export const STATUS_ICON: Record<StatusKey, LucideIcon> = {
  VERIFIED_LLDP: ShieldCheck,
  VERIFIED_PHYSICAL: CheckCircle2,
  AWAITING: Clock,
  NEEDS_REVIEW: AlertTriangle,
  MISMATCH: Link2Off,
};

/** Line pattern per status so links stay distinguishable without colour. */
export const STATUS_DASH: Record<StatusKey, string | undefined> = {
  VERIFIED_LLDP: undefined,
  VERIFIED_PHYSICAL: "10 3",
  AWAITING: "2 4",
  NEEDS_REVIEW: "7 4",
  MISMATCH: undefined,
};

export const styleOf = (s: LinkStatus) => STATUS_STYLE[statusKey(s)];

export function StatusPill({ state, className = "" }: { state: LinkStatus; className?: string }) {
  const k = statusKey(state);
  const st = STATUS_STYLE[k];
  const Icon = STATUS_ICON[k];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ background: st.fill, borderColor: st.stroke, color: st.text }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {state === "NONE" ? "No evidence yet" : st.label}
    </span>
  );
}

export const humanize = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
