"use client";

import { useMemo, useState, useTransition } from "react";
import { saveLabelTemplate } from "@/app/actions/labels";
import {
  DEFAULT_LABEL_CONFIG,
  type LabelConfig,
} from "@/lib/labels/template";
import { Button, Input } from "@/components/ui";

type PreviewItem = {
  cableId: string;
  aDevice: string;
  aPort: string;
  aRack?: string;
  zDevice: string;
  zPort: string;
  zRack?: string;
  qr: string;
};

export function LabelDesigner({
  projectId,
  initial,
  previewItems,
  canSave,
}: {
  projectId: string;
  initial?: LabelConfig;
  previewItems: PreviewItem[];
  canSave: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("Standard QR");
  const [config, setConfig] = useState<LabelConfig>(initial ?? DEFAULT_LABEL_CONFIG);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sample = useMemo(() => previewItems.slice(0, 6), [previewItems]);

  function toggle<K extends keyof LabelConfig>(key: K, value: LabelConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {[
          [1, "Choose"],
          [2, "Customize"],
          [3, "Preview"],
          [4, "Print"],
        ].map(([n, label]) => (
          <li key={n as number}>
            <button
              type="button"
              onClick={() => setStep(n as 1 | 2 | 3 | 4)}
              className={
                step === n
                  ? "rounded-full bg-[var(--accent)] px-3 py-1 text-white"
                  : "rounded-full bg-[var(--muted)] px-3 py-1 text-[var(--muted-fg)]"
              }
            >
              {n}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="rp-card space-y-3 p-4">
          <p className="text-sm text-[var(--muted-fg)]">
            Start from the standard QR + cable ends template (browser print / Avery-style sheet).
            Zebra/driver export is available as ZPL download later; print uses the browser for now.
          </p>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
          <Button type="button" size="sm" onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="rp-card grid gap-3 p-4 sm:grid-cols-2">
          {(
            [
              ["showQr", "Show QR"],
              ["showCableId", "Show cable ID"],
              ["showEnds", "Show A/Z ends"],
              ["showRack", "Show racks"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(config[key])}
                onChange={(e) => toggle(key, e.target.checked as never)}
              />
              {label}
            </label>
          ))}
          <label className="text-sm">
            QR size ({config.qrSize}px)
            <input
              type="range"
              min={80}
              max={200}
              value={config.qrSize}
              onChange={(e) => toggle("qrSize", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <label className="text-sm">
            Columns ({config.columns})
            <input
              type="range"
              min={1}
              max={4}
              value={config.columns}
              onChange={(e) => toggle("columns", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="button" size="sm" onClick={() => setStep(3)}>
              Preview
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))` }}
          >
            {sample.map((item) => (
              <div key={item.cableId} className="rp-card flex items-center gap-3 p-3">
                {config.showQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.qr}
                    alt=""
                    width={Math.round(config.qrSize / 2)}
                    height={Math.round(config.qrSize / 2)}
                    className="shrink-0"
                  />
                )}
                <div
                  className="min-w-0 text-xs"
                  style={{ fontSize: `${0.75 * config.fontScale}rem` }}
                >
                  {config.showCableId && (
                    <p className="rp-mono font-bold">{item.cableId}</p>
                  )}
                  {config.showEnds && (
                    <>
                      <p className="truncate text-[var(--muted-fg)]">
                        A {config.showRack && item.aRack ? `${item.aRack}/` : ""}
                        {item.aDevice}/{item.aPort}
                      </p>
                      <p className="truncate text-[var(--muted-fg)]">
                        Z {config.showRack && item.zRack ? `${item.zRack}/` : ""}
                        {item.zDevice}/{item.zPort}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canSave && (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await saveLabelTemplate({
                    projectId,
                    name,
                    config,
                    makeDefault: true,
                  });
                  setMessage("Template saved as project default.");
                  setStep(4);
                })
              }
            >
              Save template & continue
            </Button>
          )}
          {!canSave && (
            <Button type="button" size="sm" onClick={() => setStep(4)}>
              Continue to print
            </Button>
          )}
          {message && <p className="text-sm text-[var(--success-ink)]">{message}</p>}
        </div>
      )}

      {step === 4 && (
        <div className="rp-card space-y-2 p-4 text-sm text-[var(--muted-fg)]">
          <p>
            Use <strong className="text-[var(--foreground)]">Print labels</strong> on the sheet
            below (browser print dialog). Template settings control the live preview; the printable
            sheet uses the saved default when present.
          </p>
          <p>Print history is recorded in project audit when you print from a managed session.</p>
        </div>
      )}
    </div>
  );
}
