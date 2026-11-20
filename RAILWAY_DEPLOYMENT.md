# Railway Deployment — RackPatch

**Do not create billable resources without maintainer approval.**

## Architecture

- **Service A:** RackPatch web (Dockerfile / Next.js standalone)
- **Service B:** Railway PostgreSQL
- Data persists in PostgreSQL only (no required Redis/object storage for v1)

## Steps

1. Push this repository to GitHub (keep **private** until you approve public release).
2. In Railway: New Project → Deploy from GitHub → select this repo.
3. Add **PostgreSQL** plugin/service.
4. On the web service, set a **variable reference** for `DATABASE_URL` from Postgres.
5. Set required variables (see [RAILWAY_ENVIRONMENT.md](RAILWAY_ENVIRONMENT.md)).
6. Ensure `railway.toml` pre-deploy runs `prisma migrate deploy` (or set the same pre-deploy command in the UI).
7. Generate a public HTTPS domain.
8. Smoke test: `GET https://<domain>/api/health`

## Production safety

- `ENABLE_DEV_LOGIN` must be unset/false (app refuses to start if enabled in production).
- Do not set `SEED_DEMO=true` on a database with customer data.
- Community Edition: leave `HOSTED_SAAS` unset. Hosted SaaS product: set `HOSTED_SAAS=true`.

## Local production-like check (PowerShell)

```powershell
docker compose up -d
copy .env.example .env
# Edit .env: strong BETTER_AUTH_SECRET; ENABLE_DEV_LOGIN=true only for local
npm ci
npx prisma migrate deploy
npm run build
$env:NODE_ENV="production"; $env:ENABLE_DEV_LOGIN=""; npm start
```

Then open `http://localhost:3000/api/health`.
