import type { InstallStatus, WorkOrderStatus } from "@prisma/client";

export type WorkOrderProgress = {
  total: number;
  installed: number;
  blocked: number;
  planned: number;
  pct: number;
};

export function computeWorkOrderProgress(
  statuses: Array<InstallStatus | null | undefined>,
): WorkOrderProgress {
  const total = statuses.length;
  let installed = 0;
  let blocked = 0;
  let planned = 0;
  for (const s of statuses) {
    if (s === "INSTALLED") installed += 1;
    else if (s === "BLOCKED") blocked += 1;
    else planned += 1;
  }
  return {
    total,
    installed,
    blocked,
    planned,
    pct: total === 0 ? 0 : Math.round((installed / total) * 100),
  };
}

export function nextWorkOrderCode(existingCodes: string[]): string {
  let max = 1000;
  for (const code of existingCodes) {
    const m = /^WO-(\d+)$/i.exec(code.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `WO-${max + 1}`;
}

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};
