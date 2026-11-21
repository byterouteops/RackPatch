"use client";

import { useState } from "react";
import { createHandoverShareLink } from "@/app/actions/handover";
import { Button, ErrorBanner } from "@/components/ui";

export function HandoverShareButton({
  projectId,
  snapshotId,
  existingUrl,
  expiresAt,
}: {
  projectId: string;
  snapshotId: string;
  existingUrl?: string | null;
  expiresAt?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(existingUrl ?? "");
  const [expires, setExpires] = useState(expiresAt ?? "");
  const [copied, setCopied] = useState(false);

  async function createOrRefresh() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const result = await createHandoverShareLink({ projectId, snapshotId });
      setUrl(result.url);
      setExpires(result.shareExpiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create share link");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Clipboard unavailable — copy the URL manually");
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {error && <ErrorBanner message={error} />}
      {url ? (
        <div className="space-y-1">
          <p className="break-all text-xs text-[var(--muted-fg)]">{url}</p>
          {expires && (
            <p className="text-xs text-[var(--muted-fg)]">
              Expires {new Date(expires).toLocaleString()}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy customer link"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => void createOrRefresh()}
            >
              Refresh expiry
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => void createOrRefresh()}
        >
          Create customer link
        </Button>
      )}
    </div>
  );
}
