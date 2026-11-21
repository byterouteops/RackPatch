"use client";

import { useState, useTransition } from "react";
import { qcAcknowledgeFinding } from "@/app/actions/qc";
import { Button, ErrorBanner, Input } from "@/components/ui";

export function QcAckForm({ projectId, findingId }: { projectId: string; findingId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await qcAcknowledgeFinding({ projectId, findingId, note });
            window.location.reload();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not acknowledge");
          }
        });
      }}
    >
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          required
          maxLength={450}
          placeholder="QC note (what was checked / action taken)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          QC acknowledge
        </Button>
      </div>
    </form>
  );
}
