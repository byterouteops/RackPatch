import type { CollectionJobStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

const TONES: Record<CollectionJobStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "neutral",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
};

/** Status pill for evidence collection jobs (text + tone, not color-only). */
export function JobStatusBadge({ status }: { status: CollectionJobStatus }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}
