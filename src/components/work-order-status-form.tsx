"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkOrderStatus } from "@prisma/client";
import { updateWorkOrderStatus } from "@/app/actions/work-orders";
import { WORK_ORDER_STATUS_LABEL } from "@/lib/work-orders";
import { Button } from "@/components/ui";

const STATUSES: WorkOrderStatus[] = [
  "DRAFT",
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
];

export function WorkOrderStatusForm({
  projectId,
  workOrderId,
  status,
}: {
  projectId: string;
  workOrderId: string;
  status: WorkOrderStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase text-[var(--muted-fg)]">Status</span>
      {STATUSES.map((s) => (
        <Button
          key={s}
          type="button"
          size="sm"
          variant={s === status ? "primary" : "secondary"}
          disabled={pending || s === status}
          onClick={() =>
            startTransition(async () => {
              await updateWorkOrderStatus({ projectId, workOrderId, status: s });
              router.refresh();
            })
          }
        >
          {WORK_ORDER_STATUS_LABEL[s]}
        </Button>
      ))}
    </div>
  );
}
