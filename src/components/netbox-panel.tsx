"use client";

import { useState } from "react";
import {
  applyNetBoxPlanImport,
  previewNetBoxFixture,
  removeNetBoxConfig,
  runNetBoxDryRun,
  saveNetBoxConfig,
  writeNetBoxCableLabels,
} from "@/app/actions/integrations";
import type { NetBoxPreview } from "@/lib/netbox";
import { AlertBanner, Badge, Button, ErrorBanner, Input, TextArea } from "@/components/ui";

const FIXTURE_EXAMPLE = `{
  "devices": [
    { "id": 1, "name": "GPU-07", "rack": { "name": "R01" } },
    { "id": 2, "name": "Leaf-02", "rack": { "name": "R01" } }
  ],
  "cables": [
    {
      "id": 10,
      "type": "dac-passive",
      "a_terminations": [{ "object_type": "dcim.interface", "object": { "name": "NIC 2", "device": { "name": "GPU-07" } } }],
      "b_terminations": [{ "object_type": "dcim.interface", "object": { "name": "Ethernet17", "device": { "name": "Leaf-02" } } }]
    }
  ]
}`;

type Config = { baseUrl: string; enabled: boolean; writeEnabled: boolean } | null;

export function NetBoxPanel({
  projectId,
  config,
  canManage,
  canPreview,
}: {
  projectId: string;
  config: Config;
  canManage: boolean;
  canPreview: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [writeEnabled, setWriteEnabled] = useState(config?.writeEnabled ?? false);
  const [fixture, setFixture] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<NetBoxPreview | null>(null);
  const [confirmWrite, setConfirmWrite] = useState("");

  async function run<T>(fn: () => Promise<T>, after?: (v: T) => void) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      after?.(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function showResult(
    res: { ok: true; preview: NetBoxPreview } | { ok: false; error: string },
  ) {
    if (res.ok) {
      setPreview(res.preview);
      setMessage("Dry-run complete. Preview only until you apply or write.");
    } else {
      setPreview(null);
      setError(res.error);
    }
  }

  return (
    <div className="space-y-5">
      <AlertBanner tone="info">
        Dry-run fetches are read-only. You can apply mappable cables into a RackPatch plan revision,
        or (when writes are enabled) PATCH NetBox cable labels after typing WRITE NETBOX.
        Only https:// URLs are accepted; private ranges need{" "}
        <code>INTEGRATION_ALLOW_PRIVATE_NETWORKS=true</code>.
      </AlertBanner>
      {error && <ErrorBanner message={error} />}
      {message && <p className="text-sm text-[var(--success-ink)]">{message}</p>}

      {canManage && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://netbox.example.com"
              disabled={busy}
              className="flex-1"
              aria-label="NetBox base URL"
            />
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={config ? "Token saved (leave blank to keep)" : "NetBox API token"}
              disabled={busy}
              autoComplete="off"
              className="flex-1"
              aria-label="NetBox API token"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={writeEnabled}
              onChange={(e) => setWriteEnabled(e.target.checked)}
              disabled={busy}
            />
            Allow NetBox writes (PATCH cable labels)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !baseUrl.trim() || (!config && !token.trim())}
              onClick={() =>
                void run(
                  () =>
                    saveNetBoxConfig({
                      projectId,
                      baseUrl,
                      token: token || undefined,
                      enabled,
                      writeEnabled,
                    }),
                  (r) => {
                    setToken("");
                    setBaseUrl(r.baseUrl);
                    setMessage("Saved. Token is stored encrypted and never shown again.");
                  },
                )
              }
            >
              Save connection
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !config?.enabled}
              onClick={() => void run(() => runNetBoxDryRun({ projectId }), showResult)}
            >
              Dry-run fetch
            </Button>
            {config && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => removeNetBoxConfig({ projectId }),
                    () => {
                      setBaseUrl("");
                      setMessage("NetBox connection removed.");
                    },
                  )
                }
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      {canPreview && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">No live NetBox? Paste a NetBox-style JSON export</p>
          <TextArea
            value={fixture}
            onChange={(e) => setFixture(e.target.value)}
            placeholder={FIXTURE_EXAMPLE}
            className="font-mono text-xs"
            disabled={busy}
            rows={8}
          />
          <Button
            variant="secondary"
            disabled={busy || fixture.trim().length < 2}
            onClick={() =>
              void run(() => previewNetBoxFixture({ projectId, json: fixture }), showResult)
            }
          >
            Preview JSON
          </Button>
        </div>
      )}

      {preview && (
        <PreviewResult
          preview={preview}
          canApply={canPreview}
          canWrite={canManage && (writeEnabled || !!config?.writeEnabled)}
          busy={busy}
          confirmWrite={confirmWrite}
          setConfirmWrite={setConfirmWrite}
          onApply={() =>
            void run(
              () =>
                applyNetBoxPlanImport({
                  projectId,
                  planCsv: preview.planCsv,
                  confirm: true,
                  note: "Applied from NetBox preview UI",
                }),
              (r) =>
                setMessage(
                  `Applied as plan r${r.revisionNumber} (${r.cableCount} cables)${r.deduplicated ? " — deduplicated" : ""}.`,
                ),
            )
          }
          onWrite={() =>
            void run(
              () =>
                writeNetBoxCableLabels({
                  projectId,
                  confirmPhrase: "WRITE NETBOX",
                  updates: preview.cables.rows.slice(0, 25).map((r) => ({
                    cableId: r.cableId,
                    label: r.cableId,
                  })),
                }),
              (r) =>
                setMessage(
                  `NetBox write: ${r.wrote} updated${r.errors.length ? `, ${r.errors.length} errors` : ""}.`,
                ),
            )
          }
        />
      )}
    </div>
  );
}

