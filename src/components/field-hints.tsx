"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { hintForField } from "@/lib/help/hints";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function labelText(el: Field): string | null {
  if (el.labels && el.labels.length) return el.labels[0].textContent;
  const wrap = el.closest("label");
  if (wrap) return wrap.textContent;
  const by = el.getAttribute("aria-labelledby");
  if (by) return document.getElementById(by)?.textContent ?? null;
  return null;
}

function resolve(el: Field) {
  const explicit = el.getAttribute("data-hint");
  if (explicit) return explicit;
  const type = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : el.type;
  return hintForField([el.name, el.id, el.getAttribute("aria-label"), labelText(el), el.getAttribute("placeholder")], type);
}

/**
 * Global field help: every input/select/textarea gets a hover tooltip and, while focused,
 * a small hint bubble under it. Pages can override with data-hint="...".
 */
export function FieldHints() {
  const [hint, setHint] = useState<{ text: string; top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const isField = (t: EventTarget | null): t is Field =>
      t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
    const skip = (el: Field) => el.type === "hidden" || el.type === "submit" || el.type === "button" || el.closest("[data-no-hint]");

    const onOver = (e: Event) => {
      const el = e.target;
      if (!isField(el) || skip(el) || el.title) return;
      el.title = resolve(el);
    };
    const place = (el: Field) => {
      const r = el.getBoundingClientRect();
      setHint({ text: resolve(el), top: r.bottom + 4, left: r.left, width: Math.max(220, Math.min(r.width, 420)) });
    };
    const onFocus = (e: Event) => {
      const el = e.target;
      if (!isField(el) || skip(el)) return;
      if (!el.getAttribute("aria-description")) el.setAttribute("aria-description", resolve(el));
      place(el);
    };
    const onBlur = () => setHint(null);
    const onScroll = () => {
      const el = document.activeElement;
      if (isField(el) && !skip(el)) place(el);
    };
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!hint) return null;
  return (
    <div
      role="note"
      data-testid="field-hint"
      className="pointer-events-none fixed z-[60] flex items-start gap-1.5 rounded-md border border-[#bfdbfe] bg-white px-2.5 py-1.5 text-xs leading-snug text-[var(--foreground)] shadow-md"
      style={{ top: hint.top, left: hint.left, maxWidth: hint.width }}
    >
      <Info className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--accent-ink)]" aria-hidden />
      {hint.text}
    </div>
  );
}
