"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PlayCircle } from "lucide-react";
import { setDemoEvidenceSnapshot } from "@/app/actions/demo";
import { cn } from "@/lib/utils";

/** Playback switcher for synthetic demo evidence. Never presented as live collection. */
export function SnapshotPlayback({
  projectId,
  active,
  snapshots,
  canSwitch,
}: {
  projectId: string;
  active: string | null;
  snapshots: Array<{ id: string; label: string; explain: string; capture: string }>;
  canSwitch: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3" data-testid="snapshot-playback">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <PlayCircle className="h-4 w-4 text-amber-700" aria-hidden />
        <h2 className="text-sm font-bold text-amber-900">Synthetic evidence playback</h2>
        <span className="text-xs text-amber-800">Replays stored synthetic captures. This is not a live SSH collection.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {snapshots.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!canSwitch || pending || isActive}
              onClick={() => {
                setError(null);
                setTarget(s.id);
                start(async () => {
                  const res = await setDemoEvidenceSnapshot({ projectId, snapshot: s.id });
                  if (!res.ok) setError(res.error);
                  router.refresh();
                });
              }}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-xs transition",
                isActive ? "border-amber-600 bg-white ring-2 ring-amber-500" : "border-amber-200 bg-white/70 hover:border-amber-500",
                (!canSwitch || pending) && !isActive && "cursor-not-allowed opacity-60",
              )}
              aria-pressed={isActive}
            >
              <span className="block text-sm font-bold">
                {s.label}
                {isActive ? " (active)" : pending && target === s.id ? " \u2026" : ""}
              </span>
              <span className="block text-[11px] text-[var(--muted-fg)]">Captured {new Date(s.capture).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
              <span className="mt-0.5 block">{s.explain}</span>
            </button>
          );
        })}
      </div>
      {!canSwitch && <p className="mt-2 text-xs text-amber-800">Only a project lead can switch playback.</p>}
      {error && <p className="mt-2 text-xs text-[var(--danger-ink)]">{error}</p>}
    </div>
  );
}