function PreviewResult({
  preview,
  canApply,
  canWrite,
  busy,
  confirmWrite,
  setConfirmWrite,
  onApply,
  onWrite,
}: {
  preview: NetBoxPreview;
  canApply: boolean;
  canWrite: boolean;
  busy: boolean;
  confirmWrite: string;
  setConfirmWrite: (v: string) => void;
  onApply: () => void;
  onWrite: () => void;
}) {
  return (
    <div className="space-y-3 rounded border border-[var(--border)] p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge tone="info">{preview.devices.total} devices</Badge>
        <Badge tone="success">{preview.devices.matchedPlan} in plan</Badge>
        <Badge tone="neutral">{preview.devices.matchedAlias} via alias</Badge>
        <Badge tone="warning">{preview.devices.unmatched} unmatched</Badge>
        <Badge tone="info">{preview.cables.total} cables</Badge>
        <Badge tone="success">{preview.cables.newToPlan} new</Badge>
        <Badge tone="neutral">{preview.cables.alreadyInPlan} already in plan</Badge>
        <Badge tone={preview.cables.skipped ? "warning" : "neutral"}>
          {preview.cables.skipped} skipped
        </Badge>
      </div>
      {preview.errors.length > 0 && (
        <ul className="list-disc pl-5 text-[var(--danger)]">
          {preview.errors.slice(0, 20).map((e, i) => (
            <li key={i}>
              {e.cableId ? `${e.cableId}: ` : ""}
              {e.message}
            </li>
          ))}
        </ul>
      )}
      {preview.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-[var(--muted-fg)]">
          {preview.warnings.slice(0, 20).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {preview.cables.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--muted-fg)]">
                <th className="py-1 pr-3">Cable</th>
                <th className="pr-3">A end</th>
                <th className="pr-3">Z end</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {preview.cables.rows.slice(0, 25).map((r) => (
                <tr key={r.cableId} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-3 font-mono">{r.cableId}</td>
                  <td className="pr-3">
                    {r.aRack} / {r.aDevice} {r.aPort}
                  </td>
                  <td className="pr-3">
                    {r.zRack} / {r.zDevice} {r.zPort}
                  </td>
                  <td>{r.cableType ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.cables.mappable > 0 && canApply && (
        <Button disabled={busy || preview.errors.length > 0} onClick={onApply}>
          Apply mappable cables to plan
        </Button>
      )}
      {canWrite && preview.cables.rows.length > 0 && (
        <div className="space-y-2 rounded border border-[var(--warning, #f59e0b)]/30 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">
            Write labels to NetBox (PATCH). Type WRITE NETBOX to confirm.
          </p>
          <Input
            value={confirmWrite}
            onChange={(e) => setConfirmWrite(e.target.value)}
            placeholder="WRITE NETBOX"
            disabled={busy}
            aria-label="Confirm NetBox write"
          />
          <Button
            variant="danger"
            disabled={busy || confirmWrite !== "WRITE NETBOX"}
            onClick={onWrite}
          >
            Push labels to NetBox
          </Button>
        </div>
      )}
      {preview.cables.mappable > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold">
            Plan-import CSV
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">
            {preview.planCsv}
          </pre>
        </details>
      )}
    </div>
  );
}
