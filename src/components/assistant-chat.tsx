"use client";

import { useRef, useState, useTransition } from "react";
import { askAssistant } from "@/app/actions/assistant";
import { Badge, Button, ErrorBanner, Input } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; sources: string[]; llmEnhanced: boolean };

/** Client-side history only (CE): nothing is persisted between visits. */
export function AssistantChat({
  projectId,
  suggestions,
}: {
  projectId: string;
  suggestions: string[];
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [followUps, setFollowUps] = useState<string[]>(suggestions);
  const endRef = useRef<HTMLDivElement>(null);

  function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setError(null);
    setMessage("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    startTransition(async () => {
      try {
        const res = await askAssistant({ projectId, message: q });
        setTurns((t) => [
          ...t,
          { role: "assistant", text: res.text, sources: res.sources, llmEnhanced: res.llmEnhanced },
        ]);
        if (res.suggestions.length > 0) setFollowUps(res.suggestions);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
      } catch (err) {
        setError(actionErrorMessage(err, "Could not get an answer"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div
        className="max-h-[28rem] min-h-[10rem] space-y-3 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3"
        aria-live="polite"
      >
        {turns.length === 0 && (
          <p className="text-sm text-[var(--muted-fg)]">
            Ask about mismatches, stale evidence, swap fixes, capacity, or progress.
          </p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm text-white">
                {t.text}
              </p>
            </div>
          ) : (
            <div
              key={i}
              className="max-w-[95%] rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2"
            >
              <p className="whitespace-pre-wrap text-sm">{t.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-fg)]">
                {t.sources.length > 0 && <span>From: {t.sources.join(", ")}</span>}
                <Badge tone={t.llmEnhanced ? "info" : "neutral"}>
                  {t.llmEnhanced ? "LLM-reworded, grounded" : "Rule-based"}
                </Badge>
              </div>
            </div>
          ),
        )}
        {pending && <p className="text-sm text-[var(--muted-fg)]">Checking project data…</p>}
        <div ref={endRef} />
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex flex-wrap gap-2">
        {followUps.map((s) => (
          <Button key={s} type="button" size="sm" variant="secondary" disabled={pending} onClick={() => ask(s)}>
            {s}
          </Button>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(message);
        }}
      >
        <Input
          required
          maxLength={500}
          placeholder="Ask about this project…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1"
          aria-label="Question"
        />
        <Button type="submit" disabled={pending}>
          Ask
        </Button>
      </form>
    </div>
  );
}
