import type { Page } from "@playwright/test";

export type LayoutIssue = { kind: "overlap" | "clipped" | "page-overflow"; detail: string };

/** Runs in the page. Returns layout issues visible in the current viewport-width layout. */
export async function scanLayout(page: Page): Promise<LayoutIssue[]> {
  return page.evaluate(() => {
    const issues: { kind: "overlap" | "clipped" | "page-overflow"; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) {
      const main = document.querySelector("main") ?? document.body;
      const wide = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed";
      };
      let culprits = Array.from(main.querySelectorAll("*")).filter(
        (el) => wide(el) && !(el.parentElement && el.parentElement !== main && wide(el.parentElement)),
      );
      if (culprits.length === 0) {
        culprits = Array.from(document.body.querySelectorAll("*")).filter(
          (el) => wide(el) && !Array.from(el.children).some((c) => wide(c)),
        );
      }
      culprits = culprits.slice(0, 3);
      const described = culprits
        .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 80)} right=${Math.round(el.getBoundingClientRect().right)}`);
      issues.push({ kind: "page-overflow", detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}: ${described.join(" | ")}` });
    }
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const label = (el: Element) => {
      const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.split(" ").slice(0, 3).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${t}"`;
    };
    /** Inside a scroll container or a deliberately clipped (sr-only) box: skip. */
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && p !== document.documentElement && p !== document.body) return p;
      }
      return null;
    };

    /** Text ranges ignore overflow clipping; intersect with every clipping ancestor. */
    const clipCache = new Map<Element, DOMRect | null>();
    const clipFor = (el: Element): DOMRect | null => {
      if (clipCache.has(el)) return clipCache.get(el)!;
      let box: DOMRect | null = null;
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const r = p.getBoundingClientRect();
          box = box
            ? new DOMRect(
                Math.max(box.left, r.left),
                Math.max(box.top, r.top),
                Math.max(0, Math.min(box.right, r.right) - Math.max(box.left, r.left)),
                Math.max(0, Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top)),
              )
            : r;
        }
      }
      clipCache.set(el, box);
      return box;
    };
    const clipped = (rect: DOMRect, clip: DOMRect | null) => {
      if (!clip) return rect;
      const l = Math.max(rect.left, clip.left);
      const t = Math.max(rect.top, clip.top);
      return new DOMRect(l, t, Math.max(0, Math.min(rect.right, clip.right) - l), Math.max(0, Math.min(rect.bottom, clip.bottom) - t));
    };

    const texts: { el: Element; rect: DOMRect; scroller: Element | null }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent || !n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || !visible(el)) continue;
      if (el.closest("[aria-hidden='true'], .sr-only, script, style, noscript, option, [data-layout-ignore]")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const clip = clipFor(el);
      for (const raw of Array.from(range.getClientRects())) {
        const rect = clipped(raw, clip);
        if (rect.width < 2 || rect.height < 2) continue;
        texts.push({ el, rect, scroller: inScroller(el) });
      }
    }

    const seen = new Set<string>();
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i];
        const b = texts[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        // Range boxes include the font's full ascent/descent (≈1.5em for Poppins), so tight
        // line-heights touch neighbours by a few px without any glyph collision.
        if (x > 2 && y > Math.max(3, 0.35 * Math.min(a.rect.height, b.rect.height))) {
          const key = `${label(a.el)}|${label(b.el)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push({ kind: "overlap", detail: `${label(a.el)} overlaps ${label(b.el)}` });
        }
      }
    }

    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!visible(el) || !el.textContent?.trim()) continue;
      if (el.closest("[aria-hidden='true'], .sr-only, [data-layout-ignore]")) continue;
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) continue;
      if (cs.textOverflow === "ellipsis") continue;
      const h = el as HTMLElement;
      const hiddenX = cs.overflowX === "hidden" || cs.overflowX === "clip";
      const hiddenY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      if (hiddenX && h.scrollWidth > h.clientWidth + 2 && el.children.length === 0) {
        issues.push({ kind: "clipped", detail: `${label(el)} text clipped horizontally (${h.scrollWidth}>${h.clientWidth})` });
      }
      if (hiddenY && h.scrollHeight > h.clientHeight + 3 && el.children.length === 0 && !/line-clamp/.test(h.className)) {
        issues.push({ kind: "clipped", detail: `${label(el)} text clipped vertically (${h.scrollHeight}>${h.clientHeight})` });
      }
    }
    return issues.slice(0, 50);
  });
}

