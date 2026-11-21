"use client";

import { useState, useTransition } from "react";
import { syncPortInventory } from "@/app/actions/inventory";
import { AlertBanner, Button, ErrorBanner } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function InventorySyncButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {error && <ErrorBanner message={error} />}
      {message && (
        <AlertBanner tone="info" title="Inventory synced">
          {message}
        </AlertBanner>
      )}
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              const r = await syncPortInventory(projectId);
              setMessage(
                `${r.usedPorts} used ports on ${r.devices} devices; ${r.released} released; ${r.reservedConflicts} reserved ports now used by plan; ${r.portConflicts} port conflicts in plan.`,
              );
            } catch (e) {
              setError(actionErrorMessage(e, "Sync failed"));
            }
          });
        }}
      >
        Sync from active plan
      </Button>
    </div>
  );
}
