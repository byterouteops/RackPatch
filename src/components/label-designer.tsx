"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, LayoutTemplate, Plus, Printer, Save, Settings2, Tag } from "lucide-react";
import { recordLabelPrint, saveLabelTemplate } from "@/app/actions/labels";
import { DEFAULT_LABEL_CONFIG, type LabelConfig } from "@/lib/labels/template";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type LabelItem = {
  id: string;
  cableId: string;
  aDevice: string;
  aPort: string;
  aRack: string;
  zDevice: string;
  zPort: string;
  zRack: string;
  cableType: string | null;
  qr: string;
};

export type SavedTemplate = { id: string; name: string; config: LabelConfig; isDefault: boolean };
export type PrintEvent = { id: string; summary: string; at: string; actor: string };

const PRESETS: Array<{ id: string; name: string; hint: string; config: LabelConfig }> = [
  { id: "standard", name: "Cable Label (Standard)", hint: "Cable ID + From/To + QR", config: DEFAULT_LABEL_CONFIG },
  {
    id: "compact",
    name: "Cable Label (Compact)",
    hint: "Cable ID + QR (small)",
    config: { ...DEFAULT_LABEL_CONFIG, showEnds: false, qrSize: 100, columns: 4 },
  },
  {
    id: "port",
    name: "Port Label (Ends + Rack)",
    hint: "Rack/Device/Port, no QR",
    config: { ...DEFAULT_LABEL_CONFIG, showQr: false, showRack: true, columns: 3 },
  },
  {
    id: "large",
    name: "Large QR Label",
    hint: "Big QR for field scanning",
    config: { ...DEFAULT_LABEL_CONFIG, qrSize: 220, columns: 2, fontScale: 1.2 },
  },
];

const FIELDS: Array<[keyof LabelConfig, string]> = [
  ["showCableId", "Cable ID"],
  ["showEnds", "From / To (Device/Port)"],
  ["showRack", "Rack"],
  ["showQr", "QR Code (link to cable)"],
];

const STEPS = [
  { n: 1, title: "Choose Template", sub: "Select or create label" },
  { n: 2, title: "Customize", sub: "Fields & layout" },
  { n: 3, title: "Preview", sub: "Check design" },
  { n: 4, title: "Print", sub: "Single or batch" },
];

function LabelCard({ item, config, large }: { item: LabelItem; config: LabelConfig; large?: boolean }) {
  const qr = Math.round((config.qrSize / 2) * (large ? 1.3 : 1));
  return (
    <div className="flex break-inside-avoid items-stretch overflow-hidden rounded-lg border-2 border-[var(--sidebar)] bg-white">
      <div className="flex w-6 shrink-0 items-center justify-center bg-[var(--accent)] text-white">
        <span className="rotate-[-90deg] whitespace-nowrap text-[9px] font-bold tracking-wider">RackPatch</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 p-2.5">
        <div className="min-w-0 flex-1" style={{ fontSize: `${(large ? 0.95 : 0.75) * config.fontScale}rem` }}>
          {config.showCableId && (
            <p className={cn("rp-mono font-extrabold leading-tight text-[var(--foreground)]", large ? "text-3xl" : "text-base")}>{item.cableId}</p>
          )}
          {config.showEnds && (
            <div className="mt-1 space-y-0.5 text-[var(--foreground)]">
              <p className="truncate">
                <span className="font-semibold text-[var(--accent)]">From:</span> {config.showRack ? `${item.aRack}-` : ""}
                {item.aDevice} <span className="rp-mono">{item.aPort}</span>
              </p>
              <p className="truncate">
                <span className="font-semibold text-[var(--z-end)]">To:</span> {config.showRack ? `${item.zRack}-` : ""}
                {item.zDevice} <span className="rp-mono">{item.zPort}</span>
              </p>
            </div>
          )}
          {!config.showEnds && config.showRack && (
            <p className="mt-1 truncate text-[var(--muted-fg)]">
              {item.aRack} {"\u2194"} {item.zRack}
            </p>
          )}
          {large && item.cableType && <p className="mt-1.5 border-t border-[var(--border)] pt-1 text-xs text-[var(--muted-fg)]">Type: {item.cableType}</p>}
        </div>
        {config.showQr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.qr} alt="" width={qr} height={qr} className="shrink-0" />
        )}
      </div>
    </div>
  );
}

