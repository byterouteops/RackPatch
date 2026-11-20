# Production architecture (v1)

```text
[Browser] --HTTPS--> [RackPatch Next.js standalone]
                              |
                              v
                        [PostgreSQL]
```

**SPOFs:** single web process; single Postgres. No HA in default Compose/Railway template.

**Durable state:** Postgres only (plans, runtime, LLDP text, findings, sessions, audit).

**Auth:** Better Auth DB sessions; app routes gated by `(app)/layout`; mutations via server actions + `requireProjectAccess`.

**Deploy:** Dockerfile multi-stage non-root; Railway pre-deploy `prisma migrate deploy`; health `/api/health` (see also `/api/ready`).
