# RackPatch — Data Center Cabling Verification

Open-source Community Edition (Apache 2.0) for plan → install → neighbor evidence → exceptions → handover.

## What you get

- Next.js web app + PostgreSQL
- First-run administrator bootstrap (no default password)
- CSV cable plan import
- Multi-vendor neighbor evidence: Cisco NX-OS/IOS-XE LLDP, Cisco CDP, Arista EOS LLDP, Juniper Junos LLDP
- Swapped-pair detection and handover snapshots

## After deploy

1. Open the public URL → `/sign-in`
2. Create the first administrator
3. Create a workspace + project and import a plan CSV
4. Optional: set `RESEND_API_KEY` and `EMAIL_FROM` for magic-link email to other operators

## Required variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Reference `${{Postgres.DATABASE_URL}}` |
| `BETTER_AUTH_SECRET` | Use `${{secret()}}` (32+ chars) |
| `BETTER_AUTH_URL` | Public HTTPS URL of the web service |
| `NEXT_PUBLIC_APP_URL` | Same as `BETTER_AUTH_URL` |
| `NODE_ENV` | `production` |

Do **not** set `ENABLE_DEV_LOGIN` in production.

## Source

https://github.com/byterouteops/RackPatch
