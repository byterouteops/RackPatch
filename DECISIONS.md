# RackPatch implementation decisions

## Stack

- **Next.js App Router + Prisma + PostgreSQL** as the single source of truth for business data.
- **Better Auth** with database sessions and magic-link email. Development email/password login is gated by `ENABLE_DEV_LOGIN` and refused at startup when `NODE_ENV=production`.
- **csv-parse** for CSV (quoted fields, BOM, CRLF). Parsers and matchers live under `src/lib` with no UI imports.
- **DB-backed rate limits** (`RateLimitBucket`) so limits work across Railway instances without Redis.

## Authorization

- Workspace **Owner** sees all workspace projects.
- **Lead** / **Technician** require explicit `ProjectMembership`.
- Invitations are email-bound, hashed, single-use, expiring; acceptance checks the authenticated email.
- Commercial mutations (import, install writes, verify, export) require `PILOT` or `PAID` (demo projects exempt). Creating an empty project shell is allowed for owners so an admin can activate after external payment.
- Platform admins are configured via `PLATFORM_ADMIN_EMAILS`. Customers cannot self-activate.

## Verification

- LLDP: Cisco NX-OS `show lldp neighbors detail` only in v1 (see README).
- Missing LLDP ⇒ **Awaiting verification**, never “cable absent”.
- Conflicting observations ⇒ **Needs review**; never silently pick one.
- Newer import for one switch replaces that switch’s observations only.
- Physical verification must be a different person from the recorded installer.
- Acknowledgment leaves discrepancies visible; close only via new evidence or superseding revision.

## Carry-forward

Installation status carries to a new revision only when **cable ID and both physical endpoints** are unchanged. Modified endpoints require fresh verification.

## Limits (v1)

- No live device access, credentials, discovery, config push, or AI verification.
- No fan-out / patch-panel path tracing; breakout lanes only when explicitly distinct endpoints.
- Manual invoicing only (no Stripe / Railway marketplace billing).
- Demo dataset is synthetic and labeled as such.

## Data deletion

Workspace owners can request deletion by contacting the operator with the workspace id. Operators delete the workspace row (cascades projects, evidence, audits). Document retention for pilot requests may be kept separately for sales follow-up unless the requester asks for erasure.
