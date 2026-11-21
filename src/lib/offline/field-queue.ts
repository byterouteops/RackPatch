/**
 * Browser IndexedDB queue for offline QR scans + optional photo evidence.
 * Pure helpers are unit-tested; IDB wrappers run in the browser only.
 */

export const FIELD_QUEUE_DB = "rackpatch-field-queue";
export const FIELD_QUEUE_STORE = "items";
export const MAX_PHOTO_BYTES = 1_500_000;
/** Window event fired after the queue changes, so open sync panels re-read it. */
export const FIELD_QUEUE_CHANGED = "rackpatch:field-queue-changed";

export type OfflineFieldItem = {
  clientId: string;
  projectId: string;
  qrRaw: string;
  action: string | null;
  note: string | null;
  capturedAt: string;
  /** base64 photo payload (no data: prefix) */
  photoBase64: string | null;
  photoMimeType: string | null;
};

export type OfflineSyncPayload = {
  items: OfflineFieldItem[];
};

export function createOfflineItem(input: {
  projectId: string;
  qrRaw: string;
  action?: string | null;
  note?: string | null;
  photoBase64?: string | null;
  photoMimeType?: string | null;
  now?: Date;
  clientId?: string;
}): OfflineFieldItem {
  const photoBase64 = input.photoBase64?.trim() || null;
  if (photoBase64) {
    const approxBytes = Math.floor((photoBase64.length * 3) / 4);
    if (approxBytes > MAX_PHOTO_BYTES) {
      throw new Error(`Photo exceeds ${MAX_PHOTO_BYTES} byte limit`);
    }
  }
  return {
    clientId: input.clientId ?? `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    projectId: input.projectId,
    qrRaw: input.qrRaw.trim(),
    action: input.action?.trim() || null,
    note: input.note?.trim() || null,
    capturedAt: (input.now ?? new Date()).toISOString(),
    photoBase64,
    photoMimeType: photoBase64 ? input.photoMimeType || "image/jpeg" : null,
  };
}

export function validateOfflineSyncPayload(
  raw: unknown,
  expectedProjectId: string,
): { ok: true; items: OfflineFieldItem[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid payload" };
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return { ok: false, error: "items must be an array" };
  if (items.length === 0) return { ok: false, error: "No items to sync" };
  if (items.length > 100) return { ok: false, error: "Too many items (max 100)" };

  const out: OfflineFieldItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return { ok: false, error: "Invalid item" };
    const row = item as Partial<OfflineFieldItem>;
    if (!row.clientId || !row.projectId || !row.qrRaw || !row.capturedAt) {
      return { ok: false, error: "Item missing required fields" };
    }
    if (row.projectId !== expectedProjectId) {
      return { ok: false, error: "Item project mismatch" };
    }
    if (row.photoBase64) {
      const approx = Math.floor((row.photoBase64.length * 3) / 4);
      if (approx > MAX_PHOTO_BYTES) {
        return { ok: false, error: `Photo for ${row.clientId} exceeds size limit` };
      }
    }
    out.push({
      clientId: String(row.clientId).slice(0, 80),
      projectId: row.projectId,
      qrRaw: String(row.qrRaw).slice(0, 2000),
      action: row.action ? String(row.action).slice(0, 40) : null,
      note: row.note ? String(row.note).slice(0, 500) : null,
      capturedAt: String(row.capturedAt),
      photoBase64: row.photoBase64 ?? null,
      photoMimeType: row.photoMimeType ?? null,
    });
  }
  return { ok: true, items: out };
}

export function openFieldQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FIELD_QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FIELD_QUEUE_STORE)) {
        db.createObjectStore(FIELD_QUEUE_STORE, { keyPath: "clientId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function enqueueFieldItem(item: OfflineFieldItem): Promise<void> {
  const db = await openFieldQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FIELD_QUEUE_STORE, "readwrite");
    tx.objectStore(FIELD_QUEUE_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("enqueue failed"));
  });
  db.close();
  window.dispatchEvent(new Event(FIELD_QUEUE_CHANGED));
}

export async function listFieldQueue(projectId: string): Promise<OfflineFieldItem[]> {
  const db = await openFieldQueueDb();
  const all = await new Promise<OfflineFieldItem[]>((resolve, reject) => {
    const tx = db.transaction(FIELD_QUEUE_STORE, "readonly");
    const req = tx.objectStore(FIELD_QUEUE_STORE).getAll();
    req.onsuccess = () => resolve((req.result as OfflineFieldItem[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("list failed"));
  });
  db.close();
  return all.filter((i) => i.projectId === projectId);
}

export async function clearFieldQueueItems(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;
  const db = await openFieldQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FIELD_QUEUE_STORE, "readwrite");
    const store = tx.objectStore(FIELD_QUEUE_STORE);
    for (const id of clientIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("clear failed"));
  });
  db.close();
}
