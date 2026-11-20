# Security Policy

## Supported versions

Security fixes are accepted against the latest `main` / release branch of RackPatch Community Edition.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email the maintainer privately (see repository owner contact / GitHub security advisories when enabled) with:

- Description of the issue
- Steps to reproduce
- Affected versions / commit if known
- Any proof-of-concept (non-destructive)

Please allow reasonable time for a fix before public disclosure.

## Scope

In scope examples:

- Authentication / session bypass
- Cross-workspace authorization failures
- Secret leakage in logs or responses
- Unsafe handling of uploaded CSV / LLDP text (injection, path traversal)

Out of scope examples:

- Denial of service against public demo without auth
- Issues requiring physical access to a self-hoster’s server
- Social engineering of end users

## Self-host hardening reminders

- Never set `ENABLE_DEV_LOGIN=true` in production (startup refuses).
- Leave `HOSTED_SAAS` unset/false for Community Edition; set only on official hosted SaaS.
- Use a strong `BETTER_AUTH_SECRET`.
- Configure Resend (or another email path) for magic links in production.
- Keep PostgreSQL private to the app network.
