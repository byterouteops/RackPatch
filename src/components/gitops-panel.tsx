"use client";

import { useState } from "react";
import { previewGitOpsImport } from "@/app/actions/integrations";
import { Badge, Button, ErrorBanner, TextArea } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

const linkBtn =
  "inline-flex h-9 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 text-sm font-semibold tracking-wide text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]";

type Result = Awaited<ReturnType<typeof previewGitOpsImport>>;

export function GitOpsPanel({
  projectId,
  canExport,
  canImport,
  hasPlan,
}: {
  projectId: string;
  canExport: boolean;
  canImport: boolean;
  hasPlan: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onPreview() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await previewGitOpsImport({ projectId, text }));
    } catch (e) {
      setError(actionErrorMessage(e, "Dry-run failed"));
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/v1/projects/${projectId}/gitops`;

  return (
    <div className="space-y-4">
      {canExport && (
        <div className="flex flex-wrap gap-2">
          {(["yaml", "json"] as const).map((fmt) =>
            hasPlan ? (
              <a key={fmt} href={`${base}?format=${fmt}`} download className={linkBtn}>
                Download {fmt.toUpperCase()}
              </a>
            ) : (
              <span key={fmt} className={`${linkBtn} opacity-50`}>
                Download {fmt.toUpperCase()}
              </span>
            ),
          )}
          {!hasPlan && (
            <span className="self-center text-xs text-[var(--muted-fg)]">
              Publish a plan first.
            </span>
          )}
        </div>
      )}

      {canImport && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Import dry-run (YAML or JSON)</p>
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs"
            rows={8}
            disabled={busy}
            placeholder={`apiVersion: rackpatch/v1\nkind: CablePlan\ncables:\n  - cable_id: C-001\n    a_rack: R01\n    a_device: GPU-07\n    a_port: NIC 2\n    z_rack: R01\n    z_device: Leaf-02\n    z_port: Ethernet17\n    cable_type: DAC`}
          />
          <Button variant="secondary" disabled={busy || !text.trim()} onClick={() => void onPreview()}>
            Validate (dry-run)
          </Button>
        </div>
      )}

      {error && <ErrorBanner message={error} />}
      {result && !result.ok && (
        <ul className="list-disc pl-5 text-sm text-[var(--danger-ink)]">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {result?.ok && (
        <div className="space-y-2 rounded border border-[var(--border)] p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone={result.canPublish ? "success" : "danger"}>
              {result.canPublish ? "Valid" : "Has errors"}
            </Badge>
            <Badge tone="info">{result.rowCount} cables</Badge>
            {result.diff && (
              <>
                <Badge tone="success">{result.diff.added} added</Badge>
                <Badge tone="warning">{result.diff.modified} modified</Badge>
                <Badge tone="danger">{result.diff.removed} removed</Badge>
                <Badge tone="neutral">{result.diff.unchanged} unchanged</Badge>
              </>
            )}
          </div>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-[var(--danger-ink)]">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  #{e.lineNumber} {e.message}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[var(--muted-fg)]">
            Dry-run only. To publish, paste the CSV below into Plan import.
          </p>
          {result.rowCount > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold">Plan-import CSV</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">
                {result.csv}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
