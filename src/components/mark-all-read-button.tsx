"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllAsRead } from "@/app/actions/notifications";
import { Button } from "@/components/ui";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllAsRead();
          router.refresh();
        })
      }
    >
      Mark all read
    </Button>
  );
}
