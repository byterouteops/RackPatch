# Railway Template — Preparation (not published)

**Template name:** RackPatch — Data Center Cabling Verification

**Status:** Draft configuration only. **Not published** to the Railway marketplace.

## Services

1. RackPatch web application (this repo / Dockerfile)
2. PostgreSQL

## Description (marketplace draft)

Deploy RackPatch, a data center cabling management application for importing cable plans, tracking installations, comparing Cisco NX-OS LLDP observations, detecting mismatched connections, and generating handover reports.

## Required variables (no secrets embedded)

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Railway Postgres reference |
| `BETTER_AUTH_SECRET` | Generate (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Public HTTPS URL of the web service |
| `NEXT_PUBLIC_APP_URL` | Same public URL |
| `ENABLE_DEV_LOGIN` | Unset / false |
| `HOSTED_SAAS` | Unset for Community Edition |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional magic-link email |
| `PLATFORM_ADMIN_EMAILS` | Optional |
| `SEED_DEMO` | Optional empty-lab seed only |

## Kickbacks

Eligibility requires a **published** marketplace template. Rates change — see https://docs.railway.com/templates/kickbacks before promising earnings.

## Publication gate

Requires explicit maintainer approval after a successful fresh template deploy test.
