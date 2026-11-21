# FINAL DEPLOYMENT VALIDATION

**Date:** 2026-11-21

| Surface | Status | Evidence |
|---------|--------|----------|
| Local `npm run build` | PASS | Exit 0 ~45s |
| Dockerfile | CONFIG PASS | Multi-stage; Railway builds |
| Local Docker rebuild this pass | NOT RE-RUN | Docker CLI present; image built on Railway |
| `railway.toml` | PASS | Dockerfile builder; `preDeployCommand` migrate; `/api/ready` |
| Live smoke (v0.1) | PASS | web Online; ready 200; admin session; swap exceptions |
| v0.2 deploy | THIS PASS | Push → Railway redeploy → migrate shareToken |
| Env vars smoke | PASS | DATABASE_URL, BETTER_AUTH_*, APP URLs, RESEND_*, EMAIL_FROM; no ENABLE_DEV_LOGIN |
| Persistence | PASS | Postgres volume; data survived prior redeploys |
| Customer-owned deploy | READY | Marketplace template `rackpatch` |

## Required variables (customer)

See `RAILWAY_ENVIRONMENT.md` / `docs/marketplace/TEMPLATE_README.md`.

Do **not** set `ENABLE_DEV_LOGIN` in production.
