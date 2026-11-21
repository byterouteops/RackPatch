"use client";

import { useState, useTransition } from "react";
import { adjustStock } from "@/app/actions/spares";
import { Button, ErrorBanner, Input } from "@/components/ui";

export function SpareAdjustForm({
  projectId,
  itemId,
  canReceive,
  canConsume,
}: {
  projectId: string;
  itemId: string;
  canReceive: boolean;
  canConsume: boolean;
}) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = Number(delta);
  const allowed = Number.isInteger(n) && n !== 0 && (n > 0 ? canReceive : canConsume);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await adjustStock({ projectId, itemId, delta: n, reason });
            window.location.reload();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Adjustment failed");
          }
        });
      }}
    >
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap gap-2">
        <Input
          required
          type="number"
          step={1}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="+10 / -2"
          className="w-24"
        />
        <Input
          required
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (e.g. used on C-014)"
          className="min-w-[200px] flex-1"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !allowed}>
          Post
        </Button>
      </div>
      {!canReceive && (
        <p className="text-xs text-[var(--muted-fg)]">Receiving stock requires a lead.</p>
      )}
    </form>
  );
}
