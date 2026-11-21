"use client";

import { useState } from "react";
import { importLldpEvidence, previewLldpImport } from "@/app/actions/evidence";
import { SUPPORTED_EVIDENCE_FORMATS, type EvidenceFormat } from "@/lib/lldp/types";
import { AlertBanner, Button, ErrorBanner, Input, Select, TextArea } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

type FormatChoice = EvidenceFormat | "auto";

const MAX_CHARS = 2_000_000;
const TOO_LARGE = "This capture is larger than 2,000,000 characters. Import one device's output at a time.";

export function LldpImportForm({ projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  const [sourceDevice, setSourceDevice] = useState("");
  const [format, setFormat] = useState<FormatChoice>("auto");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewLldpImport>> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onPreview() {
    if (text.length > MAX_CHARS) return setError(TOO_LARGE);
    setPending(true);
    setError(null);
    try {
      const p = await previewLldpImport({ projectId, text, format });
      setPreview(p);
    } catch (err) {
      setError(actionErrorMessage(err, "Preview failed"));
    } finally {
      setPending(false);
    }
  }

  async function onImport() {
    if (text.length > MAX_CHARS) return setError(TOO_LARGE);
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await importLldpEvidence({
        projectId,
        text,
        sourceDevice,
        filename: "pasted.txt",
        format,
      });
      if (!result.ok) {
        setError(result.error || "Import failed");
      } else {
        setSuccess(
          `Imported ${result.observationCount} neighbors` +
            (result.format ? ` (${result.format})` : ""),
        );
        window.location.href = `/app/projects/${projectId}/exceptions`;
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Import failed"));
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

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block text-sm font-medium">
          Source device name
          <Input
            className="mt-1"
            value={sourceDevice}
            onChange={(e) => setSourceDevice(e.target.value)}
            placeholder="e.g. Leaf-02"
          />
        </label>
        <label className="block text-sm font-medium">
          Evidence format
          <Select
            className="mt-1"
            value={format}
            onChange={(e) => setFormat(e.target.value as FormatChoice)}
            aria-label="Evidence format"
          >
            <option value="auto">Auto-detect</option>
            {SUPPORTED_EVIDENCE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
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

      <p className="text-xs text-[var(--muted-fg)]">
        Supported: Cisco NX-OS / IOS-XE LLDP, Cisco CDP, Arista EOS LLDP, Juniper Junos LLDP.
        Missing neighbors never mean a cable is absent.
      </p>

      <label className="block text-sm font-medium">
        Neighbor evidence (CLI paste)
        <TextArea
          className="mt-1 font-mono text-xs"
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste show lldp neighbors detail or show cdp neighbors detail…"
        />
      </label>

      {preview?.failed && <ErrorBanner message={preview.error || "Parse failed"} />}

      {preview && !preview.failed && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="border border-[var(--border)] border-l-4 border-l-[var(--success)] bg-[var(--success-soft)] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--success-ink)]">
                {preview.observations.length}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Neighbors
              </p>
            </div>
            <div className="border border-[var(--border)] border-l-4 border-l-[var(--warning)] bg-[var(--warning-soft)] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--warning-ink)]">
                {preview.warnings.length}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Warnings
              </p>
            </div>
            <div className="border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--accent-soft)] p-4 text-center">
              <p className="truncate text-sm font-semibold text-[var(--accent-ink)]">
                {preview.format ?? "detected"}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Format
              </p>
            </div>
            <div className="border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--accent-soft)] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--accent-ink)]">Ready</p>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
                Parse status
              </p>
            </div>
          </div>

          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Local port</th>
                  <th>Remote system</th>
                  <th>Remote port</th>
                </tr>
              </thead>
              <tbody>
                {preview.observations.slice(0, 20).map((o, i) => (
                  <tr key={`${o.localInterface}-${i}`}>
                    <td className="font-medium">{o.localInterface}</td>
                    <td>{o.remoteSystemName ?? "—"}</td>
                    <td className="rp-mono">{o.remotePortId ?? "—"}</td>
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
