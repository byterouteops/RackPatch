# RackPatch — Security Release Checklist

**Audit date:** 2026-11-21  
**Public release readiness:** **NO-GO** until blockers cleared.

Statuses: **PASS** | **WARNING** | **BLOCKED** | **NOT VERIFIED**

---

## Authentication and sessions

| Check | Status | Notes |
|-------|--------|-------|
| Database-backed sessions (Better Auth) | **PASS** | Prisma models Session/Account/User |
| Production refuses `ENABLE_DEV_LOGIN` | **PASS** | `assertProductionSafety()` + instrumentation + health |
| Magic link / optional Resend | **PASS** | Configurable; console fallback in dev |
| Secure cookies in production | **PASS** / **NOT VERIFIED** in live HTTPS | Better Auth defaults; verify on Railway HTTPS |
| No universal default admin account | **PASS** | Platform admins via `PLATFORM_ADMIN_EMAILS` |

## Authorization

| Check | Status | Notes |
|-------|--------|-------|
| Workspace/project membership checks | **PASS** | `getProjectAccess` / `requireProjectAccess` |
| Cross-workspace denial tests exist | **PASS** | `scripts/authz-cross-workspace.ts`, permission tests |
| Commercial gate for Community Edition | **BLOCKED** | Mutations require PILOT/PAID unless demo — must open for self-host OSS |

## Secrets and privacy

| Check | Status | Notes |
|-------|--------|-------|
| No live secrets in tracked source | **PASS** | Paths/categories only; values not printed |
| `.env` gitignored | **PASS** | |
| `.env.production` ignored | **WARNING** | Fix `.gitignore` |
| Git history secret scan | **NOT VERIFIED** | 0 commits; run Gitleaks after first commit |
| Invite tokens not logged in prod | **WARNING** | Team page `console.info` |
| Demo credentials gated | **WARNING** | Documented shared demo password; `SEED_DEMO` opt-in |
| Customer cabling data in fixtures | **PASS** | Synthetic only |
| Safe logging of uploads | **WARNING** | Review LLDP/CSV logs before public release |

## Input and uploads

| Check | Status | Notes |
|-------|--------|-------|
| Server-side Zod / parsing validation | **PASS** | Plan/LLDP pipelines |
| CSV size/format limits | **NOT VERIFIED** / improve in Phase 5 | Confirm limits exist and tested |
| Rate limiting present | **PASS** (model exists) | Verify coverage on auth + pilot endpoints |

## Production deploy safety

| Check | Status | Notes |
|-------|--------|-------|
| Health endpoint without secret leak | **PASS** | `/api/health` |
| Migrations non-destructive (`migrate deploy`) | **PASS** | Documented; enforce in Railway |
| Demo seed opt-in | **PASS** | `SEED_DEMO=true` |
| Dockerfile non-root user | **PASS** | `nextjs` uid 1001 |

---

## Release blockers (must fix)

1. **BLOCKED** — Apply Apache-2.0 LICENSE + NOTICE before public source distribution.  
2. **BLOCKED** — Community Edition must not require payment activation for core mutations.  
3. **BLOCKED** — Add CI (lint, typecheck, test, build).  
4. **BLOCKED** — Establish git history + run secret scan before making repository public.  

## Soft issues (fix before or with first public tag)

1. Expand `.gitignore` for `.env.*` (keep `!.env.example`).  
2. Remove or gate invite-token logging.  
3. Install Gitleaks in CI.  
4. Confirm CSV upload limits under load tests.  
5. Add `railway.toml` pre-deploy migrate when preparing Railway template.  

---

## Pre-public checklist (operator)

- [ ] LICENSE + NOTICE committed  
- [ ] Community Edition gate policy implemented  
- [ ] `.gitignore` env fix  
- [ ] Invite logging fixed  
- [ ] CI green on private remote  
- [ ] Gitleaks clean on all commits  
- [ ] No `.env` in history  
- [ ] Demo seed never run against shared prod DB  
- [ ] Explicit approval before making GitHub public  
- [ ] Explicit approval before Railway marketplace publish  

---

## Final recommendation

**NO-GO** for public release until release blockers above are remediated and re-verified with evidence (lint/typecheck/tests/build + secret scan).
