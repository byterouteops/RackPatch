"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveHandoverStage } from "@/app/actions/handover";
import { Button, ErrorBanner } from "@/components/ui";
import type { HandoverStage } from "@/lib/handover/approval";

export function HandoverApprovalButton({ projectId, snapshotId, stage, label }: { projectId: string; snapshotId: string; stage: HandoverStage; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function sign() {
    setError(null);
    start(async () => {
      const r = await approveHandoverStage({ projectId, snapshotId, stage, note: note || undefined });
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open)
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Sign
      </Button>
    );
  return (
    <div className="mt-2 w-full space-y-2">
      {error && <ErrorBanner message={error} />}
      <textarea
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        rows={2}
        maxLength={500}
        placeholder="Optional sign-off note"
        data-hint={`Recorded with your ${label} signature in the audit log.`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={sign}>
          {pending ? "Signing\u2026" : `Confirm ${label}`}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