export function LabelDesigner({
  projectId,
  initial,
  items,
  totalLinks,
  templates,
  history,
  canSave,
}: {
  projectId: string;
  initial?: LabelConfig;
  items: LabelItem[];
  totalLinks: number;
  templates: SavedTemplate[];
  history: PrintEvent[];
  canSave: boolean;
}) {
  const router = useRouter();
  const defaultTpl = templates.find((t) => t.isDefault);
  const [templateId, setTemplateId] = useState<string>(defaultTpl ? defaultTpl.id : "standard");
  const [name, setName] = useState(defaultTpl?.name ?? "Cable Label (Standard)");
  const [config, setConfig] = useState<LabelConfig>(initial ?? DEFAULT_LABEL_CONFIG);
  const [rack, setRack] = useState("");
  const [copies, setCopies] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);

  const racks = useMemo(() => [...new Set(items.flatMap((i) => [i.aRack, i.zRack]))].sort(), [items]);
  const batch = useMemo(() => (rack ? items.filter((i) => i.aRack === rack || i.zRack === rack) : items), [items, rack]);
  const sheet = useMemo(() => batch.flatMap((i) => Array.from({ length: copies }, (_, c) => ({ ...i, key: `${i.id}:${c}` }))), [batch, copies]);
  const sample = items[0];

  function choose(id: string, cfg: LabelConfig, label: string) {
    setTemplateId(id);
    setConfig(cfg);
    setName(label);
    setStep(2);
  }

  function set<K extends keyof LabelConfig>(key: K, value: LabelConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setStep((s) => Math.max(s, 2));
  }

  function print() {
    setStep(4);
    startTransition(async () => {
      try {
        await recordLabelPrint({ projectId, template: name, count: sheet.length, scope: rack ? `Rack ${rack}` : "All cables" });
      } catch {
        // printing still proceeds when audit fails
      }
      window.print();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="no-print">
        <ol className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => setStep(s.n)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  step === s.n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white hover:border-[var(--accent)]",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    step === s.n ? "bg-white text-[var(--accent)]" : step > s.n ? "bg-[var(--success)] text-white" : "bg-[var(--muted)] text-[var(--muted-fg)]",
                  )}
                >
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span>
                  <span className="block text-sm font-bold">{s.title}</span>
                  <span className={cn("block text-[11px]", step === s.n ? "text-white/80" : "text-[var(--muted-fg)]")}>{s.sub}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-[var(--success-soft)] px-3 py-2.5">
            <Check className="h-6 w-6 text-[var(--success)]" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-[var(--success-ink)]">{sheet.length} labels ready</span>
              <span className="block text-[11px] text-[var(--muted-fg)]">Browser print / PDF</span>
            </span>
          </li>
        </ol>

        <div className="mb-4 grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <section className="rp-card overflow-hidden" aria-label="Label templates">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
                <LayoutTemplate className="h-4 w-4" aria-hidden />
                Label Templates
              </h2>
            </div>
            <ul className="space-y-1.5 p-2">
              {templates.map((t) => (
                <TemplateRow key={t.id} active={templateId === t.id} title={t.name} hint={t.isDefault ? "Saved \u00b7 project default" : "Saved template"} onClick={() => choose(t.id, t.config, t.name)} />
              ))}
              {PRESETS.map((p) => (
                <TemplateRow key={p.id} active={templateId === p.id} title={p.name} hint={p.hint} onClick={() => choose(p.id, p.config, p.name)} />
              ))}
            </ul>
          </section>

          <section className="rp-card overflow-hidden" aria-label="Template editor">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
                <Tag className="h-4 w-4" aria-hidden />
                Template Editor {"\u2014"} {name}
              </h2>
              {canSave && (
                <div className="flex items-center gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" className="h-8 w-44 text-xs" />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending || !name.trim()}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await saveLabelTemplate({ projectId, name: name.trim(), config, makeDefault: true });
                          setMessage("Saved as project default.");
                          router.refresh();
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : "Save failed");
                        }
                      })
                    }
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden />
                    Save
                  </Button>
                </div>
              )}
            </div>
            <div className="bg-[var(--muted)]/60 p-6">
              {sample ? (
                <div className="mx-auto max-w-xl rounded-lg ring-2 ring-[var(--accent)] ring-offset-4 ring-offset-[var(--muted)]">
                  <LabelCard item={sample} config={config} large />
                </div>
              ) : (
                <p className="text-center text-sm text-[var(--muted-fg)]">No cables to preview.</p>
              )}
            </div>
            {message && <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--success-ink)]">{message}</p>}
          </section>

          <section className="rp-card overflow-hidden" aria-label="Label preview samples">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
                <FileText className="h-4 w-4" aria-hidden />
                Label Preview (Samples)
              </h2>
            </div>
            <div className="space-y-2 p-3">
              {items.slice(1, 4).map((i) => (
                <LabelCard key={i.id} item={i} config={config} />
              ))}
            </div>
          </section>
        </div>

        <div className="mb-4 grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <section className="rp-card p-4" aria-label="Label fields">
            <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
              <Plus className="h-4 w-4" aria-hidden />
              Label Fields
            </h2>
            <ul className="space-y-2 text-[13px]">
              {FIELDS.map(([key, label]) => (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={Boolean(config[key])} onChange={(e) => set(key, e.target.checked as never)} className="h-4 w-4 accent-[var(--accent)]" />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rp-card p-4" aria-label="Print options">
            <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
              <Settings2 className="h-4 w-4" aria-hidden />
              Print Options
            </h2>
            <div className="space-y-3 text-[13px]">
              <Range label={`QR size (${config.qrSize}px)`} min={80} max={240} value={config.qrSize} onChange={(v) => set("qrSize", v)} />
              <Range label={`Columns per sheet (${config.columns})`} min={1} max={4} value={config.columns} onChange={(v) => set("columns", v)} />
              <Range label={`Text scale (${config.fontScale.toFixed(1)}\u00d7)`} min={0.8} max={1.4} step={0.1} value={config.fontScale} onChange={(v) => set("fontScale", v)} />
              <div className="flex items-center justify-between">
                <span>Copies per label</span>
                <span className="flex items-center gap-1">
                  <button type="button" className="h-7 w-7 rounded-md border border-[var(--border)]" onClick={() => setCopies((c) => Math.max(1, c - 1))} aria-label="Fewer copies">
                    {"\u2212"}
                  </button>
                  <span className="w-6 text-center font-semibold">{copies}</span>
                  <button type="button" className="h-7 w-7 rounded-md border border-[var(--border)]" onClick={() => setCopies((c) => Math.min(4, c + 1))} aria-label="More copies">
                    +
                  </button>
                </span>
              </div>
            </div>
          </section>

          <section className="rp-card p-4" aria-label="Batch print">
            <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
              <Printer className="h-4 w-4" aria-hidden />
              Batch Print
            </h2>
            <div className="space-y-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" checked={!rack} onChange={() => setRack("")} className="accent-[var(--accent)]" />
                All cables ({items.length}
                {totalLinks > items.length ? ` of ${totalLinks}` : ""})
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" checked={Boolean(rack)} onChange={() => setRack(racks[0] ?? "")} className="accent-[var(--accent)]" />
                By rack
                <select
                  value={rack}
                  onChange={(e) => setRack(e.target.value)}
                  className="ml-auto h-8 rounded-md border border-[var(--border)] bg-white px-2 text-xs"
                  aria-label="Rack"
                >
                  <option value="">{"\u2014"}</option>
                  {racks.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" className="mt-2 w-full" onClick={print} disabled={pending || sheet.length === 0}>
                <Printer className="h-4 w-4" aria-hidden />
                Print Labels ({sheet.length})
              </Button>
              {totalLinks > items.length && <p className="text-[11px] text-[var(--muted-fg)]">Sheet limit: first {items.length} cables by ID.</p>}
            </div>
          </section>

          <section className="rp-card p-4" aria-label="Recent print history">
            <h2 className="rp-display mb-3 text-[15px] font-bold">Recent Print History</h2>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted-fg)]">No label prints recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-[12px]">
                {history.map((h) => (
                  <li key={h.id} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      {h.summary}
                      <span className="block text-[11px] text-[var(--muted-fg)]">
                        {h.actor} {"\u00b7"} {h.at}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="mb-3 text-sm text-[var(--muted-fg)]">Printable sheet ({sheet.length} labels) {"\u2014"} uses the settings above.</p>
      </div>

      <div className="grid gap-3 print:grid-cols-2" style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))` }}>
        {sheet.map((i) => (
          <LabelCard key={i.key} item={i} config={config} />
        ))}
      </div>
    </div>
  );
}

function TemplateRow({ active, title, hint, onClick }: { active: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
          active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--accent)]",
        )}
      >
        <Tag className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13px] font-semibold", active && "text-[var(--accent)]")}>{title}</span>
          <span className="block truncate text-[11px] text-[var(--muted-fg)]">{hint}</span>
        </span>
        {active && <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />}
      </button>
    </li>
  );
}

function Range({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  );
}
