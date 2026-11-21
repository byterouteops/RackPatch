"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstallStatus } from "@prisma/client";
import { updateInstallStatus } from "@/app/actions/install";
import { recordPhysicalVerification } from "@/app/actions/verify";
import { Button, ErrorBanner, Input, TextArea } from "@/components/ui";

export function InstallControls({
  projectId,
  linkId,
  version,
  installStatus,
  blockedReason,
  canUpdateInstall,
  canPhysicalVerify,
}: {
  projectId: string;
  linkId: string;
  version: number;
  installStatus: InstallStatus;
  blockedReason: string | null;
  canUpdateInstall: boolean;
  canPhysicalVerify: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(version);
  const [reason, setReason] = useState("");
  const [verifyNote, setVerifyNote] = useState("");

  async function setStatus(status: InstallStatus) {
    if (!canUpdateInstall) return;
    setPending(true);
    setError(null);
    setConflict(null);
    try {
      const result = await updateInstallStatus({
        projectId,
        linkId,
        status,
        blockedReason: status === "BLOCKED" ? reason : undefined,
        expectedVersion: localVersion,
      });
      if (result.conflict) {
        setConflict(result.message);
        setLocalVersion(result.current.version);
      } else {
        setLocalVersion(result.current.version);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  async function onPhysicalVerify(ok: boolean) {
    setPending(true);
    setError(null);
    try {
      const result = await recordPhysicalVerification({
        projectId,
        linkId,
        note: verifyNote.trim() || undefined,
        aConfirmed: ok,
        zConfirmed: ok,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVerifyNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {conflict && <ErrorBanner message={conflict} />}

      {!canUpdateInstall && (
        <p className="text-sm text-[var(--muted-fg)]">
          You cannot update install state on this project (role or commercial status).
        </p>
      )}

      {canUpdateInstall && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Button
            type="button"
            size="lg"
            variant={installStatus === "INSTALLED" ? "primary" : "secondary"}
            disabled={pending}
            className="min-h-[52px]"
            onClick={() => void setStatus("INSTALLED")}
          >
            Mark installed
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            disabled={pending}
            className="min-h-[52px]"
            onClick={() => void setStatus("PLANNED")}
          >
            Back to planned
          </Button>
          <Button
            type="button"
            size="lg"
            variant="danger"
            disabled={pending}
            className="min-h-[52px]"
            onClick={() => void setStatus("BLOCKED")}
          >
            Mark blocked
          </Button>
        </div>
      )}

      {canUpdateInstall && (
        <label className="block text-sm font-medium">
          Blocked reason
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={blockedReason || "Required if marking blocked"}
            className="mt-1"
          />
        </label>
      )}

      <p className="text-xs text-[var(--muted-fg)]">Version {localVersion} — optimistic concurrency</p>

      {canPhysicalVerify && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="font-medium">Physical verification</p>
          <p className="mt-1 text-sm text-[var(--muted-fg)]">
            Confirm both ends on site, or reject with a note. Must be a different person than the recorded installer.
          </p>
          <TextArea
            className="mt-3"
            placeholder="Note (required when rejecting)"
            value={verifyNote}
            onChange={(e) => setVerifyNote(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="w-full sm:w-auto" size="lg" disabled={pending} onClick={() => void onPhysicalVerify(true)}>
              Confirm physical A/Z
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              size="lg"
              variant="danger"
              disabled={pending || verifyNote.trim().length < 5}
              title={verifyNote.trim().length < 5 ? "Write what is wrong (at least 5 characters) to reject" : undefined}
              onClick={() => void onPhysicalVerify(false)}
            >
              Reject (rework)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}