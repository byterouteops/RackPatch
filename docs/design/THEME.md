# RackPatch theme

Enterprise light theme with a navy sidebar, inspired by the user-supplied reference
`design-references/rackpatch/target-dashboard.jpg`. RackPatch branding only: no Cisco logos,
icons or proprietary assets are used. No glassmorphism, neon or purple accents.

## Typography

| Use | Font | Source | Licence |
| --- | --- | --- | --- |
| UI text, headings, KPIs | **Poppins** 400/500/600/700 | `src/fonts/poppins-latin-*.woff2` (from `@fontsource/poppins` 5.3.0) | SIL OFL 1.1, `src/fonts/Poppins-OFL.txt` |
| CLI output, cable IDs, code | **JetBrains Mono** 400/500/600 | `src/fonts/jetbrains-mono-latin-*.woff2` | SIL OFL 1.1, `src/fonts/JetBrainsMono-OFL.txt` |

**Candy Poppins is not implemented.** It is a proprietary face with no licence available to this
project. By user decision, OFL **Poppins** is used instead, and it is described as Poppins everywhere.
Both fonts are self-hosted through `next/font/local` (`src/app/layout.tsx`). No font is requested
from a third-party CDN; the CSP is `font-src 'self' data:`.

Type scale (px): page title 30 (24 below `sm`), section title 19, card title 18, KPI value 32
(long string values drop to 22 and truncate with a tooltip), body 14, table header 12 uppercase,
table cell 14/500. Utilities: `.rp-h1`, `.rp-h2`, `.rp-kpi` (tabular numerals).

## Colour tokens (`src/app/globals.css` `:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--sidebar` | `#071b33` | Sidebar background |
| `--accent` | `#0076d5` | Primary fills (white text on it passes AA) |
| `--accent-hover` | `#005ff8` | Action/hover, active nav gradient start |
| `--accent-ink` | `#005fb0` | **Blue text** on light surfaces (`#0076d5` fails AA for small text) |
| `--cyan` | `#00bceb` | Accent line, progress gradient end |
| `--background` | `#f4f9fd` | Page |
| `--card` | `#ffffff` | Cards |
| `--foreground` | `#101b3a` | Headings |
| `--body` | `#263b5a` | Body text |
| `--muted-fg` | `#526783` | Secondary text |
| `--border` | `#dce7f2` | Borders |
| `--success` / `--success-ink` | `#16a34a` / `#166534` | Fill / text |
| `--warning` / `--warning-ink` | `#f59e0b` / `#b45309` | Fill / text |
| `--danger` / `--danger-ink` | `#dc2626` / `#b91c1c` | Fill / text |

Rule: status colours are used as **fills or icons**; text uses the `-ink` variant. Automated axe
(WCAG 2.0/2.1 A and AA) reports zero serious or critical findings on all 48 routes.

## Components

Reuse `src/components/ui.tsx` (`Button` with `primary|secondary|outline|ghost|danger`, `Card`
with optional `icon`, `StatCard` with `sub` and `progress`, `ProgressBar` with `ariaLabel`,
`Badge`, `PageHeader`, `ErrorBanner` (announced with `role="alert"`), `AlertBanner`). Do not
build parallel copies.

- Grid layouts must allow shrinking: use `grid-cols-1` (which is `minmax(0,1fr)`) as the base and add
  `min-w-0` on flex/grid children that contain truncating text.
- `Button`/`StatCard` with an `/api/...` href render a plain `<a>`. A Next `<Link>` would prefetch,
  and therefore run, the route handler on every page view.
- Server-action errors shown to users go through `actionErrorMessage(err, fallback)`. Production
  builds redact thrown messages.
- Rack view (`rack-view-panel.tsx`) is generated from inventory: devices are ordered by real
  `rackUnit` when present; otherwise alphabetical, with the label "Order: alphabetical (no rack-unit data)".

## Base layer

Element rules (body, headings, `code/pre`, `:focus-visible`) live in `@layer base` so Tailwind
utilities can override them. `prefers-reduced-motion` disables animations and transitions.
