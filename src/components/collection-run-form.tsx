"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runSshCollection } from "@/app/actions/collection";
import { AlertBanner, Button, ErrorBanner } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function CollectionRunForm({
  projectId,
  targetId,
  targetName,
}: {
  projectId: string;
  targetId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(acceptHostKey: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await runSshCollection({ projectId, targetId, acceptHostKey });
      if (!res.ok) {
        if ("needsHostKeyAccept" in res && res.needsHostKeyAccept) {
          setFingerprint(res.hostKeyFingerprint ?? null);
          setError(res.error);
        } else {
          setError(("error" in res ? res.error : undefined) ?? "Collection failed");
        }
        return;
      }
      setFingerprint(null);
      setMessage(`Collected from ${targetName}`);
      router.refresh();
    } catch (e) {
      setError(actionErrorMessage(e, "Collection failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <ErrorBanner message={error} />}
      {message && (
        <AlertBanner tone="info" title="Done">
          {message}
        </AlertBanner>
      )}
      {fingerprint && (
        <AlertBanner tone="warning" title="Verify host key">
          SHA-256: <code className="break-all text-xs">{fingerprint}</code>
          <div className="mt-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void run(true)}>
              Accept fingerprint and collect
            </Button>
          </div>
        </AlertBanner>
      )}
      <Button type="button" size="sm" disabled={busy} onClick={() => void run(false)}>
        {busy ? "Collecting…" : "Run SSH collect"}
      </Button>
    </div>
  );
}
