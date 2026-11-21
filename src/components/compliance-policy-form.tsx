"use client";

import { useState, useTransition } from "react";
import { runComplianceNow, saveCompliancePolicy } from "@/app/actions/compliance";
import { AlertBanner, Button, ErrorBanner, Input, TextArea } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function CompliancePolicyForm({
  projectId,
  initial,
  hasPolicy,
  canEdit,
}: {
  projectId: string;
  initial: {
    enabled: boolean;
    maxEvidenceAgeDays: number;
    notifyEmails: string;
    recomputeFindings: boolean;
  };
  hasPolicy: boolean;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(fd: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await saveCompliancePolicy({
          projectId,
          enabled: fd.get("enabled") === "on",
          maxEvidenceAgeDays: Number(fd.get("maxEvidenceAgeDays") || 7),
          notifyEmails: String(fd.get("notifyEmails") || ""),
          recomputeFindings: fd.get("recomputeFindings") === "on",
        });
        setMessage("Policy saved.");
      } catch (e) {
        setError(actionErrorMessage(e, "Could not save policy"));
      }
    });
  }

  function runNow() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await runComplianceNow(projectId);
        setMessage(`Check complete: ${res.status}. ${res.summary}`);
      } catch (e) {
        setError(actionErrorMessage(e, "Check failed"));
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {message && (
        <AlertBanner tone="info" title="Compliance">
          {message}
        </AlertBanner>
      )}
      <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={initial.enabled}
            disabled={!canEdit}
          />
          Policy enabled (scheduled checks include this project)
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Max evidence age (days)</span>
          <Input
            name="maxEvidenceAgeDays"
            type="number"
            min={1}
            max={365}
            defaultValue={initial.maxEvidenceAgeDays}
            disabled={!canEdit}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="recomputeFindings"
            defaultChecked={initial.recomputeFindings}
            disabled={!canEdit}
          />
          Recompute verification findings before each check
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">Notify emails (comma separated)</span>
          <TextArea
            name="notifyEmails"
            className="min-h-[72px]"
            defaultValue={initial.notifyEmails}
            placeholder="ops@example.com, lead@example.com"
            disabled={!canEdit}
          />
        </label>
        {canEdit && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Save policy
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !hasPolicy}
              onClick={runNow}
            >
              Run check now
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
