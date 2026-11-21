"use client";

import { useState } from "react";
import { createHandoverSnapshot, exportProjectCsv } from "@/app/actions/handover";
import { Button, ErrorBanner, Input } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function HandoverActions({ projectId, snapshotsEnabled }: { projectId: string; snapshotsEnabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  async function downloadCsv() {
    setPending(true);
    setError(null);
    try {
      const csv = await exportProjectCsv(projectId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rackpatch-${projectId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(actionErrorMessage(err, "Export failed"));
    } finally {
      setPending(false);
    }
  }

  async function snapshot() {
    if (!snapshotsEnabled) return;
    setPending(true);
    setError(null);
    try {
      const snap = await createHandoverSnapshot({ projectId, title: title || undefined });
      window.location.href = `/app/projects/${projectId}/handover/${snap.id}`;
    } catch (err) {
      setError(actionErrorMessage(err, "Snapshot failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => void downloadCsv()}>
          Download CSV
        </Button>
        {snapshotsEnabled && (
          <>
            <Input
              placeholder="Snapshot title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="max-w-xs"
            />
            <Button type="button" disabled={pending} onClick={() => void snapshot()}>
              Create snapshot &amp; print report
            </Button>
          </>
        )}
      </div>
    </div>
  );
}