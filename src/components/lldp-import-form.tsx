"use client";

import { useState } from "react";
import { importLldpEvidence, previewLldpImport } from "@/app/actions/evidence";
import { AlertBanner, Button, ErrorBanner, Input, TextArea } from "@/components/ui";

export function LldpImportForm({ projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  const [sourceDevice, setSourceDevice] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewLldpImport>> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onPreview() {
    setPending(true);
    setError(null);
    try {
      const p = await previewLldpImport({ projectId, text });
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPending(false);
    }
  }

  async function onImport() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await importLldpEvidence({
        projectId,
        text,
        sourceDevice,
        filename: "pasted.txt",
      });
      if (!result.ok) {
        setError(result.error || "Import failed");
      } else {
        setSuccess(`Imported ${result.observationCount} neighbors`);
        window.location.href = `/app/projects/${projectId}/exceptions`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && <ErrorBanner message={error} />}
      {success && (
        <AlertBanner tone="success" title="Import complete">
          {success}
        </AlertBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium">
          Source device name
          <Input
            className="mt-1"
            value={sourceDevice}
            onChange={(e) => setSourceDevice(e.target.value)}
            placeholder="e.g. Leaf-02"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!text.trim() || pending}
            onClick={() => void onPreview()}
          >
            Preview parse
          </Button>
          <Button
            type="button"
            disabled={!text.trim() || !sourceDevice.trim() || pending}
            onClick={() => void onImport()}
          >
            Import evidence
          </Button>
        </div>
      </div>

      <label className="block text-sm font-medium">
        NX-OS <code className="rounded bg-slate-100 px-1 text-xs">show lldp neighbors detail</code>{" "}
        output
        <TextArea
          className="mt-1 font-mono text-xs"
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {preview?.failed && <ErrorBanner message={preview.error || "Parse failed"} />}

      {preview && !preview.failed && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--success-soft)] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--success)]">
                {preview.observations.length}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Neighbors
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--warning-soft)] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--warning)]">
                {preview.warnings.length}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Warnings
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--accent)]">Ready</p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Parse status
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                <tr>
                  <th className="px-3 py-2">Local port</th>
                  <th className="px-3 py-2">Remote system</th>
                  <th className="px-3 py-2">Remote port</th>
                </tr>
              </thead>
              <tbody>
                {preview.observations.slice(0, 20).map((o, i) => (
                  <tr
                    key={`${o.localInterface}-${i}`}
                    className={i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}
                  >
                    <td className="px-3 py-2 font-medium">{o.localInterface}</td>
                    <td className="px-3 py-2">{o.remoteSystemName ?? "—"}</td>
                    <td className="px-3 py-2">{o.remotePortId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
