# FINAL TEST EXECUTION REPORT

**Date:** 2026-11-21  
**Host:** Windows local + prior Railway smoke  
**Environment:** Node 20+, local Postgres `rackpatch`

| Command | Exit | Time | Result |
|---------|------|------|--------|
| `npm test` (vitest) | 0 | ~2.9s | 37/37 passed (9 files) |
| `npx tsc --noEmit` | 0 | ~4.1s | Clean |
| `npx next lint` | 0 | ~4.3s | No ESLint errors (deprecation notice only) |
| `npm run build` | 0 | ~44.9s | Production build OK; `/share/handover/[token]` included |
| `npx prisma migrate status` | 0 | — | 3 migrations; schema up to date locally |
| `npm audit` (all) | 1 | ~8.5s | See FINAL_SECURITY_AUDIT (includes devDeps) |
| `npm audit --omit=dev` | 1 | ~5s | Still reports next/postcss (+ tinypool via vitest tree); see FINAL_SECURITY_AUDIT |
| Docker image build | — | — | Docker CLI present; full image rebuild NOT re-run this pass (Railway builds on deploy) |
| 10k cable perf | — | — | **NOT TESTED** — no fabricated numbers |

## Vitest files

bootstrap, fix-playbook, normalize, plan-import, demo-e2e, neighbor-evidence, lldp-match, permission-boundaries, diff-authz.
