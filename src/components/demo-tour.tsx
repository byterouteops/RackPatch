"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import type { DemoScenario } from "@/lib/demo/ai-hpc/scenarios";

const key = (projectId: string) => `rp.tour.${projectId}`;

/** Demo banner + 20-step guided tour (demo projects only). Step persists per project. */
export function DemoTour({
  projectId,
  snapshot,
  emailDomain,
  scenarios,
}: {
  projectId: string;
  snapshot: string | null;
  emailDomain: string;
  scenarios: DemoScenario[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    const v = localStorage.getItem(key(projectId));
    setStep(v === null ? null : Math.min(scenarios.length - 1, Math.max(0, Number(v) || 0)));
  }, [projectId, scenarios.length]);

  const go = (i: number) => {
    const s = scenarios[i];
    localStorage.setItem(key(projectId), String(i));
    setStep(i);
    router.push(`/app/projects/${projectId}${s.route}`);
  };
  const close = () => {
    localStorage.removeItem(key(projectId));
    setStep(null);
  };
  const s = step === null ? null : scenarios[step] ?? null;

  return (
    <div className="mb-4 space-y-2" data-testid="demo-banner">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span className="rounded bg-amber-800 px-1.5 py-0.5 font-bold tracking-wide text-white">DEMO / SYNTHETIC DATA</span>
        <span>
          Fictional organisation and equipment.
          {snapshot ? (
            <>
              {" "}Evidence playback snapshot: <strong>{snapshot}</strong>{" \u2014 synthetic captures, not a live collection."}
            </>
          ) : null}
        </span>
        {step === null && scenarios.length > 0 && (
          <button type="button" onClick={() => go(0)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 font-semibold text-white hover:bg-amber-800">
            <Compass className="h-3.5 w-3.5" aria-hidden /> Start demo tour
          </button>
        )}
      </div>
      {s && step !== null && (
        <div role="region" aria-label="Demo tour" className="rounded-lg border border-[var(--accent)] bg-white px-3 py-2 text-sm shadow-sm" data-testid="demo-tour">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-bold text-white">
              {step + 1}/{scenarios.length}
            </span>
            <strong className="min-w-0 flex-1">{s.title}</strong>
            <span className="text-xs text-[var(--muted-fg)]">
              Sign in as <code>{s.as}@{emailDomain}</code>
            </span>
            <button type="button" aria-label="Previous step" disabled={step === 0} onClick={() => go(step - 1)} className="rounded p-1 hover:bg-[var(--muted)] disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Next step" disabled={step === scenarios.length - 1} onClick={() => go(step + 1)} className="rounded p-1 hover:bg-[var(--muted)] disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" aria-label="End tour" onClick={close} className="rounded p-1 hover:bg-[var(--muted)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs text-[var(--foreground)]">
            {s.show.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[var(--success-ink)]">Expected: {s.expect}</p>
          {s.limitation && <p className="mt-0.5 text-xs text-[var(--warning-ink)]">Limitation: {s.limitation}</p>}
        </div>
      )}
    </div>
  );
}
