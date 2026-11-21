"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignException, waiveException } from "@/app/actions/verify";
import { Button, ErrorBanner } from "@/components/ui";

const field =
  "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20";

export function ExceptionOwnerForm({
  projectId,
  findingId,
  members,
  assigneeId,
  dueAt,
  waived,
  critical,
}: {
  projectId: string;
  findingId: string;
  members: { id: string; label: string }[];
  assigneeId: string | null;
  dueAt: string | null;
  waived: boolean;
  critical: boolean;
}) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(assigneeId ?? "");
  const [due, setDue] = useState(dueAt ? dueAt.slice(0, 10) : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    setSaved(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error ?? "Could not save");
        else {
          setSaved(done);
          setReason("");
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="mt-4 space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted-fg)]">Owner &amp; due date</p>
      {error && <ErrorBanner message={error} />}
      {saved && <p className="text-xs font-semibold text-[var(--success-ink)]">{saved}</p>}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
        <select
          className={field}
          aria-label="Assignee"
          data-hint="Who fixes this exception. Only members who can act on cables are listed."
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={field}
          aria-label="Due date"
          data-hint="Target date for the fix. Overdue exceptions are highlighted."
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => assignException({ projectId, findingId, assigneeId: assignee || null, dueAt: due ? `${due}T23:59:00Z` : null }),
              "Owner and due date saved.",
            )
          }
        >
          Save
        </Button>
      </div>

      {critical && (
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted-fg)]">Handover waiver</p>
          {waived ? (
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => waiveException({ projectId, findingId, reason: null }), "Waiver revoked.")}>
              Revoke waiver
            </Button>
          ) : (
            <>
              <textarea
                className={`${field} h-auto py-2 text-xs`}
                rows={2}
                maxLength={500}
                placeholder="Reason this critical exception may be accepted at handover (min 10 characters)"
                data-hint="A waiver keeps the discrepancy visible but lets owner acceptance proceed. It is recorded with your name in the audit log."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || reason.trim().length < 10}
                onClick={() => run(() => waiveException({ projectId, findingId, reason: reason.trim() }), "Waiver recorded.")}
              >
                Record authorized waiver
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
