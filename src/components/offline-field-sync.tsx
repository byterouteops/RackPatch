"use client";

import { useCallback, useEffect, useState } from "react";
import { syncOfflineFieldQueue } from "@/app/actions/field-evidence";
import {
  FIELD_QUEUE_CHANGED,
  clearFieldQueueItems,
  createOfflineItem,
  enqueueFieldItem,
  listFieldQueue,
  type OfflineFieldItem,
} from "@/lib/offline/field-queue";
import { AlertBanner, Button, ErrorBanner } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function OfflineFieldSync({ projectId }: { projectId: string }) {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<OfflineFieldItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await listFieldQueue(projectId);
      setQueue(items);
    } catch {
      // IndexedDB unavailable
    }
  }, [projectId]);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const changed = () => void refresh();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(FIELD_QUEUE_CHANGED, changed);
    void refresh();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(FIELD_QUEUE_CHANGED, changed);
    };
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    // Auto-attempt sync when connectivity returns; read IndexedDB, not possibly stale state.
    listFieldQueue(projectId)
      .then((items) => {
        if (items.length > 0) void doSync();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function doSync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const items = await listFieldQueue(projectId);
      if (items.length === 0) {
        setMessage("Queue empty");
        return;
      }
      const res = await syncOfflineFieldQueue({ projectId, items });
      const okIds = res.results.filter((r) => r.ok).map((r) => r.clientId);
      await clearFieldQueueItems(okIds);
      await refresh();
      setMessage(`Synced ${res.okCount}/${items.length} items (${res.photoCount} photos)`);
    } catch (e) {
      setError(actionErrorMessage(e, "Sync failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!online && (
        <AlertBanner tone="warning" title="Offline">
          Scans and photos will queue on this device until you reconnect.
        </AlertBanner>
      )}
      {error && <ErrorBanner message={error} />}
      {message && (
        <AlertBanner tone="info" title="Sync">
          {message}
        </AlertBanner>
      )}
      <p className="text-sm text-[var(--muted-fg)]">
        Queued offline items: <span className="font-medium text-[var(--foreground)]">{queue.length}</span>
      </p>
      <Button type="button" size="sm" disabled={busy || queue.length === 0 || !online} onClick={() => void doSync()}>
        {busy ? "Syncing…" : "Sync offline queue"}
      </Button>
    </div>
  );
}

/** Enqueue a QR (and optional photo) when offline; returns true if queued. */
export async function queueOfflineScan(opts: {
  projectId: string;
  qrRaw: string;
  action?: string | null;
  note?: string | null;
  photoBase64?: string | null;
  photoMimeType?: string | null;
}): Promise<OfflineFieldItem> {
  const item = createOfflineItem(opts);
  await enqueueFieldItem(item);
  return item;
}
