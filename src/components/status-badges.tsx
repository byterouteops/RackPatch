import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Link2Off,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { InstallStatus, VerificationState } from "@prisma/client";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export function InstallStatusBadge({
  status,
  className,
}: {
  status: InstallStatus;
  className?: string;
}) {
  switch (status) {
    case "INSTALLED":
      return (
        <Badge tone="success" className={className}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Installed
        </Badge>
      );
    case "BLOCKED":
      return (
        <Badge tone="danger" className={className}>
          <XCircle className="h-3.5 w-3.5" aria-hidden />
          Blocked
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" className={className}>
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Planned
        </Badge>
      );
  }
}

export function VerificationBadge({
  state,
  className,
  compact,
}: {
  state: VerificationState;
  className?: string;
  compact?: boolean;
}) {
  const label = compact ? shortVerificationLabel(state) : verificationLabel(state);
  const icon = verificationIcon(state);
  const tone = verificationTone(state);

  return (
    <Badge tone={tone} className={cn(className)}>
      {icon}
      {label}
    </Badge>
  );
}

function verificationLabel(state: VerificationState): string {
  switch (state) {
    case "VERIFIED_LLDP":
      return "Verified";
    case "VERIFIED_PHYSICAL":
      return "Verified";
    case "MISMATCH":
      return "Mismatch";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "AWAITING":
      return "Pending";
    default:
      return state;
  }
}

function shortVerificationLabel(state: VerificationState): string {
  switch (state) {
    case "VERIFIED_LLDP":
      return "Verified";
    case "VERIFIED_PHYSICAL":
      return "Physical";
    case "MISMATCH":
      return "Mismatch";
    case "NEEDS_REVIEW":
      return "Review";
    case "AWAITING":
      return "Pending";
    default:
      return state;
  }
}

function verificationTone(
  state: VerificationState,
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (state) {
    case "VERIFIED_LLDP":
    case "VERIFIED_PHYSICAL":
      return "success";
    case "MISMATCH":
      return "danger";
    case "NEEDS_REVIEW":
      return "warning";
    case "AWAITING":
      return "neutral";
    default:
      return "neutral";
  }
}

function verificationIcon(state: VerificationState) {
  const cls = "h-3.5 w-3.5";
  switch (state) {
    case "VERIFIED_LLDP":
      return <ShieldCheck className={cls} aria-hidden />;
    case "VERIFIED_PHYSICAL":
      return <CheckCircle2 className={cls} aria-hidden />;
    case "MISMATCH":
      return <Link2Off className={cls} aria-hidden />;
    case "NEEDS_REVIEW":
      return <AlertTriangle className={cls} aria-hidden />;
    case "AWAITING":
      return <Clock className={cls} aria-hidden />;
    default:
      return <HelpCircle className={cls} aria-hidden />;
  }
}
