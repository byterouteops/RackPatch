"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { guideFor } from "@/lib/help/hints";
import { cn } from "@/lib/utils";

const STORE = "rp.guide.collapsed";

/** Collapsible "How to use this page" card, resolved from the route. Remembers collapse per page. */
export function PageGuide() {
  const pathname = usePathname();
  const guide = guideFor(pathname);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (!guide) return;
    try {
      const map = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, boolean>;
      setCollapsed(map[guide.id] ?? true);
    } catch {
      setCollapsed(true);
    }
  }, [guide]);

  if (!guide) return null;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      const map = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, boolean>;
      map[guide.id] = next;
      localStorage.setItem(STORE, JSON.stringify(map));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <section aria-label="Page guide" className="mb-4 rounded-lg border border-[#bfdbfe] bg-[var(--info-soft)]/60 text-sm" data-testid="page-guide">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[var(--accent)]">
        <Lightbulb className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          How to use: {guide.title}
          <span className="ml-2 font-normal text-[var(--muted-fg)]">{guide.purpose}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !collapsed && "rotate-180")} aria-hidden />
      </button>
      {!collapsed && (
        <div className="border-t border-[#bfdbfe] px-4 py-3">
          <ol className="list-decimal space-y-1 pl-5 text-[var(--foreground)]">
            {guide.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {guide.tip && <p className="mt-2 text-xs text-[var(--muted-fg)]">Tip: {guide.tip}</p>}
        </div>
      )}
    </section>
  );
}
