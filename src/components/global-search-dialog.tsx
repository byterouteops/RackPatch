"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, FolderKanban, Loader2, Search, Server } from "lucide-react";
import type { SearchHit } from "@/lib/search/global-search";
import { cn } from "@/lib/utils";

const ICONS = {
  cable: Cable,
  project: FolderKanban,
  device: Server,
} as const;

export function GlobalSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQ("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPending(true);
      try {
        const res = await fetch(`/api/me/search?q=${encodeURIComponent(q.trim())}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const data = res.ok ? ((await res.json()) as { hits: SearchHit[] }) : { hits: [] };
        setHits(data.hits);
      } catch {
        if (!ctrl.signal.aborted) setHits([]);
      } finally {
        if (!ctrl.signal.aborted) setPending(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        className="rounded-full p-2 text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label="Search (Ctrl+K)"
        title="Search (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <Search className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close search"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Global search"
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-fg)]" />
              ) : (
                <Search className="h-4 w-4 text-[var(--muted-fg)]" />
              )}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search cables, devices, projects…"
                className="h-12 flex-1 bg-transparent text-sm outline-none"
                aria-label="Search query"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto p-2">
              {q.trim().length < 2 && (
                <li className="px-3 py-6 text-center text-sm text-[var(--muted-fg)]">
                  Type at least 2 characters. Press Esc to close.
                </li>
              )}
              {q.trim().length >= 2 && !pending && hits.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-[var(--muted-fg)]">
                  No matches in your projects.
                </li>
              )}
              {hits.map((h) => {
                const Icon = ICONS[h.kind];
                return (
                  <li key={`${h.kind}-${h.id}`}>
                    <button
                      type="button"
                      onClick={() => go(h.href)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--muted)]",
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                          {h.title}
                        </span>
                        <span className="block truncate text-xs text-[var(--muted-fg)]">
                          {h.kind} · {h.subtitle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-[var(--border)] px-3 py-2 text-right text-[11px]">
              <a
                href="/app/search"
                className="font-semibold text-[var(--accent)] hover:underline"
                onClick={() => setOpen(false)}
              >
                Open full search
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
