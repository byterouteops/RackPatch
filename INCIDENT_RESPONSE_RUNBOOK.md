# Incident response runbook (draft)

1. Identify impact (auth down, DB down, data exposure).
2. Preserve logs; do not paste secrets into tickets.
3. If suspected breach: rotate `BETTER_AUTH_SECRET`, DB credentials, Resend keys; force session invalidation by secret rotation.
4. For DB corruption: restore disposable copy first; promote only after checks.
5. Security vulnerabilities: follow SECURITY.md (private report).
6. Communicate status to operators; no public claims until verified.
