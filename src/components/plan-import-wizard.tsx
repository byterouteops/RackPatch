"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import {
  hashCsv,
  logPlanPreviewAudit,
  previewPlanImport,
  publishPlanImport,
} from "@/app/actions/plan";
import { Button, Card, ErrorBanner, Select, TextArea } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function PlanImportWizard({ projectId }: { projectId: string }) {
  const [csvText, setCsvText] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewPlanImport>> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onPreview() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const p = await previewPlanImport({
        projectId,
        csvText,
        mapping: Object.keys(mapping).length ? mapping : undefined,
      });
      setPreview(p);
      setMapping(p.mapping as Record<string, string>);
      await logPlanPreviewAudit(projectId, p.rowCount);
    } catch (err) {
      setError(actionErrorMessage(err, "Preview failed"));
    } finally {
      setPending(false);
    }
  }

  async function onPublish() {
    if (!preview?.canPublish) return;
    setPending(true);
    setError(null);
    try {
      const idempotencyKey = await hashCsv(csvText);
      const published = await publishPlanImport({
        projectId,
        csvText,
        mapping,
        note: undefined,
        idempotencyKey: idempotencyKey.slice(0, 64),
      });
      setResult(
        `Published revision ${published.revisionNumber}${
          published.deduplicated ? " (deduplicated)" : ""
        }`,
      );
      window.location.href = `/app/projects/${projectId}`;
    } catch (err) {
      setError(actionErrorMessage(err, "Publish failed"));
    } finally {
      setPending(false);
    }
  }

  const fields = preview?.fields ?? [
    "cable_id",
    "a_rack",
    "a_device",
    "a_port",
    "z_rack",
    "z_device",
    "z_port",
    "cable_type",
    "notes",
  ];

  return (
    <div className="space-y-5">
      {error && <ErrorBanner message={error} />}
      {result && (
        <div className="rounded-lg border border-emerald-200 bg-[var(--success-soft)] px-4 py-3 text-sm text-emerald-900">
          {result}
        </div>
      )}

      <label className="block text-sm font-medium">
        Paste CSV
        <TextArea
          className="mt-1 font-mono text-xs"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={10}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !csvText.trim()}
          onClick={() => void onPreview()}
        >
          Preview import
        </Button>
        <Button
          type="button"
          disabled={pending || !preview?.canPublish}
          onClick={() => void onPublish()}
        >
          Publish revision
        </Button>
      </div>

      {preview && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Field mapping" description="Map CSV columns to RackPatch fields.">
            <div className="space-y-3">
              {fields.map((field) => (
                <label key={field} className="block text-sm">
                  <span className="font-medium text-[var(--foreground)]">{field}</span>
                  <Select
                    className="mt-1"
                    value={mapping[field] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [field]: e.target.value,
                      }))
                    }
                  >
                    <option value="">— not mapped —</option>
                    {(preview.headers.length
                      ? preview.headers
                      : Object.values(preview.mapping).filter(Boolean)
                    ).map((h) => (
                      <option key={`${field}-${h}`} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => void onPreview()}
              >
                Re-validate mapping
              </Button>
            </div>
          </Card>

          <Card title="Validation" description="Fix errors before publishing.">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[var(--accent-soft)] p-3 text-center">
                  <FileSpreadsheet className="mx-auto h-5 w-5 text-[var(--accent-ink)]" aria-hidden />
                  <p className="mt-1 text-2xl font-semibold">{preview.rowCount}</p>
                  <p className="text-xs text-[var(--muted-fg)]">Rows</p>
                </div>
                <div className="rounded-xl bg-[var(--danger-soft)] p-3 text-center">
                  <AlertCircle className="mx-auto h-5 w-5 text-[var(--danger-ink)]" aria-hidden />
                  <p className="mt-1 text-2xl font-semibold">{preview.errors.length}</p>
                  <p className="text-xs text-[var(--muted-fg)]">Errors</p>
                </div>
                <div className="rounded-xl bg-[var(--success-soft)] p-3 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-[var(--success-ink)]" aria-hidden />
                  <p className="mt-1 text-2xl font-semibold">
                    {preview.canPublish ? "Ready" : "—"}
                  </p>
                  <p className="text-xs text-[var(--muted-fg)]">Status</p>
                </div>
              </div>

              {preview.errors.length > 0 && (
                <ul className="max-h-48 space-y-2 overflow-auto text-sm text-red-800">
                  {preview.errors.slice(0, 12).map((e, i) => (
                    <li
                      key={`${e.lineNumber}-${i}`}
                      className="rounded-lg border border-red-100 bg-white px-3 py-2"
                    >
                      Line {e.lineNumber}: {e.message}
                    </li>
                  ))}
                </ul>
              )}

              {preview.rows[0] && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                    Sample normalized row
                  </p>
                  <pre tabIndex={0} className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                    {JSON.stringify(preview.rows[0], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
