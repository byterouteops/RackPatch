# RackPatch

Know which cables are right before you hand over the rack.

**License:** [Apache License 2.0](LICENSE) — see also [NOTICE](NOTICE).  
**Creator:** K G Pramod / VEX-NX  
**About:** [/about](/about) in a running instance.

RackPatch is an open-source Community Edition for data center deployment leads, network integrators, and installation contractors to plan, install, verify, and hand over physical cabling.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/rackpatch)

**Template:** [railway.com/template/rackpatch](https://railway.com/template/rackpatch)

**Self-host:** core workflows work without payment activation (`HOSTED_SAAS` unset/false).  
**Optional services:** assisted pilot / hosted SaaS may charge **USD $299 per installation project** — that is a service fee, not a mandatory software license.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Better Auth (magic links; optional development login)
- Zod validation, `csv-parse`, Vitest

## Local setup

### Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL)

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Configure environment

```bash
cp .env.example .env
```

Defaults match Docker Compose. Set a strong `BETTER_AUTH_SECRET` before any shared deploy.

### 3. Install, migrate, run

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Development login

With `ENABLE_DEV_LOGIN=true` (local only), the sign-in page accepts email/password registration and login via Better Auth. **Production refuses to start if development login is enabled.**

### Demo seed (opt-in, synthetic)

```bash
set SEED_DEMO=true
npm run seed:demo
```

On Unix: `SEED_DEMO=true npm run seed:demo`.

This creates a **synthetic** two-leaf / eight-server lab. It never overwrites an existing demo workspace. Public `/demo` is read-only synthetic data.

Demo users (after seed; development login password `password123`):

- `lead@demo.rackpatch.local`
- `tech@demo.rackpatch.local`
- `verifier@demo.rackpatch.local`
- `admin@rackpatch.local` (listed in `PLATFORM_ADMIN_EMAILS`)

## Demo walkthrough (≈3 minutes)

1. Sign in as lead (or use seeded demo project).
2. Open **Plan** and publish `fixtures/demo-cables.csv` (or use seeded revision).
3. On a phone-sized view, open cables **C-201** and **C-202**, mark **Installed**.
4. Open **LLDP**, paste `fixtures/demo-lldp-leaf02.txt`, map source device to **Leaf-02**, import.
5. Confirm **Exceptions** shows both swapped links with expected vs observed ports.
6. Confirm **C-203** (installed, no usable LLDP) remains **Awaiting verification**.
7. Attempt physical verify as the installer → denied; use a different user.
8. Create a **Handover** snapshot and print/save PDF; export CSV.

Buyer pitch: both swapped cables can be “up”; RackPatch shows exactly which two ports to fix.

## Supported LLDP format (v1)

Cisco NX-OS style text from:

```text
show lldp neighbors detail
```

Required fields per neighbor block:

- `Local Port id:`
- `Port id:` (remote)
- `System Name:` (remote)

Blocks typically begin with `Chassis id:` and may be separated by dashes. Fixtures: `fixtures/demo-lldp-leaf01.txt`, `fixtures/demo-lldp-leaf02.txt`.

Unsupported in v1: other vendors, JSON APIs, live switch access.

## Commercial status

### Community Edition / self-host (default)

Leave `HOSTED_SAAS` unset or `false`. Owners and project members can import, install, verify, and export without PILOT/PAID activation.

### Hosted SaaS (`HOSTED_SAAS=true`)

| Status | Public demo | Create project shell | Import / install / verify / handover export |
|--------|-------------|----------------------|-----------------------------------------------|
| NONE   | Yes         | Yes (owner)          | No                                            |
| PILOT  | Yes         | Yes                  | Yes                                           |
| PAID   | Yes         | Yes                  | Yes                                           |
| Demo project (`isDemo`) | Yes | n/a | Yes (synthetic only) |

Activate after external invoice (hosted SaaS only):

```bash
npx tsx scripts/activate-project.ts --projectId=<id> --status=PAID --note="Invoice 1001"
```

Or use **Admin** when signed in as an email listed in `PLATFORM_ADMIN_EMAILS`.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run db:migrate
npm run db:deploy
npm run seed:demo
npm run admin:activate -- --projectId=<id> --status=PAID
```

## Railway deployment

Verified against Railway’s Next.js + Postgres guide (Dockerfile standalone build, `DATABASE_URL` reference variable, pre-deploy migrations).

1. Push this repo to a **private** GitHub repository.
2. Create a Railway project → **Deploy from GitHub**.
3. Add **PostgreSQL**. On the web service, add a **reference variable** `DATABASE_URL` from Postgres.
4. Set variables:

| Variable | Notes |
|----------|--------|
| `BETTER_AUTH_SECRET` | Long random secret |
| `BETTER_AUTH_URL` | Public `https://…` URL |
| `ENABLE_DEV_LOGIN` | Must be `false` or unset |
| `PLATFORM_ADMIN_EMAILS` | Your admin email(s) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional magic-link email |
| `PILOT_NOTIFY_EMAIL` | Optional |
| `SEED_DEMO` | Do **not** set in production unless intentionally seeding empty DB |

5. **Settings → Deploy → Pre-deploy Command:** `npx prisma migrate deploy`
6. Generate a public domain. App listens on Railway `PORT` via standalone `HOSTNAME=0.0.0.0`.
7. Smoke test: `GET /api/health` → `{ "ok": true }`, open `/` and `/demo`.

Do not run `SEED_DEMO` against a database that already has customer workspaces.

## Data protection

- Session cookies via Better Auth; authorize on the server from the session user + DB memberships.
- Uploads treated as text; type/size/row limits enforced; content never executed.
- Logs must not include raw customer uploads or secrets.
- Safe CSV escaping for spreadsheet formulas.
- Workspace deletion: contact the operator with workspace id (cascading delete). See `DECISIONS.md`.

## Tests

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Targeted coverage: CSV importer, interface normalization, endpoint matching, conflicting evidence, commercial gating, revision carry-forward, demo swap detection.
