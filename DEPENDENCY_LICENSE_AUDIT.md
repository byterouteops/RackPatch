# RackPatch — Dependency License Audit

**Audit date:** 2026-11-21  
**Target project license:** Apache-2.0  
**Verdict:** **PASS** — no GPL/AGPL/commercial runtime blockers for Apache-2.0 redistribution.

---

## 1. Direct runtime dependencies

| Package | Installed | License | Source | Apache-2.0 compatible | Attribution | Action |
|---------|-----------|---------|--------|----------------------|-------------|--------|
| `@prisma/client` | 6.19.0 | Apache-2.0 | package.json / LICENSE | Yes | NOTICE if required | Keep |
| `bcryptjs` | 3.0.3 | BSD-3-Clause | LICENSE | Yes | Copyright + license | Keep |
| `better-auth` | 1.7.27 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `clsx` | 2.1.1 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `csv-parse` | 7.0.3 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `date-fns` | 4.4.0 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `lucide-react` | 1.77.0 | ISC | LICENSE | Yes | Copyright + license | Keep |
| `nanoid` | 6.0.2 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `next` | 15.1.3 | MIT | LICENSE | Yes | Copyright + license | Keep; note optional sharp |
| `qrcode` | 1.5.4 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `react` | 19.3.x | MIT | LICENSE | Yes | Copyright + license | Keep |
| `react-dom` | 19.3.x | MIT | LICENSE | Yes | Copyright + license | Keep |
| `tailwind-merge` | 3.7.1 | MIT | LICENSE | Yes | Copyright + license | Keep |
| `zod` | 4.6.7 | MIT | LICENSE | Yes | Copyright + license | Keep |

---

## 2. Direct devDependencies

| Package | License | Notes |
|---------|---------|-------|
| `prisma` | Apache-2.0 | CLI |
| `typescript` | Apache-2.0 | Dev |
| `eslint`, `eslint-config-next`, `@eslint/eslintrc` | MIT | Dev |
| `vitest`, `tsx`, `tailwindcss`, `postcss` | MIT | Dev/build |
| `@types/*` | MIT | Dev |

Dev tools are not typically shipped in the production runtime image beyond what Next bundles for build.

---

## 3. Important transitive / bundling notes

| Package | License | Role | Concern | Status |
|---------|---------|------|---------|--------|
| Geist / Geist Mono (`next/font/google`) | **OFL-1.1** | UI fonts | Keep OFL + copyright with font distribution; reserved name “Geist” | **WARNING** (compliance, not blocker) |
| `sharp` (optional Next) | Apache-2.0 | Image opt | Optional | **PASS** |
| `@img/sharp-libvips-*` | **LGPL-3.0-or-later** | Optional native | Weak copyleft; include notices if redistributing binaries; does not force app off Apache-2.0 | **WARNING** |
| `caniuse-lite` | CC-BY-4.0 | browserslist | Attribution | **WARNING** |
| `axe-core` | MPL-2.0 | ESLint a11y (dev) | Dev path | **PASS** for app redistribution |
| `busboy` / `streamsearch` | MIT (LICENSE file; missing package.json field) | Next multipart | Document from LICENSE | **PASS** |

**No GPL, AGPL, SSPL, BUSL, or commercial UNLICENSED packages found** in the scanned dependency tree.

### GPL/AGPL guidance

None present. If a future GPL CLI tool is added as a **separate** process (not linked into the app), evaluate distribution separately. Linked/bundled GPL into the Node app would require careful review.

---

## 4. Fonts and assets

| Item | License | Action |
|------|---------|--------|
| Geist / Geist Mono | OFL-1.1 | Include in NOTICE; do not sell fonts alone |
| Default `public/*.svg` | Next.js defaults | Retain upstream notice via Next MIT |
| Custom logos/screenshots | N/A until added | Ensure original or licensed before publish |

---

## 5. Recommended NOTICE contents

When applying Apache-2.0:

1. RackPatch copyright line  
2. Summary of MIT/BSD/ISC/Apache third-party packages (or pointer to `node_modules` licenses)  
3. Geist OFL-1.1 copyright and OFL text or link  
4. Optional sharp/libvips LGPL notice if Docker image includes those binaries  

---

## 6. Compatibility assessment

| Category | Status |
|----------|--------|
| Runtime direct deps | **PASS** |
| Prisma / Better Auth / Next / React | **PASS** |
| Fonts | **PASS** with OFL conditions |
| Optional sharp/libvips | **PASS** with LGPL notice if shipped |
| Blockers for Apache-2.0 OSS release | **None found** |

---

## 7. Recommended actions before public release

1. Add root `LICENSE` (Apache-2.0).  
2. Add `NOTICE` with third-party + font attributions.  
3. Set `"license": "Apache-2.0"` in `package.json`.  
4. Reconsider `"private": true` when intentionally publishing.  
5. Document OFL font use in SECURITY/README if helpful.  
