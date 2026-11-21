"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPhysicalVerification } from "@/app/actions/verify";
import { Button, ErrorBanner, TextArea } from "@/components/ui";

/** Independent physical QC: confirm each end on site, or reject with a note. */
export function QcDecisionForm({ projectId, linkId, aLabel, zLabel }: { projectId: string; linkId: string; aLabel: string; zLabel: string }) {
  const router = useRouter();
  const [aOk, setAOk] = useState(true);
  const [zOk, setZOk] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rejecting = !aOk || !zOk;

  function submit() {
    setError(null);
    start(async () => {
      try {
        const r = await recordPhysicalVerification({ projectId, linkId, note: note.trim() || undefined, aConfirmed: aOk, zConfirmed: zOk });
        if (!r.ok) setError(r.error);
        else {
          setNote("");
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not record QC result");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Record QC result</p>
      {error && <ErrorBanner message={error} />}
      <div className="grid gap-1.5 text-[13px] sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={aOk} onChange={(e) => setAOk(e.target.checked)} data-hint="Tick when the A end lands on the planned device and port, labelled correctly." />
          A end correct <span className="truncate text-xs text-[var(--muted-fg)]">{aLabel}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={zOk} onChange={(e) => setZOk(e.target.checked)} data-hint="Tick when the Z end lands on the planned device and port, labelled correctly." />
          Z end correct <span className="truncate text-xs text-[var(--muted-fg)]">{zLabel}</span>
        </label>
      </div>
      <TextArea
        rows={2}
        maxLength={500}
        placeholder={rejecting ? "Required: what is wrong (e.g. Z end in port 12, label missing)" : "Optional note"}
        data-hint="Rejections need a note of at least 5 characters; it becomes the rework instruction."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="button" size="sm" variant={rejecting ? "danger" : "primary"} disabled={pending || (rejecting && note.trim().length < 5)} onClick={submit}>
        {pending ? "Saving\u2026" : rejecting ? "Reject (send to rework)" : "Accept both ends"}
      </Button>
      <p className="text-[11px] text-[var(--muted-fg)]">Must be a different person from the recorded installer.</p>
    </div>
  );
}
