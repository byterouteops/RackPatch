"use client";

import { useState } from "react";
import { retireCable, updateCableAsset } from "@/app/actions/lifecycle";
import { Button, ErrorBanner, Input } from "@/components/ui";

export function CableAssetForm({
  projectId,
  linkId,
  version,
  assetSerial,
  lengthMeters,
  retiredAt,
  retireNote,
  canEdit,
}: {
  projectId: string;
  linkId: string;
  version: number;
  assetSerial: string | null;
  lengthMeters: number | null;
  retiredAt: Date | string | null;
  retireNote: string | null;
  canEdit: boolean;
}) {
  const [serial, setSerial] = useState(assetSerial ?? "");
  const [length, setLength] = useState(lengthMeters?.toString() ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const retired = !!retiredAt;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await updateCableAsset({
        projectId,
        linkId,
        assetSerial: serial || null,
        lengthMeters: length ? Number(length) : null,
        expectedVersion: version,
      });
      if (res.conflict) setError(res.message ?? "Conflict");
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!confirm("Mark this cable as retired? Install status is unchanged.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await retireCable({
        projectId,
        linkId,
        retireNote: note || null,
        expectedVersion: version,
      });
      if (res.conflict) setError("message" in res ? res.message : "Conflict");
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retire failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {retired ? (
        <p className="text-sm text-[var(--muted-fg)]">
          Retired {new Date(retiredAt!).toLocaleString()}
          {retireNote ? ` — ${retireNote}` : ""}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                Asset serial
              </span>
              <Input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                disabled={!canEdit || busy}
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                Length (m)
              </span>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                disabled={!canEdit || busy}
                placeholder="Optional"
              />
            </label>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
                Save asset fields
              </Button>
            </div>
          )}
          {canEdit && (
            <div className="border-t border-[var(--border)] pt-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                placeholder="Retire note (optional)"
                className="mb-2"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void retire()}
              >
                Retire cable
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
